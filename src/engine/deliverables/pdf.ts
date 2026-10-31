/**
 * A small vector PDF writer (PDF 1.4, no dependencies): one page per sheet, lines, rectangles,
 * arcs and text in Helvetica (WinAnsi), so drawings stay sharp when printed and text is searchable.
 * Coordinates arrive in paper millimetres with y down and are converted to points with y up.
 */
import { renderSheet, sheetSize, textWidth, type ImageRef, type Painter, type Pt, type Sheet } from './drawing';

const PT = 72 / 25.4;
const f = (v: number) => (Math.round(v * 1000) / 1000).toString();

const WIN_ANSI: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };

/** A PDF string literal in WinAnsi; characters outside it become "?". */
export function pdfString(s: string): string {
  let out = '(';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    const b = code < 0x80 ? code : code >= 0xa0 && code <= 0xff ? code : (WIN_ANSI[ch] ?? (ch === '≈' ? 0x7e : 0x3f));
    if (b === 0x28 || b === 0x29 || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b < 0x20 || b > 0x7e) out += `\\${b.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(b);
  }
  return `${out})`;
}

function hexToRgb(hex: string): string {
  const v = parseInt(hex.slice(1), 16);
  return `${f(((v >> 16) & 255) / 255)} ${f(((v >> 8) & 255) / 255)} ${f((v & 255) / 255)}`;
}

/** Page content; images drawn are collected (by id) so the page can reference them. */
function pageContent(sheet: Sheet, images: Map<string, ImageRef>): string {
  const { h } = sheetSize(sheet);
  const X = (x: number) => f(x * PT);
  const Y = (y: number) => f((h - y) * PT);
  const ops: string[] = ['1 J 1 j'];
  const strokeStyle = (width: number, dash?: number[]) => `${f(width * PT)} w [${(dash ?? []).map((d) => f(d * PT)).join(' ')}] 0 d 0 0 0 RG`;
  const pathOf = (pts: Pt[]) => pts.map((p, i) => `${X(p.x)} ${Y(p.y)} ${i ? 'l' : 'm'}`).join(' ');
  const painter: Painter = {
    line: (a, b, width, dash) => ops.push(`${strokeStyle(width, dash)} ${X(a.x)} ${Y(a.y)} m ${X(b.x)} ${Y(b.y)} l S`),
    rect: (x, y, w, rh, stroke, fill) => {
      const r = `${X(x)} ${Y(y + rh)} ${f(w * PT)} ${f(rh * PT)} re`;
      if (fill && fill !== '#ffffff') ops.push(`${hexToRgb(fill)} rg ${r} f`);
      else if (fill === '#ffffff') ops.push(`1 1 1 rg ${r} f`);
      if (stroke) ops.push(`${strokeStyle(stroke.width, stroke.dash)} ${r} S`);
    },
    poly: (pts, closed, stroke, fill) => {
      if (fill) ops.push(`${hexToRgb(fill)} rg ${pathOf(pts)} h f`);
      if (stroke) ops.push(`${strokeStyle(stroke.width, stroke.dash)} ${pathOf(pts)}${closed ? ' h' : ''} S`);
    },
    arc: (c, r, a0, a1, width, dash) => {
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(Math.abs(d) / (Math.PI / 2)));
      const seg = d / steps;
      const k = (4 / 3) * Math.tan(seg / 4);
      const pt = (a: number) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      let path = `${X(pt(a0).x)} ${Y(pt(a0).y)} m`;
      for (let i = 0; i < steps; i++) {
        const s = a0 + i * seg;
        const e = s + seg;
        const p1 = { x: c.x + r * (Math.cos(s) - k * Math.sin(s)), y: c.y + r * (Math.sin(s) + k * Math.cos(s)) };
        const p2 = { x: c.x + r * (Math.cos(e) + k * Math.sin(e)), y: c.y + r * (Math.sin(e) - k * Math.cos(e)) };
        const p3 = pt(e);
        path += ` ${X(p1.x)} ${Y(p1.y)} ${X(p2.x)} ${Y(p2.y)} ${X(p3.x)} ${Y(p3.y)} c`;
      }
      ops.push(`${strokeStyle(width, dash)} ${path} S`);
    },
    circle: (c, r, width, fill) => {
      const k = 0.5523 * r;
      const p = `${X(c.x + r)} ${Y(c.y)} m ${X(c.x + r)} ${Y(c.y + k)} ${X(c.x + k)} ${Y(c.y + r)} ${X(c.x)} ${Y(c.y + r)} c ${X(c.x - k)} ${Y(c.y + r)} ${X(c.x - r)} ${Y(c.y + k)} ${X(c.x - r)} ${Y(c.y)} c ${X(c.x - r)} ${Y(c.y - k)} ${X(c.x - k)} ${Y(c.y - r)} ${X(c.x)} ${Y(c.y - r)} c ${X(c.x + k)} ${Y(c.y - r)} ${X(c.x + r)} ${Y(c.y - k)} ${X(c.x + r)} ${Y(c.y)} c h`;
      ops.push(`${fill ? `${hexToRgb(fill)} rg ` : ''}${strokeStyle(width)} ${p} ${fill ? 'B' : 'S'}`);
    },
    text: (at, text, size, anchor, rotate = 0, bold, color) => {
      // Anchor from the shared Helvetica metrics so PDF and SVG place text identically.
      const width = textWidthPt(text, size, bold);
      const shift = anchor === 'middle' ? -width / 2 : anchor === 'end' ? -width : 0;
      const r = (rotate * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      const x = at.x * PT + shift * cos;
      const y = (h - at.y) * PT + shift * sin;
      ops.push(`BT /${bold ? 'F2' : 'F1'} ${f(size * PT)} Tf ${color && /^#[0-9a-f]{6}$/i.test(color) ? hexToRgb(color) : '0 0 0'} rg ${f(cos)} ${f(sin)} ${f(-sin)} ${f(cos)} ${f(x)} ${f(y)} Tm ${pdfString(text)} Tj ET`);
    },
    image: (x, y, iw, ih, img) => {
      images.set(img.id, img);
      ops.push(`q ${f(iw * PT)} 0 0 ${f(ih * PT)} ${X(x)} ${Y(y + ih)} cm /${imageName(img.id)} Do Q`);
    },
  };
  renderSheet(sheet, painter);
  return ops.join('\n');
}

