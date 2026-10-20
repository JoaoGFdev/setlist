import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  define: {
    'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_ui_fixture'),
    'import.meta.env.VITE_APP_URL': JSON.stringify('http://127.0.0.1:5173'),
  },
  test: { environment: 'jsdom', include: ['src/routes/**/*.test.tsx'], restoreMocks: true, clearMocks: true },
});
