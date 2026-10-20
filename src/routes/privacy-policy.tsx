import { createFileRoute } from '@tanstack/react-router';
import { LegalLayout } from '../components/legal-layout';

export const Route = createFileRoute('/privacy-policy')({
  head: () => ({ meta: [{ title: 'Privacy Policy — Setlist' }, { name: 'description', content: 'How Setlist collects, uses, stores, and protects information when you move playlists between Spotify and YouTube.' }] }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return <LegalLayout title="Privacy Policy">
    <p>Setlist helps you review and move playlists between Spotify and YouTube. This policy explains what information Setlist uses, why it is used, and the choices available to you.</p>

    <h2>Information we use</h2>
    <ul>
      <li><strong>Sign-in information.</strong> Clerk processes your sign-in and may provide Setlist with identifiers and basic account details, such as your email address, needed to maintain your workspace.</li>
      <li><strong>Connected music accounts.</strong> When you connect Spotify or YouTube, Setlist receives account identifiers and display names, OAuth access and refresh tokens, and the playlist and track information needed to show your library, find matches, and create a playlist you approve.</li>
      <li><strong>Workspace information.</strong> Setlist stores transfer progress, playlist and track identifiers and details, match suggestions you review, your selections, and the result of a transfer so you can review or resume your work.</li>
      <li><strong>Security and service data.</strong> Sign-in sessions, short-lived OAuth state, and basic request and error information may be processed to secure and operate the service.</li>
    </ul>

    <h2>How we use music-service data</h2>
    <p>Setlist uses Spotify data only to display and transfer playlists you choose. Its Spotify permissions include reading private and collaborative playlists and creating or editing playlists. Setlist uses YouTube data only to display your YouTube playlists, search for match suggestions, and create or update the destination playlist you approve. Its YouTube permission is the YouTube Data API scope <code>youtube.force-ssl</code>. We do not use connected music data for advertising, profiling, or selling data.</p>
    <p>Setlist requests playlist and track details from Spotify and Google/YouTube, sends searches to the selected destination service, and sends your approved playlist choices to that service to create or update the destination playlist. Match suggestions can be wrong; you review them before Setlist creates the destination playlist.</p>

    <h2>Storage and security</h2>
    <p>Setlist stores workspace records in Cloudflare D1 and runs on Cloudflare Workers. Music-account credentials are encrypted with AES-GCM before they are stored. Setlist limits access to the account that connected the service and uses short-lived, secure OAuth state cookies to complete account connections. No method of storage or transmission is completely secure.</p>

    <h2>When information is shared</h2>
    <p>Setlist does not sell your personal information. Information is shared only as needed to operate the service:</p>
    <ul>
      <li><strong>Clerk</strong> provides authentication and processes sign-in information. When you grant playlist access through a linked account, Clerk also manages its OAuth authorization and supplies access tokens to Setlist’s server for the actions you request.</li>
      <li><strong>Spotify and Google/YouTube</strong> receive the OAuth requests and API calls needed to connect your account and perform the playlist actions you request. Their own terms and privacy policies apply to their services. See <a href="https://www.spotify.com/legal/privacy-policy/" target="_blank" rel="noreferrer">Spotify’s Privacy Policy</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google’s Privacy Policy</a>.</li>
      <li><strong>Cloudflare</strong> hosts the application and database and may process technical information needed to deliver and secure the service.</li>
    </ul>
    <p>We may also disclose information if required by law or if necessary to protect the service, its users, or someone’s safety.</p>

    <h2>Retention and your choices</h2>
    <p>Music-account credentials remain stored until you disconnect that account or request deletion. Disconnecting either music account removes its saved credentials and immediately deletes your saved transfer history. You can also revoke Setlist’s access in your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions</a> or Spotify account settings; revoking access prevents further API access, and you can email us to request deletion of stored data.</p>
    <p>Transfer history and workspace records are automatically deleted no later than 30 days after a transfer is started. OAuth connection state expires after ten minutes. You may request deletion of your Setlist data, including connected-account credentials, by emailing <a href="mailto:me@joaogf.dev">me@joaogf.dev</a> from the email address associated with your account. We will verify the request and delete information we control, subject to any legal retention requirements.</p>
    <p>Disconnecting a music library stops Setlist from using its Clerk-managed authorization. The social account may remain linked for sign-in; remove it through your Setlist account settings or revoke access at the provider to remove that authorization too.</p>

    <h2>Cookies</h2>
    <p>Setlist and Clerk use essential cookies for authentication, session security, and completing music-service OAuth requests. The temporary OAuth state cookie is HTTP-only and expires after ten minutes. Setlist does not use advertising cookies.</p>

    <h2>Children</h2>
    <p>Setlist is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided information, contact us so we can review and delete it.</p>

    <h2>Changes to this policy</h2>
    <p>We may update this policy when the service or its data practices change. We will post the current version on this page and update the effective date. If a change materially affects how Google user data is used, we will provide notice and request consent where required.</p>

    <h2>YouTube API Services</h2>
    <p>Setlist’s use of information received from YouTube API Services complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements. You may revoke Setlist’s access at any time from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions</a>. Use of Setlist’s YouTube features is also subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>.</p>
  </LegalLayout>;
}
