/** Architectural dimension line (mm units, y already flipped by the caller) with oblique ticks. */
export function Dimension({ x1, y1, x2, y2, text, vertical, size = 70 }: { x1: number; y1: number; x2: number; y2: number; text: string; vertical: boolean; size?: number }) {
  const t = size * 0.5;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g stroke="#222" strokeWidth={3} fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x1 - t} y1={y1 + t} x2={x1 + t} y2={y1 - t} strokeWidth={5} />
      <line x1={x2 - t} y1={y2 + t} x2={x2 + t} y2={y2 - t} strokeWidth={5} />
      <text
        x={vertical ? mx - size * 0.4 : mx}
        y={vertical ? my : my - size * 0.4}
        fontSize={size}
        textAnchor="middle"
        fill="#222"
        stroke="none"
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        transform={vertical ? `rotate(-90 ${mx - size * 0.4} ${my})` : undefined}
      >
        {text}
      </text>
    </g>
  );
}

export function Tag({ x, y, text, r = 75 }: { x: number; y: number; text: string; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#fff" stroke="#222" strokeWidth={5} />
      <text x={x} y={y + r * 0.36} fontSize={r} textAnchor="middle" fontWeight={600} fill="#222" fontFamily="Inter, Helvetica, Arial, sans-serif">
        {text}
      </text>
    </g>
  );
}
