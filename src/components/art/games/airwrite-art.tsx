import type { CSSProperties } from "react";

/**
 * The 21 hand landmarks with the index fingertip as a pen, finishing the
 * word "hi". Hovering rewrites it and dots the i.
 */
const HAND: [number, number][] = [
  [328, 252],
  [300, 238],
  [274, 224],
  [256, 212],
  [242, 204],
  [286, 196],
  [252, 176],
  [226, 166],
  [200, 156],
  [308, 190],
  [292, 166],
  [278, 178],
  [282, 194],
  [326, 190],
  [314, 168],
  [302, 180],
  [306, 196],
  [344, 198],
  [338, 180],
  [328, 188],
  [330, 202],
];

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const INK =
  "M52 212C62 172 68 118 80 98C88 86 98 98 92 118L80 212C88 182 106 160 120 164C132 168 126 196 130 206C134 216 154 212 166 200C176 190 184 176 190 168C194 162 197 159 200 156";

export function AirWriteArt() {
  return (
    <svg viewBox="84 66 320 196" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="translate(40 -6)">
        <path
          d={INK}
          fill="none"
          stroke="white"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={600}
          strokeDasharray={600}
          className="group-hover/tile:animate-[art-draw_1.1s_var(--ease-out)_both]"
          style={{ "--art-length": 600 } as CSSProperties}
        />
        <circle cx={204} cy={128} r={6} fill="white" className="opacity-0 group-hover/tile:animate-[art-pop_1.5s_var(--ease-out)_both]" style={{ transformBox: "fill-box", transformOrigin: "center" }} />

        {BONES.map(([a, b]) => (
          <path key={`${a}-${b}`} d={`M${HAND[a][0]} ${HAND[a][1]}L${HAND[b][0]} ${HAND[b][1]}`} stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
        ))}
        {HAND.map(([x, y], i) =>
          i === 8 ? null : <circle key={i} cx={x} cy={y} r={4.6} fill="white" stroke="currentColor" strokeWidth={2.4} />,
        )}
        {/* The pen: index fingertip, landmark 8. */}
        <circle cx={HAND[8][0]} cy={HAND[8][1]} r={9} fill="white" stroke="currentColor" strokeWidth={3.2} />
        <circle cx={HAND[8][0]} cy={HAND[8][1]} r={3} fill="currentColor" />
      </g>
    </svg>
  );
}
