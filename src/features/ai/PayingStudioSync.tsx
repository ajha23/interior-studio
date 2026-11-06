/**
 * Keeps the paying studio in step with the session and the studio last opened in the shell, and
 * loads its balance (spec 045, clarification 2). Renders nothing; mounted once inside SessionProvider.
 */
import { useEffect } from 'react';
import { useRoute } from '@/app/router';
import { useSession } from '@/features/auth/useSession';
import { readLastStudio } from '@/features/studio/useStudio';
import { supabase } from '@/infrastructure/supabase/client';
import { choosePayer, clearPayingStudio, setPayingBalance, setPayingStudio } from './payingStudio';

/** Reads the studio's balance as the signed-in user (members only; applies the monthly grant). */
async function balanceFromDatabase(orgId: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('ai_credit_balance', { p_org: orgId });
  return error || typeof data !== 'number' ? null : data;
}

export function PayingStudioSync({ loadBalance = balanceFromDatabase }: { loadBalance?: (orgId: string) => Promise<number | null> }) {
  const { status, memberships } = useSession();
  // Re-evaluated on every route change: opening another studio in the shell switches who pays.
  const route = useRoute();
  const payer = status === 'signed-in' ? choosePayer(memberships, readLastStudio()) : null;
  const payerId = payer?.orgId ?? null;

  useEffect(() => {
    setPayingStudio(payer);
    // payer is derived from these; its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerId, payer?.orgName, payer?.role, route]);

  useEffect(() => {
    if (status === 'signed-out') clearPayingStudio();
  }, [status]);

  useEffect(() => {
    if (!payerId) return;
    let cancelled = false;
    void loadBalance(payerId).then((balance) => {
      if (!cancelled && balance !== null) setPayingBalance(payerId, balance);
    });
    return () => {
      cancelled = true;
    };
  }, [payerId, loadBalance]);

  return null;
}
