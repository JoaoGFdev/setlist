import type { ReactNode } from 'react';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return <article className="legal-document">
    <p className="legal-eyebrow">SETLIST · LEGAL</p>
    <h1>{title}</h1>
    <p className="legal-updated">Effective date: October 20, 2026</p>
    {children}
    <p className="legal-contact">Questions or requests? Email <a href="mailto:me@joaogf.dev">me@joaogf.dev</a>.</p>
  </article>;
}
