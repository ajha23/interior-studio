/** Small stroke icons for the editor chrome (16px grid, currentColor). */
const PATHS = {
  select: 'M3 2l9 5-4 1.2L6.6 13z',
  wall: 'M2 6h12v4H2z',
  room: 'M2.5 2.5h11v11h-11z',
  door: 'M4 14V2h6.5v12M2.5 14h11M8.5 8.2v.1',
  window: 'M2 4h12v8H2zM8 4v8M2 8h12',
  paint: 'M3 13c2 0 3-1 3-2.5S4.5 8 4.5 8L11 1.5l3.5 3.5L8 11.5S6.5 10 5 11',
  comment: 'M2.5 3h11v8h-6L4 13.5V11H2.5z',
  undo: 'M5.5 3.5L2.5 6.5l3 3M3 6.5h6.5a4 4 0 010 8H7',
  redo: 'M10.5 3.5l3 3-3 3M13 6.5H6.5a4 4 0 000 8H9',
  more: 'M3.5 8h.1M8 8h.1M12.5 8h.1',
  sparkle: 'M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4zM13 11l.6 1.4L15 13l-1.4.6L13 15l-.6-1.4L11 13l1.4-.6z',
  back: 'M10 3L5 8l5 5',
  cabinet: 'M2 4h12v9H2zM2 6.5h12M8 6.5V13M6.5 9.5v1M9.5 9.5v1',
  drawers: 'M2 3h12v10H2zM2 6.3h12M2 9.6h12M7 4.6h2M7 8h2M7 11.3h2',
  wardrobe: 'M2.5 1.5h11v13h-11zM8 1.5v13M6.5 7v2M9.5 7v2',
  tv: 'M2 3h12v6H2zM2 11h12v2H2z',
  block: 'M3 5h10v7H3z',
  layers: 'M8 2l6 3.2-6 3.2-6-3.2zM2 8.3l6 3.2 6-3.2M2 11.3l6 3.2 6-3.2',
  plus: 'M8 3v10M3 8h10',
  send: 'M2 8l11-5-4 11-2-4.5z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
