import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_PRICE_LIST, sanitizePriceList, type PriceList, type Quote } from '@studio/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Json } from '../lib/database.types';

/** The studio's price list, or the sample defaults when none is saved yet. */
export function usePriceList() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['price-list', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    queryFn: async (): Promise<{ rates: PriceList; saved: boolean; updatedAt: string | null }> => {
      const { data, error } = await supabase.from('price_lists').select('rates, updated_at').eq('org_id', activeOrg!.orgId).maybeSingle();
      if (error) throw error;
      return data ? { rates: sanitizePriceList(data.rates), saved: true, updatedAt: data.updated_at } : { rates: DEFAULT_PRICE_LIST, saved: false, updatedAt: null };
    },
  });
}

export function useSavePriceList() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rates: PriceList) => {
      const clean = sanitizePriceList(rates);
      const { error } = await supabase.from('price_lists').upsert({ org_id: activeOrg!.orgId, rates: clean as unknown as Json, updated_at: new Date().toISOString() });
      if (error) throw error;
      return clean;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['price-list'] }),
  });
}

export interface SavedQuote {
  id: string;
  quoteNo: string;
  versionNo: number;
  status: string;
  total: number;
  createdAt: string;
}

export function useQuotes(projectId: string) {
  return useQuery({
    queryKey: ['quotes', projectId],
    queryFn: async (): Promise<SavedQuote[]> => {
      const { data, error } = await supabase.from('quotes').select('id, quote_no, version_no, status, totals, created_at').eq('project_id', projectId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, quoteNo: r.quote_no, versionNo: r.version_no, status: r.status, total: Number((r.totals as { total?: number })?.total ?? 0), createdAt: r.created_at }));
    },
  });
}

/** Freeze the current quote (lines, totals and the rates used) as a numbered record. */
export function useSaveQuote(projectId: string) {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { quote: Quote; rates: PriceList; versionNo: number; clientName: string; notes: string }) => {
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const quoteNo = `Q-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const { quote } = input;
      const { error } = await supabase.from('quotes').insert({
        org_id: activeOrg!.orgId,
        project_id: projectId,
        quote_no: quoteNo,
        version_no: input.versionNo,
        client_name: input.clientName.slice(0, 200),
        lines: quote.lines.map(({ cost: _cost, ...l }) => l) as unknown as Json,
        totals: { subtotal: quote.subtotal, gst: quote.gst, total: quote.total, gstPct: input.rates.gstPct } as unknown as Json,
        rates: input.rates as unknown as Json,
        notes: input.notes.slice(0, 2000),
      });
      if (error) throw error;
      return quoteNo;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes', projectId] }),
  });
}
