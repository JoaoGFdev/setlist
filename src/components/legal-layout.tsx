import type { ReactNode } from 'react';

const prose = [
  '[&_h2]:mt-8 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight',
  '[&_p]:leading-7 [&_p]:text-muted-foreground [&_p+p]:mt-3 [&_h2+p]:mt-2',
  '[&_ul]:mt-3 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_li]:leading-7 [&_li]:text-muted-foreground',
  '[&_strong]:font-medium [&_strong]:text-foreground',
  '[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-brand',
  '[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:break-words',
].join(' ');

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return <article className={`mx-auto flex w-full max-w-3xl flex-col text-sm ${prose}`}>
    <p className="text-xs font-semibold tracking-widest text-muted-foreground">SETLIST · LEGAL</p>
    <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Effective date: October 20, 2026</p>
    <div className="mt-6 flex flex-col">{children}</div>
    <p className="mt-10 border-t pt-6">Questions or requests? Email <a href="mailto:me@joaogf.dev">me@joaogf.dev</a>.</p>
  </article>;
}
