import type { Provider } from '../../shared/types';
import { providerScopes } from '../../shared/provider-scopes';

/** Tokens stay on the server; Clerk refreshes them when this endpoint is requested. */
export async function clerkProviderToken(userId: string, provider: Provider, secretKey: string, request = fetch): Promise<string | undefined> {
  const clerkProvider = provider === 'youtube' ? 'google' : 'spotify';
  const response = await request(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/oauth_access_tokens/oauth_${clerkProvider}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Could not retrieve music-account authorization from Clerk. Please try again.');
  const payload: unknown = await response.json();
  const tokens = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
  if (!Array.isArray(tokens)) throw new Error('Clerk returned an invalid music-account authorization response.');
  for (const entry of tokens) {
    if (!entry || typeof entry !== 'object') continue;
    const token = entry as { token?: unknown; scopes?: unknown };
    const scopes = Array.isArray(token.scopes) ? token.scopes.filter((scope): scope is string => typeof scope === 'string') : [];
    const allowed = providerScopes[provider].every(scope => scopes.includes(scope))
      || (provider === 'youtube' && scopes.includes('https://www.googleapis.com/auth/youtube'));
    if (allowed && typeof token.token === 'string' && token.token) return token.token;
  }
  return undefined;
}
