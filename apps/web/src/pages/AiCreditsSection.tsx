import { useState } from 'react';
import { useAiSettings, useAiUsage, useCredits } from '../data/ai';
import { errorMessage } from '../lib/supabase';
import { relativeTime } from '../ui/format';

const OP_LABEL: Record<string, string> = {
  enhance: 'Photo finish',
  restyle: 'Restyle',
  style_transfer: 'Match reference',
  clear_room: 'Empty room',
  sketch_to_render: 'Sketch to render',
  edit: 'Image edit',
  image_to_3d: '3D from photo',
  text_to_3d: '3D from text',
};

/** Studio AI credits: balance, monthly allowance, top-ups and recent usage. */
export function AiCreditsSection({ admin }: { admin: boolean }) {
  const credits = useCredits();
  const usage = useAiUsage();
  const { monthly, setMonthly, topUp } = useAiSettings();
  const [allow, setAllow] = useState<string>('');
  const [amount, setAmount] = useState('100');
  const used = (usage.data ?? []).filter((u) => new Date(u.createdAt).getMonth() === new Date().getMonth()).reduce((s, u) => s + u.cost, 0);
  return (
    <section className="panel" aria-labelledby="ai-h">
      <h2 id="ai-h" className="section-h">AI credits</h2>
      <p className="muted small">
        {credits.data ?? '…'} credits left · {used} used this month · allowance {monthly.data ?? '…'} per month (unused credits don’t roll over; top-ups do).
        An AI image costs 2 credits; a 3D model 10 (12 from a description).
      </p>
      {admin && (
        <div className="row gap wrap">
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(allow);
              if (Number.isFinite(n) && n >= 0) setMonthly.mutate(Math.round(n), { onSuccess: () => setAllow('') });
            }}
          >
            <input type="number" min={0} max={100000} placeholder={String(monthly.data ?? 500)} value={allow} onChange={(e) => setAllow(e.target.value)} aria-label="Monthly allowance" style={{ width: 110 }} />
            <button className="btn" disabled={setMonthly.isPending || !allow}>Set monthly allowance</button>
          </form>
          <form
            className="row gap"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Math.round(Number(amount));
              if (n > 0) topUp.mutate({ amount: n, note: 'Manual top-up' });
            }}
          >
            <input type="number" min={1} max={100000} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Credits to add" style={{ width: 90 }} />
            <button className="btn" disabled={topUp.isPending}>Add credits</button>
          </form>
        </div>
      )}
      {(setMonthly.error || topUp.error) && <p className="form-error" role="alert">{errorMessage(setMonthly.error ?? topUp.error)}</p>}
      {usage.data && usage.data.length > 0 && (
        <table className="table">
          <thead><tr><th>Job</th><th>By</th><th>Credits</th><th>When</th></tr></thead>
          <tbody>
            {usage.data.slice(0, 15).map((u) => (
              <tr key={u.id}>
                <td>{OP_LABEL[u.op] ?? u.op}{u.status === 'failed' ? ' · failed, refunded' : u.status === 'running' ? ' · running' : ''}</td>
                <td className="muted">{u.by ?? '—'}</td>
                <td>{u.cost}</td>
                <td className="muted">{relativeTime(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
