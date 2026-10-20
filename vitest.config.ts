import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const migrationsDirectory = fileURLToPath(new URL('./drizzle', import.meta.url));
const testWranglerConfig = fileURLToPath(new URL('./src/db/test.wrangler.jsonc', import.meta.url));

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: testWranglerConfig },
    miniflare: {
      bindings: { TEST_MIGRATIONS: await readD1Migrations(migrationsDirectory) },
    },
  }))],
  test: {
    include: ['src/db/**/*.test.ts'],
  },
});
