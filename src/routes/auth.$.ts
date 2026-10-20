import { auth } from '@clerk/tanstack-react-start/server';
import { createFileRoute } from '@tanstack/react-router';
import { getAppEnv, hasClerkConfig } from '../server/env';
import { dispatchOAuth } from '../server/handler';

async function handle(request: Request): Promise<Response> {
  const env = getAppEnv();
  if (!hasClerkConfig(env)) return Response.json({ error: 'Authentication is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const userId = (await auth()).userId;
  if (!userId) return Response.json({ error: 'Sign in before connecting a music account.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return dispatchOAuth(request, env, userId);
}

export const Route = createFileRoute('/auth/$')({ server: { handlers: { GET: ({ request }: { request: Request }) => handle(request) } } });
