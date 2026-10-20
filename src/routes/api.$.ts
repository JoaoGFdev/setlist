import { auth } from '@clerk/tanstack-react-start/server';
import { createFileRoute } from '@tanstack/react-router';
import { getAppEnv, hasClerkConfig } from '../server/env';
import { dispatchApi } from '../server/handler';

async function handle(request: Request): Promise<Response> {
  const env = getAppEnv();
  if (!hasClerkConfig(env)) return Response.json({ error: 'Authentication is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const userId = (await auth()).userId;
  if (!userId) return Response.json({ error: 'Sign in to use your transfer workspace.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return dispatchApi(request, env, userId);
}

const handler = ({ request }: { request: Request }) => handle(request);
export const Route = createFileRoute('/api/$')({ server: { handlers: { GET: handler, POST: handler, PUT: handler, PATCH: handler, DELETE: handler } } });
