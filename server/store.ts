import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import type { Account, Provider } from '../shared/types.ts';

export interface Credentials { access_token: string; refresh_token?: string; expiresAt: number; account: Account }
export class Store {
  db: DatabaseSync;
  key: Buffer;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keyPath = join(directory, 'key');
    if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32), { mode: 0o600, flag: 'wx' });
    this.key = readFileSync(keyPath);
    this.db = new DatabaseSync(join(directory, 'bridge.sqlite'));
    chmodSync(join(directory, 'bridge.sqlite'), 0o600);
    this.db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS documents (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM documents WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) as T : undefined;
  }
  set(key: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO documents VALUES (?, ?)').run(key, JSON.stringify(value)); }
  delete(key: string) { this.db.prepare('DELETE FROM documents WHERE key = ?').run(key); }
  list<T>(prefix: string): T[] {
    return (this.db.prepare('SELECT value FROM documents WHERE key LIKE ? ORDER BY key DESC').all(`${prefix}%`) as { value: string }[]).map(row => JSON.parse(row.value));
  }
  credentials(provider: Provider): Credentials | undefined {
    const stored = this.get<string>(`account:${provider}`);
    if (!stored) return undefined;
    const [iv, tag, ciphertext] = stored.split('.').map(s => Buffer.from(s, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString());
  }
  saveCredentials(provider: Provider, value: Credentials) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    this.set(`account:${provider}`, [iv, cipher.getAuthTag(), ciphertext].map(b => b.toString('base64url')).join('.'));
  }
}
