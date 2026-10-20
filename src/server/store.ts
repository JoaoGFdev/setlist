import { and, asc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Provider } from '../../shared/types';
import { createDb } from '../db';
import { appDocuments, connectedAccounts, operationLeases } from '../db/schema';

export interface Credentials {
  access_token: string;
  refresh_token?: string;
  expiresAt: number;
  account: { id: string; name: string };
}

const DEFAULT_LEASE_TTL_MS = 30_000;
const MAX_SQLITE_BINDINGS = 90;
const WRITE_BINDINGS_PER_DOCUMENT = 5;
const DOCUMENTS_PER_BATCH = Math.floor(MAX_SQLITE_BINDINGS / WRITE_BINDINGS_PER_DOCUMENT);
const DATABASE_NOW_SQL = "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be base64 encoded');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function expiresAtOf(value: unknown): number | null {
  if (!value || typeof value !== 'object' || !('expiresAt' in value)) return null;
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) ? expiresAt : null;
}

function escapeLikePrefix(prefix: string): string {
  return `${prefix.replace(/[!%_]/g, '!$&')}%`;
}

export class Store {
  private readonly db;
  private readonly database: D1Database;
  private readonly encryptionKey: Promise<CryptoKey>;
  private readonly activeLeases = new Map<string, string>();

