export interface AppEnv {
  DB: D1Database;
  APP_URL: string;
  TOKEN_ENCRYPTION_KEY: string;
  SPOTIFY_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
}

export function validateAppUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('APP_URL must be a valid origin.'); }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.origin !== value || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('APP_URL must be an HTTPS origin; HTTP is allowed only for local loopback development.');
  }
  return url.origin;
}

export function hasClerkConfig(env: AppEnv): boolean {
  return Boolean(env.CLERK_SECRET_KEY && (env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY));
}

export function clerkPublishableKey(env: AppEnv): string | undefined {
  return env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;
}
