import { useCallback } from 'react';
import { formatDimsIn, formatLength, type LengthUnit } from '@/engine/measurement/units';
import { useEditorStore } from './editorStore';

/** The open project's display unit (mm when no project is open). */
export function useLengthUnit(): LengthUnit {
  return useEditorStore((s) => s.project?.preferences.unit ?? 'mm');
}

/** Formats millimetres in the project's display unit. */
export function useFormatLength(): (mm: number) => string {
  const unit = useLengthUnit();
  return useCallback((mm: number) => formatLength(mm, unit), [unit]);
}

export function useFormatDims(): (d: { width: number; height: number; depth: number }) => string {
  const unit = useLengthUnit();
  return useCallback((d) => formatDimsIn(d, unit), [unit]);
}