  constructor(db: D1Database, private readonly userId: string, encryptionKeyBase64: string) {
    if (!userId) throw new Error('A userId is required');
    const rawKey = fromBase64(encryptionKeyBase64);
    if (rawKey.byteLength !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
    this.db = createDb(db);
    this.database = db;
    this.encryptionKey = crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const now = Date.now();
    const [row] = await this.db.select({ value: appDocuments.value, expiresAt: appDocuments.expiresAt })
      .from(appDocuments)
      .where(and(eq(appDocuments.userId, this.userId), eq(appDocuments.key, key)))
      .limit(1);
    if (!row) return undefined;
    if (row.expiresAt !== null && row.expiresAt <= now) {
      await this.delete(key);
      return undefined;
    }
    return JSON.parse(row.value) as T;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.setMany([{ key, value }]);
  }

  async setMany(entries: Array<{ key: string; value: unknown }>): Promise<void> {
    if (entries.length === 0) return;
    const now = Date.now();
    for (let offset = 0; offset < entries.length; offset += DOCUMENTS_PER_BATCH) {
      const chunk = entries.slice(offset, offset + DOCUMENTS_PER_BATCH);
      const lease = this.currentLease();
      if (lease) {
        await this.setManyFenced(chunk, now, lease.name, lease.token);
        continue;
      }
      await this.db.insert(appDocuments).values(chunk.map(({ key, value }) => ({
        userId: this.userId,
        key,
        value: JSON.stringify(value),
        updatedAt: now,
        expiresAt: expiresAtOf(value),
      }))).onConflictDoUpdate({
        target: [appDocuments.userId, appDocuments.key],
        set: {
          value: sql`excluded.value`,
          updatedAt: now,
          expiresAt: sql`excluded.expires_at`,
        },
      });
    }
  }

  async delete(key: string): Promise<void> {
    const lease = this.currentLease();
    if (lease) {
      const result = await this.database.prepare(`
        DELETE FROM app_documents WHERE user_id = ? AND key = ?
          AND EXISTS (SELECT 1 FROM operation_leases
            WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
      `).bind(this.userId, key, this.userId, lease.name, lease.token).run();
      if (result.meta.changes === 0) await this.assertLease(lease.name, lease.token);
      return;
    }
    await this.db.delete(appDocuments).where(and(eq(appDocuments.userId, this.userId), eq(appDocuments.key, key)));
  }

  async deleteWorkspaceDocuments(name: string, token: string): Promise<void> {
    const result = await this.database.prepare(`
      DELETE FROM app_documents WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM operation_leases
          WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
    `).bind(this.userId, this.userId, name, token).run();
    if (result.meta.changes === 0) await this.assertLease(name, token);
  }

  async list<T>(prefix: string): Promise<T[]> {
    const now = Date.now();
    const pattern = escapeLikePrefix(prefix);
    const rows = await this.db.select({ key: appDocuments.key, value: appDocuments.value })
      .from(appDocuments)
      .where(and(
        eq(appDocuments.userId, this.userId),
        gte(appDocuments.key, prefix),
        lt(appDocuments.key, `${prefix}\uffff`),
        sql`substr(${appDocuments.key}, 1, length(${prefix})) = ${prefix}`,
        sql`${appDocuments.key} LIKE ${pattern} ESCAPE '!'`,
        or(isNull(appDocuments.expiresAt), sql`${appDocuments.expiresAt} > ${now}`),
      ))
      .orderBy(asc(appDocuments.key));
    await this.deleteExpiredPrefix(prefix, pattern, now);
    return rows.map(({ value }) => JSON.parse(value) as T);
  }

  async credentials(provider: Provider): Promise<Credentials | undefined> {
    const [row] = await this.db.select({ credentials: connectedAccounts.credentials })
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, this.userId), eq(connectedAccounts.provider, provider)))
      .limit(1);
    if (!row) return undefined;
    try {
      const envelope = JSON.parse(row.credentials) as { version: number; iv: string; ciphertext: string };
      if (envelope.version !== 1) throw new Error('Unsupported credential encryption version');
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(envelope.iv), additionalData: this.credentialsAad(provider) },
        await this.encryptionKey,
        fromBase64(envelope.ciphertext),
      );
      return JSON.parse(new TextDecoder().decode(plaintext)) as Credentials;
    } catch {
      throw new Error('Stored credentials could not be authenticated or decrypted');
    }
  }

  async saveCredentials(provider: Provider, value: Credentials): Promise<void> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: this.credentialsAad(provider) },
      await this.encryptionKey,
      plaintext,
    );
    const lease = this.currentLease();
    if (lease) {
      const credentials = JSON.stringify({ version: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });
      const result = await this.database.prepare(`
        INSERT INTO connected_accounts (user_id, provider, credentials, updated_at)
        SELECT ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM operation_leases
          WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
        ON CONFLICT(user_id, provider) DO UPDATE SET
          credentials = excluded.credentials,
          updated_at = excluded.updated_at
        WHERE EXISTS (SELECT 1 FROM operation_leases
          WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
      `).bind(
        this.userId, provider, credentials, Date.now(),
        this.userId, lease.name, lease.token,
        this.userId, lease.name, lease.token,
      ).run();
      if (result.meta.changes === 0) throw new LeaseLostError(lease.name);
      return;
    }
    await this.db.insert(connectedAccounts).values({
      userId: this.userId,
      provider,
      credentials: JSON.stringify({ version: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) }),
      updatedAt: Date.now(),
    }).onConflictDoUpdate({
      target: [connectedAccounts.userId, connectedAccounts.provider],
      set: { credentials: sql`excluded.credentials`, updatedAt: Date.now() },
    });
  }

  async deleteCredentials(provider: Provider): Promise<void> {
    const lease = this.currentLease();
    if (lease) {
      const result = await this.database.prepare(`
        DELETE FROM connected_accounts WHERE user_id = ? AND provider = ?
          AND EXISTS (SELECT 1 FROM operation_leases
            WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
      `).bind(this.userId, provider, this.userId, lease.name, lease.token).run();
      if (result.meta.changes === 0) await this.assertLease(lease.name, lease.token);
      return;
    }
    await this.db.delete(connectedAccounts).where(and(
      eq(connectedAccounts.userId, this.userId), eq(connectedAccounts.provider, provider),
    ));
  }

  async acquireLease(name: string, ttlMs = DEFAULT_LEASE_TTL_MS): Promise<string | null> {
    this.assertTtl(ttlMs);
    const token = crypto.randomUUID();
    const result = await this.db.run(sql`
      INSERT INTO operation_leases (user_id, name, token, expires_at)
      VALUES (${this.userId}, ${name}, ${token}, ${sql.raw(DATABASE_NOW_SQL)} + ${ttlMs})
      ON CONFLICT(user_id, name) DO UPDATE SET
        token = excluded.token,
        expires_at = ${sql.raw(DATABASE_NOW_SQL)} + excluded.expires_at
      WHERE operation_leases.expires_at <= ${sql.raw(DATABASE_NOW_SQL)}
    `);
    if (result.meta.changes > 0) {
      this.activeLeases.set(name, token);
      return token;
    }
    return null;
  }

  async renewLease(name: string, token: string, ttlMs = DEFAULT_LEASE_TTL_MS): Promise<boolean> {
    this.assertTtl(ttlMs);
    const result = await this.db.run(sql`
      UPDATE operation_leases SET expires_at = ${sql.raw(DATABASE_NOW_SQL)} + ${ttlMs}
      WHERE user_id = ${this.userId} AND name = ${name} AND token = ${token}
        AND expires_at > ${sql.raw(DATABASE_NOW_SQL)}
    `);
    return result.meta.changes > 0;
  }

  async ownsLease(name: string, token: string): Promise<boolean> {
    const [row] = await this.db.select({ token: operationLeases.token })
      .from(operationLeases)
      .where(and(
        eq(operationLeases.userId, this.userId),
        eq(operationLeases.name, name),
        eq(operationLeases.token, token),
        sql`${operationLeases.expiresAt} > ${sql.raw(DATABASE_NOW_SQL)}`,
      )).limit(1);
    return Boolean(row);
  }

  async assertLease(name: string, token: string): Promise<void> {
    if (!await this.ownsLease(name, token)) {
      throw new LeaseLostError(name);
    }
  }

  async releaseLease(name: string, token: string): Promise<void> {
    await this.db.delete(operationLeases).where(and(
      eq(operationLeases.userId, this.userId),
      eq(operationLeases.name, name),
      eq(operationLeases.token, token),
    ));
    if (this.activeLeases.get(name) === token) this.activeLeases.delete(name);
  }

  private async setManyFenced(
    entries: Array<{ key: string; value: unknown }>,
    now: number,
    name: string,
    token: string,
  ): Promise<void> {
    const values = entries.map(({ key, value }) => {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error(`Document "${key}" is not JSON serializable`);
      return [this.userId, key, serialized, now, expiresAtOf(value)];
    });
    const tuples = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const leaseGuard = `SELECT 1 FROM operation_leases WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL}`;
    const result = await this.database.prepare(`
      WITH incoming(user_id, key, value, updated_at, expires_at) AS (VALUES ${tuples})
      INSERT INTO app_documents (user_id, key, value, updated_at, expires_at)
      SELECT user_id, key, value, updated_at, expires_at FROM incoming
      WHERE EXISTS (${leaseGuard})
      ON CONFLICT(user_id, key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at,
        expires_at = excluded.expires_at
      WHERE EXISTS (${leaseGuard})
    `).bind(
      ...values.flat(),
      this.userId, name, token,
      this.userId, name, token,
    ).run();
    if (result.meta.changes !== entries.length) throw new LeaseLostError(name);
  }

  private async deleteExpiredPrefix(prefix: string, pattern: string, now: number): Promise<void> {
    const lease = this.currentLease();
    const constraints = `user_id = ? AND key >= ? AND key < ?
      AND substr(key, 1, length(?)) = ? AND key LIKE ? ESCAPE '!'
      AND expires_at IS NOT NULL AND expires_at <= ?`;
    const params = [this.userId, prefix, `${prefix}\uffff`, prefix, prefix, pattern, now];
    if (lease) {
      const result = await this.database.prepare(`
        DELETE FROM app_documents WHERE ${constraints}
          AND EXISTS (SELECT 1 FROM operation_leases
            WHERE user_id = ? AND name = ? AND token = ? AND expires_at > ${DATABASE_NOW_SQL})
      `).bind(...params, this.userId, lease.name, lease.token).run();
      if (result.meta.changes === 0) await this.assertLease(lease.name, lease.token);
      return;
    }
    await this.database.prepare(`DELETE FROM app_documents WHERE ${constraints}`).bind(...params).run();
  }

  private currentLease(): { name: string; token: string } | undefined {
    const latest = [...this.activeLeases.entries()].at(-1);
    return latest ? { name: latest[0], token: latest[1] } : undefined;
  }

  private assertTtl(ttlMs: number): void {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('Lease TTL must be a positive safe integer');
  }

  private credentialsAad(provider: Provider): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(new TextEncoder().encode(`connected_accounts\0${this.userId}\0${provider}\0v1`));
  }
}

export class LeaseLostError extends Error {
  readonly status = 409;

  constructor(name: string) {
    super(`Operation lease "${name}" is no longer owned by this request`);
    this.name = 'LeaseLostError';
  }
}
