import type { ReactNode } from 'react';
import iconUrl from '../../assets/icon.svg?url';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <header className="topbar legal-topbar">
      <a href="/" className="wordmark"><img className="brand-logo" src={iconUrl} alt="" /> Setlist</a>
      <a href="/" className="text-button">Back to Setlist</a>
    </header>
    <main className="legal-main">
      <article className="legal-document">
        <p className="legal-eyebrow">SETLIST · LEGAL</p>
        <h1>{title}</h1>
        <p className="legal-updated">Effective date: October 20, 2026</p>
        {children}
        <p className="legal-contact">Questions or requests? Email <a href="mailto:me@joaogf.dev">me@joaogf.dev</a>.</p>
      </article>
      <footer className="legal-footer"><span>© 2026 Setlist</span><span className="footer-links"><a href="/privacy-policy">Privacy Policy</a><a href="/terms-of-service">Terms of Service</a><a href="/">Home</a></span></footer>
    </main>
  </>;
}
