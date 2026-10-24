import type { ReactNode } from 'react';

export function FullPageMessage({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <main className="fullpage">
      <div className="fullpage-card">
        <div className="brand-mark" aria-hidden>IS</div>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
        {children}
      </div>
    </main>
  );
}
