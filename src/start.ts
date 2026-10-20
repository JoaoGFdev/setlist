import { clerkMiddleware } from '@clerk/tanstack-react-start/server';
import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import { validateAppUrl } from './server/app-env';

const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' });
const bindings = process.env as unknown as Partial<import('./server/app-env').AppEnv>;
const clerkConfigured = Boolean(bindings.CLERK_SECRET_KEY && (bindings.CLERK_PUBLISHABLE_KEY || bindings.VITE_CLERK_PUBLISHABLE_KEY));
const authorizedParty = bindings.APP_URL ? validateAppUrl(bindings.APP_URL) : undefined;

export const startInstance = createStart(() => ({
  requestMiddleware: clerkConfigured ? [csrfMiddleware, clerkMiddleware({
    secretKey: bindings.CLERK_SECRET_KEY,
    publishableKey: bindings.CLERK_PUBLISHABLE_KEY || bindings.VITE_CLERK_PUBLISHABLE_KEY,
    authorizedParties: authorizedParty ? [authorizedParty] : undefined,
  })] : [csrfMiddleware],
}));
