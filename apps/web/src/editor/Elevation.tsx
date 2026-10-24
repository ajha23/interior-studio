import type { ReactNode } from 'react';
import { finishById } from '@studio/core';
import type { ParametricItem } from '@studio/core';
import { fmtMm, mm } from '@studio/core';
import type { Part, ResolvedFurniture } from '@studio/core';
import { Dim } from './PlanView';

const k = (v: number) => v / 1000;

type Mode = 'front' | 'internal' | 'side';

export function Elevation({ item, r, mode }: { item: ParametricItem; r: ResolvedFurniture; mode: Mode }) {
  const { widthUm: W, depthUm: D, heightUm: H } = r.overall;
  const span = mode === 'side' ? D : W;
  const fs = Math.max(k(Math.max(span, H)) / 34, 22);
  const margin = fs * 5;
  const vbW = k(span) + margin * 2;
  const vbH = k(H) + margin * 2.4;
  const Y = (z: number) => margin + k(H - z); // flip z
  const shutter = finishById(item.materials.shutter).color;
  const worktop = item.kind === 'basecabinet' ? finishById(item.materials.worktop).color : shutter;
  const carcass = finishById(item.materials.carcass).color;
  const isFront = (p: Part) => p.role === 'shutter' || p.role === 'drawer-front';

  const rect = (p: Part, opts: { fill: string; opacity?: number; dash?: boolean }) => {
    const x = mode === 'side' ? p.box.y : p.box.x;
    const w = mode === 'side' ? p.box.d : p.box.w;
    return <rect key={p.key} x={margin + k(x)} y={Y(p.box.z + p.box.h)} width={k(w)} height={k(p.box.h)} fill={opts.fill} fillOpacity={opts.opacity ?? 1} stroke="#1f2522" strokeWidth={fs * 0.05} strokeDasharray={opts.dash ? `${fs * 0.3} ${fs * 0.2}` : undefined} />;
  };

  const shapes: ReactNode[] = [];
  if (mode === 'front') {
    r.parts.filter((p) => ['side', 'top', 'bottom', 'panel', 'plinth', 'worktop'].includes(p.role)).forEach((p) => shapes.push(rect(p, { fill: p.role === 'panel' || p.role === 'plinth' ? shutter : p.role === 'worktop' ? worktop : carcass })));
    r.parts.filter((p) => p.role === 'partition' || p.role === 'shelf').forEach((p) => shapes.push(rect(p, { fill: carcass })));
    r.parts.filter(isFront).forEach((p) => {
      shapes.push(rect(p, { fill: shutter }));
      if (p.role === 'shutter' && (item.kind === 'wardrobe' || item.kind === 'basecabinet')) {
        // Handle marks on the meeting edge
        const midZ = Y(p.box.z + p.box.h / 2);
        const onLeft = p.box.x + p.box.w / 2 > W / 2;
        const hx = onLeft ? margin + k(p.box.x) + fs * 0.9 : margin + k(p.box.x + p.box.w) - fs * 0.9;
        shapes.push(<line key={`${p.key}-h`} x1={hx} y1={midZ - fs * 3} x2={hx} y2={midZ + fs * 3} stroke="#1f2522" strokeWidth={fs * 0.22} strokeLinecap="round" />);
      }
    });
  } else if (mode === 'internal') {
    r.parts.filter((p) => p.role === 'back').forEach((p) => shapes.push(rect(p, { fill: '#efe6d3' })));
    r.parts.filter((p) => !isFront(p) && p.role !== 'back' && p.role !== 'drawer-bottom').forEach((p) => {
      if (p.role === 'drawer-box') {
        if (!p.key.endsWith('front') && !p.key.endsWith('back')) return;
        if (p.key.endsWith('back') && r.parts.some((q) => q.key === p.key.replace(/back$/, 'front'))) return;
        shapes.push(rect(p, { fill: '#f4ede0' }));
        return;
      }
      shapes.push(rect(p, { fill: p.role === 'panel' ? shutter : carcass }));
    });
    r.parts.filter((p) => p.key.endsWith('-hat')).forEach((p) => {
      const z = p.box.z - mm(60);
      shapes.push(<line key={`${p.key}-rod`} x1={margin + k(p.box.x + mm(30))} x2={margin + k(p.box.x + p.box.w - mm(30))} y1={Y(z)} y2={Y(z)} stroke="#1f2522" strokeWidth={fs * 0.25} strokeLinecap="round" />);
    });
  } else {
    const order = (p: Part) => (p.role === 'back' ? 0 : isFront(p) ? 3 : p.role === 'side' ? 1 : 2);
    [...r.parts]
      .filter((p) => p.role !== 'drawer-bottom' && !(p.role === 'side' && p.key === 'side-r'))
      .sort((a, b) => order(a) - order(b))
      .forEach((p) => shapes.push(rect(p, { fill: p.role === 'back' ? '#efe6d3' : isFront(p) ? shutter : p.role === 'side' ? '#f7f3ea' : carcass, opacity: p.role === 'side' ? 1 : 0.95 })));
  }

  const dims: ReactNode[] = [];
  const top = Y(H) - fs * 2.2;
  const bottom = Y(r.overall.zMinUm) + fs * 2.4;
  const left = margin - fs * 2.6;
  dims.push(<Dim key="ow" a={{ x: margin, y: top }} b={{ x: margin + k(span), y: top }} label={fmtMm(span)} fs={fs} />);
  dims.push(<Dim key="oh" a={{ x: left, y: Y(r.overall.zMinUm) }} b={{ x: left, y: Y(H) }} label={fmtMm(H - r.overall.zMinUm)} fs={fs} />);
  if (mode !== 'side') {
    r.modules.forEach((m, i) => dims.push(<Dim key={`m${i}`} a={{ x: margin + k(m.xUm), y: bottom }} b={{ x: margin + k(m.xUm + m.widthUm), y: bottom }} label={fmtMm(m.widthUm)} fs={fs * 0.85} side={1} />));
    if (mode === 'internal') {
      // Vertical chain for the last module: clear openings between horizontal boards
      const last = r.modules.at(-1);
      if (last) {
        const boards = r.parts
          .filter((p) => (p.role === 'shelf' || p.role === 'top' || p.role === 'bottom') && p.box.x <= last.xUm + mm(1) && p.box.x + p.box.w >= last.xUm + last.widthUm - mm(1))
          .sort((a, b) => a.box.z - b.box.z);
        const xr = margin + k(W) + fs * 1.8;
        for (let i = 0; i < boards.length - 1; i++) {
          const a = boards[i].box.z + boards[i].box.h;
          const b = boards[i + 1].box.z;
          if (b - a > mm(40)) dims.push(<Dim key={`v${i}`} a={{ x: xr, y: Y(a) }} b={{ x: xr, y: Y(b) }} label={fmtMm(b - a)} fs={fs * 0.8} side={1} />);
        }
      }
    }
  }
  if (r.overall.zMinUm > 0) {
    dims.push(<Dim key="mount" a={{ x: left, y: Y(0) }} b={{ x: left, y: Y(r.overall.zMinUm) }} label={fmtMm(r.overall.zMinUm)} fs={fs * 0.85} />);
  }

  return (
    <svg className="drawing-svg" viewBox={`0 0 ${vbW + (mode === 'internal' ? fs * 4 : 0)} ${vbH}`} style={{ maxHeight: 520 }}>
      <line x1={margin * 0.4} x2={vbW - margin * 0.4} y1={Y(0)} y2={Y(0)} stroke="#1f2522" strokeWidth={fs * 0.08} />
      {shapes}
      <g style={{ ['--paper' as string]: '#fff' }}>{dims}</g>
    </svg>
  );
}
