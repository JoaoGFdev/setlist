import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '../components/legal-layout';

export const Route = createFileRoute('/terms-of-service')({
  head: () => ({ meta: [{ title: 'Terms of Service — Setlist' }, { name: 'description', content: 'Terms for using Setlist to review and move playlists between Spotify and YouTube.' }] }),
  component: TermsOfService,
});

function TermsOfService() {
  return <LegalLayout title="Terms of Service">
    <p>These Terms govern your use of Setlist at <a href="https://setlist.joaogf.dev">setlist.joaogf.dev</a>. By using Setlist, you agree to these Terms and the <a href="/privacy-policy">Privacy Policy</a>. If you do not agree, do not use the service.</p>

    <h2>What Setlist does</h2>
    <p>Setlist helps you connect your own Spotify and YouTube accounts, review track-match suggestions, and create or update a playlist on the destination service you select. Setlist currently does not charge a subscription fee. Spotify and Google may impose their own limits, eligibility rules, and charges.</p>

    <h2>Your accounts and permissions</h2>
    <p>You must be allowed to use Setlist and the connected services where you live. You are responsible for your Setlist sign-in and for activity in your workspace. You may connect only accounts you control or are authorized to use. When you connect a music account, you authorize Setlist to access the data and perform the playlist actions described in the consent screen and Privacy Policy. You can disconnect an account in Setlist or revoke access through the provider.</p>

    <h2>Review before transferring</h2>
    <p>Setlist’s match suggestions are automated and may identify the wrong recording, version, or video. You are responsible for reviewing the proposed matches and choosing which tracks to include. Setlist creates a destination playlist only after you approve the transfer. Destination playlists are created as private when the provider supports that setting; you control their privacy and content in Spotify or YouTube afterward.</p>

    <h2>Third-party services and content</h2>
    <p>Spotify and YouTube are independent services. Setlist is not affiliated with or endorsed by Spotify or Google/YouTube. Your use of those services is governed by their terms, including the <a href="https://www.spotify.com/legal/end-user-agreement/" target="_blank" rel="noreferrer">Spotify User Agreement</a> and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>. You remain responsible for having the rights and permissions needed to access and transfer the content in your playlists.</p>

    <h2>Acceptable use</h2>
    <p>You may not use Setlist to violate another person’s rights, break a law or provider rule, interfere with the service, attempt unauthorized access, or bypass provider rate limits or security controls. You may not use Setlist to copy or distribute content when you do not have permission to do so.</p>

    <h2>Availability and changes</h2>
    <p>Setlist is provided as-is and may change, be interrupted, or become unavailable. We do not guarantee that every playlist, track, or match will be available or transferred successfully. Platform quotas, API changes, revoked permissions, and other provider conditions can affect results. You can stop using Setlist at any time. Disconnecting either music account deletes your saved transfer history and removes that account’s saved credentials.</p>

    <h2>Liability</h2>
    <p>To the extent permitted by law, Setlist is not responsible for indirect or consequential loss, or for actions taken by Spotify, Google, YouTube, or other third parties. Nothing in these Terms excludes liability that cannot be excluded under applicable law.</p>

    <h2>Changes to these Terms</h2>
    <p>We may update these Terms as the service changes. The current version will appear on this page with its effective date. Continued use after an update means you accept the updated Terms, to the extent permitted by law.</p>
  </LegalLayout>;
}
