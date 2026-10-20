import { AuthenticateWithRedirectCallback } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/sso-callback')({ component: Callback });

function Callback() {
  return <AuthenticateWithRedirectCallback signInForceRedirectUrl="/" signUpForceRedirectUrl="/" />;
}
