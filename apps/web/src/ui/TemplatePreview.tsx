import { useMemo } from 'react';
import { footprint, instantiateRoomTemplate, itemSwatch, materialById, type DetectedRoom, type RoomTemplate } from '@studio/core';

/** Top view of a template laid out in the room it was saved from. */
export function TemplatePreview({ t }: { t: RoomTemplate }) {
  const shapes = useMemo(() => {
    const W = t.widthUm;
    const D = t.depthUm;
    const fake = { interior: [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }] } as DetectedRoom;
    return instantiateRoomTemplate(t, fake).map((f) => ({ id: f.id, pts: footprint(f).map((p) => `${p.x / 1000},${p.y / 1000}`).join(' '), fill: itemSwatch(f) }));
  }, [t]);
  const floor = materialById(t.floorFinish, 'floor').color;
  const wall = materialById(t.wallColor, 'wall').color;
  const pad = 120;
  return (
    <svg className="tpl-preview" viewBox={`${-pad} ${-pad} ${t.widthUm / 1000 + pad * 2} ${t.depthUm / 1000 + pad * 2}`} aria-hidden>
      <rect x={-60} y={-60} width={t.widthUm / 1000 + 120} height={t.depthUm / 1000 + 120} fill={wall} stroke="#2b302d" strokeWidth={20} />
      <rect x={0} y={0} width={t.widthUm / 1000} height={t.depthUm / 1000} fill={floor} />
      {shapes.map((s) => (
        <polygon key={s.id} points={s.pts} fill={s.fill} fillOpacity={0.85} stroke="#2b302d" strokeWidth={12} />
      ))}
    </svg>
  );
}

