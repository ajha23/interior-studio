/**
 * SVG writer: one sheet per file, in paper millimetres (viewBox = the paper, width/height in mm, so
 * it prints at the drawing scale). All text and attributes are escaped; nothing from the project is
 * inserted as markup. Scale, units, revision and project id are in <title>/<desc> and data attributes.
 */
import { PAPER, renderSheet, type Painter, type Pt, type Sheet } from './drawing';

export function escapeXml(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const dashAttr = (dash?: number[]) => (dash ? ` stroke-dasharray="${dash.map(n).join(' ')}"` : '');

export function sheetToSvg(sheet: Sheet): string {
  const { w, h } = PAPER[sheet.paper];
  const out: string[] = [];
  const painter: Painter = {
    line: (a, b, width, dash) => out.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="#000" stroke-width="${n(width)}"${dashAttr(dash)}/>`),
    rect: (x, y, rw, rh, stroke, fill) =>
      out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(rw)}" height="${n(rh)}" fill="${fill ?? 'none'}"${stroke ? ` stroke="#000" stroke-width="${n(stroke.width)}"${dashAttr(stroke.dash)}` : ''}/>`),
    poly: (pts, closed, stroke, fill) =>
      out.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fill ?? 'none'}"${stroke ? ` stroke="#000" stroke-width="${n(stroke.width)}"${dashAttr(stroke.dash)}` : ''}/>`),
    arc: (c, r, a0, a1, width, dash) => {
      const p0: Pt = { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) };
      const p1: Pt = { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) };
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      out.push(`<path d="M ${n(p0.x)} ${n(p0.y)} A ${n(r)} ${n(r)} 0 0 ${d > 0 ? 1 : 0} ${n(p1.x)} ${n(p1.y)}" fill="none" stroke="#000" stroke-width="${n(width)}"${dashAttr(dash)}/>`);
    },
    circle: (c, r, width, fill) => out.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="${fill ?? 'none'}" stroke="#000" stroke-width="${n(width)}"/>`),
    text: (at, text, size, anchor, rotate, bold) =>
      out.push(
        `<text x="${n(at.x)}" y="${n(at.y)}" font-size="${n(size)}" text-anchor="${anchor}"${bold ? ' font-weight="bold"' : ''}${rotate ? ` transform="rotate(${n(-rotate)} ${n(at.x)} ${n(at.y)})"` : ''}>${escapeXml(text)}</text>`,
      ),
  };
  renderSheet(sheet, painter);
  const t = sheet.title;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif" data-project-id="${escapeXml(t.projectId)}" data-revision="${escapeXml(t.revision)}" data-scale="${escapeXml(t.scale)}" data-units="${escapeXml(t.units)}">`,
    `<title>${escapeXml(`${t.project} — ${t.title}`)}</title>`,
    `<desc>${escapeXml(`Drawing ${t.drawingNo}, revision ${t.revision}, scale ${t.scale} on ${sheet.paper}, units ${t.units}, generated ${t.generated}. ${t.status}`)}</desc>`,
    `<rect x="0" y="0" width="${w}" height="${h}" fill="#fff"/>`,
    ...out,
    '</svg>',
    '',
  ].join('\n');
}
