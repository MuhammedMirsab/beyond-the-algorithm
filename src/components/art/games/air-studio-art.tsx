/**
 * A hand as the camera sees it, 21 landmarks, reaching onto a floating
 * keyboard; the index fingertip presses a key. On hover the key goes down and
 * two notes lift off: a movement turned into sound.
 */

/** Right hand, palm down, fingers spread towards the keys (MediaPipe landmark order). */
const HAND: [number, number][] = [
  [204, 240],
  [178, 228],
  [156, 208],
  [142, 186],
  [134, 166],
  [180, 166],
  [172, 130],
  [167, 106],
  [164, 84],
  [204, 160],
  [204, 122],
  [204, 96],
  [204, 74],
  [228, 164],
  [236, 130],
  [241, 106],
  [244, 86],
  [250, 176],
  [264, 150],
  [272, 132],
  [278, 116],
];

const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

/* The keyboard is an oblique slab: back edge y 30, front edge y 92, 24 px of depth to the right. */
const BACK_Y = 30;
const FRONT_Y = 92;
const LEFT = 60;
const KEY = 36;
const KEYS = 8;
const DEPTH_X = 24;
const THICK = 12;
const RIGHT = LEFT + KEY * KEYS;

const at = (x: number, t: number): [number, number] => [x + DEPTH_X * t, BACK_Y + (FRONT_Y - BACK_Y) * t];
const pt = ([x, y]: [number, number]) => `${x} ${y}`;

/** The white key under the index fingertip (0-based from the left). */
const PRESSED = 2;
/** Black keys sit on these dividers, like C# D# _ F# G# A#. */
const BLACK = [1, 2, 4, 5, 6];

function whiteKey(i: number) {
  const x0 = LEFT + i * KEY;
  return `M${pt(at(x0, 0))}L${pt(at(x0 + KEY, 0))}L${pt(at(x0 + KEY, 1))}L${pt(at(x0, 1))}Z`;
}

function blackKey(divider: number) {
  const x = LEFT + divider * KEY;
  const w = 9;
  const t = 0.56;
  return `M${pt(at(x - w, 0))}L${pt(at(x + w, 0))}L${pt(at(x + w, t))}L${pt(at(x - w, t))}Z`;
}

function Note({ x, y, className }: { x: number; y: number; className?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className={className} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
        <path d="M7 -2V-36C13 -31 21 -29 23 -21" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        <ellipse cx={0} cy={0} rx={9} ry={6.6} transform="rotate(-20)" fill="white" stroke="currentColor" strokeWidth={2.6} />
      </g>
    </g>
  );
}

export function AirStudioArt() {
  return (
    <svg viewBox="36 18 344 236" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {/* Front face of the slab. */}
      <path
        d={`M${pt(at(LEFT, 1))}L${pt(at(RIGHT, 1))}L${pt([at(RIGHT, 1)[0], FRONT_Y + THICK])}L${pt([at(LEFT, 1)[0], FRONT_Y + THICK])}Z`}
        fill="currentColor"
        opacity={0.9}
      />
      {Array.from({ length: KEYS }, (_, i) =>
        i === PRESSED ? null : <path key={i} d={whiteKey(i)} fill="white" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round" />,
      )}
      {/* The pressed key is tinted, and dips further on hover. */}
      <path
        d={whiteKey(PRESSED)}
        fill="white"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinejoin="round"
        className="art-move translate-y-px group-hover/tile:translate-y-[4px]"
      />
      <path d={whiteKey(PRESSED)} fill="currentColor" opacity={0.14} className="art-move translate-y-px group-hover/tile:translate-y-[4px]" />
      {BLACK.map((d) => (
        <path key={d} d={blackKey(d)} fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
      ))}

      <Note x={76} y={214} className="art-move group-hover/tile:-translate-y-2 group-hover/tile:-rotate-6" />
      <Note x={104} y={176} className="art-move group-hover/tile:-translate-y-3 group-hover/tile:rotate-6" />

      {/* The hand: 21 landmarks, index fingertip on the key. */}
      {BONES.map(([a, b]) => (
        <path key={`${a}-${b}`} d={`M${HAND[a][0]} ${HAND[a][1]}L${HAND[b][0]} ${HAND[b][1]}`} stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
      ))}
      {HAND.map(([x, y], i) =>
        i === 8 ? null : <circle key={i} cx={x} cy={y} r={4.6} fill="white" stroke="currentColor" strokeWidth={2.4} />,
      )}
      <circle cx={HAND[8][0]} cy={HAND[8][1]} r={8.5} fill="white" stroke="currentColor" strokeWidth={3.2} />
      <circle cx={HAND[8][0]} cy={HAND[8][1]} r={3} fill="currentColor" />
    </svg>
  );
}
