import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../server/store';

type TestMigration = { name: string; queries: string[] };
const testEnv = env as typeof env & { DB: D1Database; TEST_MIGRATIONS: TestMigration[] };
const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const credentials = {
  access_token: 'access-secret',
  refresh_token: 'refresh-secret',
  expiresAt: Date.now() + 60_000,
  account: { id: 'account-1', name: 'Test account' },
};

async function migrate() {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
}

function store(userId: string, encryptionKey = key) {
  return new Store(testEnv.DB, userId, encryptionKey);
}

describe('D1 Store persistence', () => {
  beforeAll(migrate);

  it('isolates documents between users, sorts prefixes, and escapes LIKE metacharacters', async () => {
    const alice = store('alice');
    const bob = store('bob');
    await alice.setMany([
      { key: 'item:x_2', value: { position: 2 } },
      { key: 'item:x_1', value: { position: 1 } },
      { key: 'item:xA1', value: { position: 99 } },
    ]);
    await bob.set('item:x_1', { position: 50 });

    expect(await alice.list<{ position: number }>('item:x_')).toEqual([{ position: 1 }, { position: 2 }]);
    expect(await bob.get<{ position: number }>('item:x_1')).toEqual({ position: 50 });
    expect(await alice.get('missing')).toBeUndefined();
    await alice.delete('item:x_1');
    expect(await alice.get('item:x_1')).toBeUndefined();
  });

  it('chunks setMany safely and ignores/cleans expired documents', async () => {
    const db = store('batch-user');
    await db.setMany(Array.from({ length: 55 }, (_, index) => ({ key: `job:${index}`, value: index })));
    expect(await db.list<number>('job:')).toHaveLength(55);
    await db.set('oauth:expired', { expiresAt: Date.now() - 1, state: 'old' });
    expect(await db.get('oauth:expired')).toBeUndefined();
    const { results: expired } = await testEnv.DB.prepare('SELECT key FROM app_documents WHERE user_id = ? AND key = ?')
      .bind('batch-user', 'oauth:expired').all();
    expect(expired).toHaveLength(0);
  });

  it('encrypts credentials, scopes them by user, and rejects tampered ciphertext', async () => {
    const alice = store('credential-alice');
    const bob = store('credential-bob');
    await alice.saveCredentials('spotify', credentials);
    expect(await alice.credentials('spotify')).toEqual(credentials);
    expect(await bob.credentials('spotify')).toBeUndefined();

    const { results: [row] } = await testEnv.DB.prepare('SELECT credentials FROM connected_accounts WHERE user_id = ? AND provider = ?')
      .bind('credential-alice', 'spotify').all<{ credentials: string }>();
    expect(row.credentials).not.toContain('access-secret');
    await testEnv.DB.prepare('INSERT INTO connected_accounts (user_id, provider, credentials, updated_at) VALUES (?, ?, ?, ?)')
      .bind('credential-bob', 'spotify', row.credentials, Date.now()).run();
    await expect(bob.credentials('spotify')).rejects.toThrow('could not be authenticated');
    await testEnv.DB.prepare('INSERT INTO connected_accounts (user_id, provider, credentials, updated_at) VALUES (?, ?, ?, ?)')
      .bind('credential-alice', 'youtube', row.credentials, Date.now()).run();
    await expect(alice.credentials('youtube')).rejects.toThrow('could not be authenticated');
    const envelope = JSON.parse(row.credentials) as { version: number; iv: string; ciphertext: string };
    const bytes = Uint8Array.from(atob(envelope.ciphertext), (character) => character.charCodeAt(0));
    bytes[bytes.length - 1] ^= 1;
    const tampered = btoa(String.fromCharCode(...bytes));
    await testEnv.DB.prepare('UPDATE connected_accounts SET credentials = ? WHERE user_id = ? AND provider = ?')
      .bind(JSON.stringify({ ...envelope, ciphertext: tampered }), 'credential-alice', 'spotify').run();
    await expect(alice.credentials('spotify')).rejects.toThrow('could not be authenticated');
    await alice.deleteCredentials('spotify');
    expect(await alice.credentials('spotify')).toBeUndefined();
  });

  it('acquires leases atomically, isolates users, expires, renews, and releases only the matching token', async () => {
    const alice = store('lease-alice');
    const other = store('lease-bob');
    const results = await Promise.all(Array.from({ length: 12 }, () => alice.acquireLease('workspace', 300)));
    const acquired = results.filter((token): token is string => token !== null);
    expect(acquired).toHaveLength(1);
    const token = acquired[0];
    expect(await alice.acquireLease('workspace')).toBeNull();
    const otherToken = await other.acquireLease('workspace');
    expect(otherToken).toBeTruthy();
    await alice.assertLease('workspace', token);
    expect(await alice.renewLease('workspace', 'wrong-token')).toBe(false);
    await alice.releaseLease('workspace', 'wrong-token');
    expect(await alice.ownsLease('workspace', token)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(await alice.ownsLease('workspace', token)).toBe(false);
    const replacement = await alice.acquireLease('workspace', 5_000);
    expect(replacement).toBeTruthy();
    await alice.releaseLease('workspace', token);
    expect(await alice.ownsLease('workspace', replacement!)).toBe(true);
    await expect(alice.assertLease('workspace', token)).rejects.toMatchObject({ status: 409 });
    await alice.releaseLease('workspace', replacement!);
  });

  it('fences a stale Store lease in the same atomic checkpoint statement', async () => {
    const userId = `fenced-user-${crypto.randomUUID()}`;
    const seed = store(userId);
    await seed.setMany([
      { key: 'job:checkpoint', value: { version: 0 } },
      { key: 'item:job-a:00000000', value: { title: 'original' } },
    ]);

    const stale = store(userId);
    const current = store(userId);
    const oldToken = await stale.acquireLease('workspace', 180);
    expect(oldToken).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 230));
    const newToken = await current.acquireLease('workspace', 5_000);
    expect(newToken).toBeTruthy();

    await current.setMany([
      { key: 'job:checkpoint', value: { version: 1, owner: 'current' } },
      { key: 'item:job-a:00000000', value: { title: 'current item' } },
    ]);
    await expect(stale.assertLease('workspace', oldToken!)).rejects.toMatchObject({ status: 409 });
    await expect(stale.setMany([
      { key: 'job:checkpoint', value: { version: 2, owner: 'stale' } },
      { key: 'item:job-a:00000000', value: { title: 'stale item' } },
    ])).rejects.toMatchObject({ status: 409 });

    const observer = store(userId);
    expect(await observer.get('job:checkpoint')).toEqual({ version: 1, owner: 'current' });
    expect(await observer.get('item:job-a:00000000')).toEqual({ title: 'current item' });
    await stale.releaseLease('workspace', oldToken!);
    expect(await current.ownsLease('workspace', newToken!)).toBe(true);
    await current.releaseLease('workspace', newToken!);
  });
});

describe('Store encryption key validation', () => {
  it('requires a persistent base64-encoded 32-byte secret', () => {
    expect(() => new Store(testEnv.DB, 'invalid', 'not-base64')).toThrow('base64 encoded');
    expect(() => new Store(testEnv.DB, 'invalid', btoa('short'))).toThrow('exactly 32 bytes');
  });
});
