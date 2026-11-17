/**
 * A face as the model sees it: landmark points, with the eye line that
 * steers. The head tilts, the platform tilts, the ball rolls. Hovering
 * tilts the head the other way.
 */
/** Two decimals, so server and browser maths render identical attributes. */
const round = (v: number) => Math.round(v * 100) / 100;

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, n: number, from = 0, to = Math.PI * 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = from + ((to - from) * i) / (to - from >= Math.PI * 2 ? n : n - 1);
    return [round(cx + Math.cos(a) * rx), round(cy + Math.sin(a) * ry)] as const;
  });
}

const OVAL = ellipsePoints(0, 0, 56, 72, 34);
const LEFT_EYE = ellipsePoints(-22, -14, 10, 5.5, 8);
const RIGHT_EYE = ellipsePoints(22, -14, 10, 5.5, 8);
const LEFT_BROW = ellipsePoints(-23, -24, 14, 7, 5, Math.PI * 1.15, Math.PI * 1.85);
const RIGHT_BROW = ellipsePoints(23, -24, 14, 7, 5, Math.PI * 1.15, Math.PI * 1.85);
const NOSE: (readonly [number, number])[] = [
  [0, -10],
  [0, -1],
  [0, 8],
  [-6, 14],
  [0, 16],
  [6, 14],
];
const MOUTH = ellipsePoints(0, 38, 15, 10, 12);

export function FaceControlArt() {
  return (
    <svg viewBox="72 40 396 196" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* Head */}
      <g transform="translate(150 126) rotate(-13)">
        <g className="art-move group-hover/tile:rotate-[26deg]">
          {OVAL.map(([x, y], i) => (
            <circle key={`o${i}`} cx={x} cy={y} r={3.1} fill="currentColor" />
          ))}
          {[...LEFT_BROW, ...RIGHT_BROW].map(([x, y], i) => (
            <circle key={`b${i}`} cx={x} cy={y} r={2.6} fill="currentColor" fillOpacity={0.8} />
          ))}
          {[...LEFT_EYE, ...RIGHT_EYE].map(([x, y], i) => (
            <circle key={`e${i}`} cx={x} cy={y} r={2.3} fill="currentColor" />
          ))}
          {NOSE.map(([x, y], i) => (
            <circle key={`n${i}`} cx={x} cy={y} r={2.3} fill="currentColor" fillOpacity={0.8} />
          ))}
          {MOUTH.map(([x, y], i) => (
            <circle key={`m${i}`} cx={x} cy={y} r={2.6} fill="currentColor" />
          ))}
          {/* The eye line: the number that steers. */}
          <path d="M-52 -14H52" stroke="white" strokeWidth={4} strokeLinecap="round" />
          <circle cx={-22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
          <circle cx={22} cy={-14} r={5.5} fill="white" stroke="currentColor" strokeWidth={2.5} />
          {/* The mouth gap: the number that jumps. */}
          <path d="M0 29v18" stroke="white" strokeWidth={3.5} strokeLinecap="round" />
        </g>
      </g>

      {/* Level reference */}
      <path d="M86 112H214" stroke="currentColor" strokeOpacity={0.35} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />

      {/* Platform and ball */}
      <g transform="translate(370 186)">
        <g transform="rotate(-12)">
          <g className="art-move group-hover/tile:rotate-[24deg]">
            <rect x={-86} y={-6} width={172} height={12} rx={6} fill="currentColor" />
          </g>
        </g>
        <g className="art-move group-hover/tile:translate-x-[116px]">
          <circle cx={-58} cy={-6} r={17} fill="white" stroke="currentColor" strokeWidth={3.5} />
          <path d="M-66 -12a10 10 0 0 1 10-4" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" fill="none" />
        </g>
        <g className="art-move group-hover/tile:opacity-0">
          <path d="M-28 -30h20M-24 -20h14M-30 -10h22" stroke="currentColor" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
