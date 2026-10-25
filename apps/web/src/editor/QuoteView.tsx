import { useMemo, useState } from 'react';
import { buildBom, buildQuote, finishById, fmtMm, formatInr, FINISHES, sanitizePriceList, worktopRuns, WORKTOP_FINISHES, type PriceList } from '@studio/core';
import { canAdmin, canEdit, useAuth } from '../auth/AuthProvider';
import { usePriceList, useQuotes, useSavePriceList, useSaveQuote } from '../data/quotes';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';
import { useStudio } from './store';

type Tab = 'quote' | 'bom';

function NumberCell({ value, onChange, disabled, suffix, label }: { value: number; onChange: (v: number) => void; disabled: boolean; suffix?: string; label: string }) {
  const [text, setText] = useState(String(value));
  return (
    <label className="rate-cell">
      <span>{label}</span>
      <span className="rate-inp">
        <input
          type="number"
          min={0}
          step="any"
          value={text}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const n = Number(text);
            if (Number.isFinite(n) && n >= 0) onChange(n);
            else setText(String(value));
          }}
        />
        {suffix && <span className="unit">{suffix}</span>}
      </span>
    </label>
  );
}

/** Studio rates. Admins edit and save; designers see what quotes are priced with. */
function RatesEditor({ rates, onClose }: { rates: PriceList; onClose: () => void }) {
  const { activeOrg } = useAuth();
  const admin = canAdmin(activeOrg?.role);
  const save = useSavePriceList();
  const [draft, setDraft] = useState<PriceList>(rates);
  const set = (patch: Partial<PriceList>) => setDraft((d) => sanitizePriceList({ ...d, ...patch }));
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog rates-dialog" role="dialog" aria-label="Studio rates" onClick={(e) => e.stopPropagation()}>
        <h2>Studio rates</h2>
        <p className="sub">{admin ? 'Used for every quote in this studio. Saved quotes keep the rates they were made with.' : 'Only studio admins can change rates.'}</p>
        <div className="rates-grid">
          <h3>Boards (18 mm, per 8×4 sheet)</h3>
          {FINISHES.map((f) => (
            <NumberCell key={f.id} label={f.name} suffix="₹" disabled={!admin} value={draft.boardPerSheet[f.id] ?? draft.boardDefault} onChange={(v) => set({ boardPerSheet: { ...draft.boardPerSheet, [f.id]: v } })} />
          ))}
          <NumberCell label="Back / drawer-bottom ply" suffix="₹" disabled={!admin} value={draft.backPerSheet} onChange={(v) => set({ backPerSheet: v })} />
          <NumberCell label="Edge banding, per m" suffix="₹" disabled={!admin} value={draft.edgeBandPerM} onChange={(v) => set({ edgeBandPerM: v })} />
          <h3>Worktops (per sq ft, supplied and fixed)</h3>
          {WORKTOP_FINISHES.map((f) => (
            <NumberCell key={f.id} label={f.name} suffix="₹" disabled={!admin} value={draft.worktopPerSqft[f.id] ?? 0} onChange={(v) => set({ worktopPerSqft: { ...draft.worktopPerSqft, [f.id]: v } })} />
          ))}
          <h3>Hardware (per piece)</h3>
          {Object.entries(draft.hardware).map(([name, v]) => (
            <NumberCell key={name} label={name} suffix="₹" disabled={!admin} value={v} onChange={(x) => set({ hardware: { ...draft.hardware, [name]: x } })} />
          ))}
          <h3>Labour, margin and tax</h3>
          <NumberCell label="Workshop labour" suffix="%" disabled={!admin} value={draft.labourPct} onChange={(v) => set({ labourPct: v })} />
          <NumberCell label="Installation per unit" suffix="₹" disabled={!admin} value={draft.installPerUnit} onChange={(v) => set({ installPerUnit: v })} />
          <NumberCell label="Studio margin" suffix="%" disabled={!admin} value={draft.marginPct} onChange={(v) => set({ marginPct: v })} />
          <NumberCell label="GST" suffix="%" disabled={!admin} value={draft.gstPct} onChange={(v) => set({ gstPct: v })} />
        </div>
        {save.error && <p className="field-error">{errorMessage(save.error)}</p>}
        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose}>{admin ? 'Cancel' : 'Close'}</button>
          {admin && (
            <button className="btn primary" disabled={save.isPending} onClick={() => save.mutate(draft, { onSuccess: onClose })}>
              {save.isPending ? 'Saving…' : 'Save rates'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Quote view: the client quotation (per piece, margin folded in, GST on top), the workshop BOM
 * (whole sheets, banding, worktops, hardware at cost) and saved quote snapshots.
 */
export function QuoteView() {
  const project = useStudio((s) => s.project);
  const versionNo = useStudio((s) => s.savedVersionNo);
  const { activeOrg } = useAuth();
  const editor = canEdit(activeOrg?.role);
  const priceList = usePriceList();
  const quotes = useQuotes(project.id);
  const saveQuote = useSaveQuote(project.id);
  const [tab, setTab] = useState<Tab>('quote');
  const [rates, setRates] = useState(false);
  const [notes, setNotes] = useState('Prices include manufacture, hardware, delivery and installation. Valid for 30 days from the date above. 50% advance on order, balance before installation.');
  const [saved, setSaved] = useState<string | null>(null);
  const pl = priceList.data?.rates;
  const quote = useMemo(() => (pl ? buildQuote(project, pl) : null), [project, pl]);
  const bom = useMemo(() => (pl ? buildBom(project, pl) : null), [project, pl]);
  const cuts = useMemo(() => worktopRuns(project), [project]);
  const rooms = useMemo(() => (quote ? [...new Set(quote.lines.map((l) => l.room))] : []), [quote]);
  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  if (priceList.error) return <div className="docs"><p className="field-error">{errorMessage(priceList.error)}</p></div>;
  if (!pl || !quote || !bom) return <div className="docs"><p className="field-hint">Loading rates…</p></div>;
  let n = 0;
  return (
    <div className="docs quote-view">
      <div className="docs-head">
        <h2>Quote & BOM</h2>
        <div className="seg seg-light" role="tablist" aria-label="Quote view">
          <button role="tab" aria-selected={tab === 'quote'} className={tab === 'quote' ? 'on' : ''} onClick={() => setTab('quote')}>Client quote</button>
          <button role="tab" aria-selected={tab === 'bom'} className={tab === 'bom' ? 'on' : ''} onClick={() => setTab('bom')}>Workshop BOM</button>
        </div>
        <span style={{ flex: 1 }} />
        {!priceList.data?.saved && <span className="badge draft" title="Set your studio's rates before sending quotes">Sample rates</span>}
        <button className="btn" onClick={() => setRates(true)}>{canAdmin(activeOrg?.role) ? 'Edit rates' : 'View rates'}</button>
        {editor && tab === 'quote' && (
          <button
            className="btn"
            disabled={saveQuote.isPending || !quote.lines.length}
            onClick={() => saveQuote.mutate({ quote, rates: pl, versionNo, clientName: project.client, notes }, { onSuccess: (no) => setSaved(no) })}
          >
            {saveQuote.isPending ? 'Saving…' : 'Save quote'}
          </button>
        )}
        <button className="btn primary" onClick={() => window.print()}>Print / PDF</button>
      </div>
      {saved && <p className="run-msg no-print" role="status">Saved as {saved}.</p>}
      {saveQuote.error && <p className="field-error no-print">{errorMessage(saveQuote.error)}</p>}

      {tab === 'quote' ? (
        <section className="sheet quote-sheet">
          <div className="quote-top">
            <div>
              <div className="quote-studio">{activeOrg?.orgName ?? 'Interior Studio'}</div>
              <h1>Quotation</h1>
            </div>
            <dl className="quote-meta">
              <dt>Client</dt>
              <dd>{project.client || '—'}</dd>
              <dt>Project</dt>
              <dd>{project.name}</dd>
              <dt>Date</dt>
              <dd>{today}</dd>
              <dt>Design version</dt>
              <dd>v{versionNo}</dd>
            </dl>
          </div>
          {quote.lines.length === 0 ? (
            <p className="field-hint">Add furniture to the design to build a quote.</p>
          ) : (
            <table className="quote-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item</th>
                  <th>Size W × D × H (mm)</th>
                  <th>Finish</th>
                  <th className="r">Amount</th>
                </tr>
              </thead>
              {rooms.map((room) => (
                <tbody key={room}>
                  <tr className="room-row">
                    <td colSpan={5}>{room}</td>
                  </tr>
                  {quote.lines.filter((l) => l.room === room).map((l) => (
                    <tr key={l.itemId} data-testid="quote-line">
                      <td className="num">{++n}</td>
                      <td>{l.name}</td>
                      <td className="num">{l.size}</td>
                      <td>{l.finish}</td>
                      <td className="r num">{l.amount ? formatInr(l.amount) : 'On request'}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr>
                  <td colSpan={4} className="r">Subtotal</td>
                  <td className="r num" data-testid="quote-subtotal">{formatInr(quote.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="r">GST {pl.gstPct}%</td>
                  <td className="r num" data-testid="quote-gst">{formatInr(quote.gst)}</td>
                </tr>
                <tr className="grand">
                  <td colSpan={4} className="r">Total</td>
                  <td className="r num" data-testid="quote-total">{formatInr(quote.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {quote.unpriced.length > 0 && <p className="field-hint">Price on request: {quote.unpriced.join(', ')}.</p>}
          <textarea className="quote-notes no-print" aria-label="Quote notes" value={notes} maxLength={2000} rows={3} onChange={(e) => setNotes(e.target.value)} />
          <p className="quote-notes-print">{notes}</p>
        </section>
      ) : (
        <section className="sheet">
          <div className="sheet-title">
            <strong>Workshop bill of materials</strong>
            <span className="field-hint">Purchase quantities at internal cost. Boards round up to whole 2440 × 1220 sheets.</span>
          </div>
          <table className="quote-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="r">Qty</th>
                <th>Unit</th>
                <th className="r">Rate</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            {(['Boards', 'Edge banding', 'Worktops', 'Hardware', 'Furniture & decor'] as const).map((section) => {
              const lines = bom.lines.filter((l) => l.section === section);
              if (!lines.length) return null;
              return (
                <tbody key={section}>
                  <tr className="room-row">
                    <td colSpan={5}>{section}</td>
                  </tr>
                  {lines.map((l, i) => (
                    <tr key={`${section}-${i}`} data-testid="bom-line">
                      <td>{l.description}</td>
                      <td className="r num">{l.qty}</td>
                      <td>{l.unit}</td>
                      <td className="r num">{l.rate ? formatInr(l.rate) : '—'}</td>
                      <td className="r num">{l.amount ? formatInr(l.amount) : 'On request'}</td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
            <tfoot>
              <tr>
                <td colSpan={4} className="r">Manufactured materials</td>
                <td className="r num">{formatInr(bom.manufacturedCost)}</td>
              </tr>
              <tr>
                <td colSpan={4} className="r">Products</td>
                <td className="r num">{formatInr(bom.productsCost)}</td>
              </tr>
            </tfoot>
          </table>
          {cuts.length > 0 && (
            <>
              <h3 className="cut-title">Worktop cut-list</h3>
              <table className="quote-table" data-testid="worktop-cuts">
                <thead>
                  <tr>
                    <th>Slab</th>
                    <th>Finish</th>
                    <th className="r">Length × depth (mm)</th>
                    <th className="r">Cut-outs</th>
                    <th className="r">Joints</th>
                  </tr>
                </thead>
                <tbody>
                  {cuts.map((c) => (
                    <tr key={c.id} data-testid="worktop-cut">
                      <td>{c.name}</td>
                      <td>{finishById(c.finishId).name}</td>
                      <td className="r num">{fmtMm(c.lengthUm)} × {fmtMm(c.depthUm)}</td>
                      <td className="r num">{c.cutouts.length ? c.cutouts.map((o) => o.kind).join(', ') : '—'}</td>
                      <td className="r num">{c.joints}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      <aside className="quote-side no-print">
        <h3>Internal summary</h3>
        <dl className="quote-internal">
          <dt>Materials (by area)</dt>
          <dd className="num">{formatInr(quote.internal.materials)}</dd>
          <dt>Labour ({pl.labourPct}%)</dt>
          <dd className="num">{formatInr(quote.internal.labour)}</dd>
          <dt>Installation</dt>
          <dd className="num">{formatInr(quote.internal.install)}</dd>
          <dt>Products</dt>
          <dd className="num">{formatInr(quote.internal.products)}</dd>
          <dt>Cost</dt>
          <dd className="num">{formatInr(quote.internal.cost)}</dd>
          <dt>Margin</dt>
          <dd className="num" data-testid="quote-margin">
            {formatInr(quote.internal.margin)} {quote.subtotal ? `(${Math.round((quote.internal.margin / quote.subtotal) * 100)}% of price)` : ''}
          </dd>
        </dl>
        <p className="field-hint">Never printed. Board purchases in the BOM round up to whole sheets; the quote prices boards by area with 15% waste.</p>
        <h3>Saved quotes</h3>
        {quotes.data?.length ? (
          <ul className="obj-list">
            {quotes.data.map((q) => (
              <li key={q.id} className="obj">
                <span className="num">{q.quoteNo}</span>
                <span className="meta num">{formatInr(q.total)} · v{q.versionNo} · {relativeTime(q.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="field-hint">None yet. “Save quote” keeps a numbered copy with the rates used.</p>
        )}
      </aside>
      {rates && <RatesEditor rates={pl} onClose={() => setRates(false)} />}
    </div>
  );
}

