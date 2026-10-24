import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRoomTemplate, type RoomTemplate } from '@studio/core';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { Json } from '../lib/database.types';

export interface SavedTemplate {
  id: string;
  name: string;
  style: string;
  roomType: string;
  template: RoomTemplate;
  pieceCount: number;
  createdAt: string;
}

export function useRoomTemplates() {
  const { activeOrg } = useAuth();
  return useQuery({
    queryKey: ['room-templates', activeOrg?.orgId ?? 'none'],
    enabled: Boolean(activeOrg),
    queryFn: async (): Promise<SavedTemplate[]> => {
      const { data, error } = await supabase.from('room_templates').select('*').eq('org_id', activeOrg!.orgId).order('created_at', { ascending: false });
      if (error) throw error;
      return data
        .filter((r) => isRoomTemplate(r.template))
        .map((r) => ({ id: r.id, name: r.name, style: r.style, roomType: r.room_type, template: r.template as unknown as RoomTemplate, pieceCount: r.piece_count, createdAt: r.created_at }));
    },
  });
}

export function useSaveRoomTemplate() {
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; style: string; roomType: string; template: RoomTemplate }) => {
      if (!activeOrg) throw new Error('No studio selected.');
      const { error } = await supabase.from('room_templates').insert({
        org_id: activeOrg.orgId,
        name: input.name.trim().slice(0, 120),
        style: input.style.trim().slice(0, 60),
        room_type: input.roomType.trim().slice(0, 60),
        template: input.template as unknown as Json,
        piece_count: input.template.pieces.length,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-templates'] }),
  });
}

export function useDeleteRoomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('room_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['room-templates'] }),
  });
}