const imageName = (id: string) => `Im${id.replace(/[^A-Za-z0-9]/g, '')}`;

const textWidthPt = (text: string, size: number, bold?: boolean) => textWidth(text, size, bold) * PT;

export interface PdfMeta {
  title: string;
  subject: string;
  /** Generation time, written as the creation date. */
  created: Date;
}

/** A complete PDF file (ASCII bytes) with one page per sheet. */
export function sheetsToPdf(sheets: Sheet[], meta: PdfMeta): string {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalog = add('');
  const pages = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  // Each image is stored once (JPEG, DCTDecode) and shared by every page that shows it.
  const imageObjects = new Map<string, number>();
  for (const sheet of sheets) {
    const { w, h } = sheetSize(sheet);
    const used = new Map<string, ImageRef>();
    const content = pageContent(sheet, used);
    for (const img of used.values()) {
      if (!imageObjects.has(img.id)) {
        let bin = '';
        for (const byte of img.data) bin += String.fromCharCode(byte);
        imageObjects.set(img.id, add(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n${bin}\nendstream`));
      }
    }
    const xobjects = used.size ? ` /XObject << ${[...used.keys()].map((id) => `/${imageName(id)} ${imageObjects.get(id)} 0 R`).join(' ')} >>` : '';
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${f(w * PT)} ${f(h * PT)}] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >>${xobjects} >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const d = meta.created.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const info = add(`<< /Title ${pdfString(meta.title)} /Subject ${pdfString(meta.subject)} /Producer (Interior Studio) /CreationDate (D:${d}Z) >>`);
  let out = '%PDF-1.4\n%âãÏÓ\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** Bytes for a string whose characters are all single bytes (Latin-1). */
function byteLength(s: string): number {
  return s.length;
}

/** The PDF as bytes for a download (every character is a single Latin-1 byte). */
export function pdfBytes(pdf: string): Uint8Array {
  const b = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) b[i] = pdf.charCodeAt(i) & 0xff;
  return b;
}
