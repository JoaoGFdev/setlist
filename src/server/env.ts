import { env as workerBindings } from 'cloudflare:workers';
import { validateAppUrl, type AppEnv } from './app-env';
export { clerkPublishableKey, hasClerkConfig, validateAppUrl } from './app-env';
export type { AppEnv } from './app-env';

export function getAppEnv(): AppEnv {
  const env = workerBindings as unknown as AppEnv;
  validateAppUrl(env.APP_URL);
  return env;
}
