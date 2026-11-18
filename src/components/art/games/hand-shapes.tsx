import type { SVGProps } from "react";

/**
 * Rock, paper and scissors as one friendly hand in a shirt cuff, drawn on a
 * 120 x 136 grid. The three shapes share the same wrist and cuff, so they sit
 * on one baseline and read as the same hand changing shape.
 *
 * Drawn like a sticker: every part is first painted fat in ink, then filled
 * with paper on top, so overlapping parts merge into one clean outline. Only
 * the parts that sit in front (the thumb across a fist, the folded fingers)
 * get their own inner line. The same drawing works from 16 px (pass a heavier
 * `weight` and no cuff) to a full card.
 */
export type HandShape = "rock" | "paper" | "scissors";

/** The drawing's grid. Content stays inside it for weights up to about 5. */
export const HAND_WIDTH = 120;
export const HAND_HEIGHT = 136;
export const HAND_VIEWBOX = `0 0 ${HAND_WIDTH} ${HAND_HEIGHT}`;

/** A viewBox with room for the outline at any weight; without the cuff the hand ends at the wrist. */
export function handViewBox({ cuff = true, weight = DEFAULT_WEIGHT }: { cuff?: boolean; weight?: number } = {}): string {
  const pad = Math.max(0, weight - 4) + 1;
  const bottom = (cuff ? 131 : 122) + weight + 1;
  return `${-pad} ${-pad} ${HAND_WIDTH + pad * 2} ${bottom + pad}`;
}

const DEFAULT_WEIGHT = 4;

type Part =
  | { kind: "finger"; cx: number; top: number; bottom: number; width: number; tilt?: number }
  | { kind: "block"; x: number; y: number; width: number; height: number; radius: number }
  | { kind: "path"; d: string };

const finger = (cx: number, top: number, bottom: number, width: number, tilt = 0): Part => ({
  kind: "finger",
  cx,
  top,
  bottom,
  width,
  tilt,
});
const block = (x: number, y: number, width: number, height: number, radius: number): Part => ({
  kind: "block",
  x,
  y,
  width,
  height,
  radius,
});

const WRIST = block(42, 92, 40, 30, 10);
const CUFF = block(35, 109, 54, 22, 7);
const CUFF_SEAM = "M35 116.5h54";

/** A thumb folded across the fingers: its base makes the left edge, its tip rests on the fingers. */
const ROCK_THUMB: Part = {
  kind: "path",
  d: "M25 78c0-7 5-11.5 12-11.5h37a9 9 0 0 1 0 18H52c-8 0-14 4-19 11l-3 4C26 93 25 86 25 78Z",
};
const SCISSORS_THUMB: Part = {
  kind: "path",
  d: "M26 86c0-7 5-11.5 12-11.5h36a9 9 0 0 1 0 18H53c-8 0-13.5 3.5-18 9.5l-3 4C27.5 101 26 94 26 86Z",
};

/** `base` merges into the silhouette; `front` is drawn again on top with its own outline. */
const SHAPES: Record<HandShape, { base: Part[]; front: Part[] }> = {
  // A fist from the front: four folded fingers, the thumb across them.
  rock: {
    base: [block(27, 46, 68, 54, 22), block(32, 76, 58, 36, 15), WRIST],
    front: [finger(39.5, 41, 80, 17), finger(56, 39, 80, 17), finger(72, 41, 80, 16), finger(86.5, 47, 82, 14), ROCK_THUMB],
  },
  // An open hand, fingers fanned a little, the thumb out to the side.
  paper: {
    base: [
      finger(41, 22, 74, 15.5, -9),
      finger(57, 12, 72, 16, -1.5),
      finger(72.5, 17, 72, 15, 6),
      finger(86, 33, 76, 13.5, 15),
      block(31, 58, 63, 52, 21),
      WRIST,
      finger(35, 62, 104, 17, -40),
    ],
    front: [],
  },
  // Two fingers in a V; the thumb holds the other two down.
  scissors: {
    base: [finger(45, 10, 74, 16, -16), finger(64, 8, 72, 16, 12), block(30, 58, 63, 52, 21), WRIST],
    front: [finger(72, 55, 88, 15.5), finger(86, 60, 90, 14), SCISSORS_THUMB],
  },
};

type PartStyle = Pick<SVGProps<SVGElement>, "fill" | "stroke" | "strokeWidth">;

function PartShape({ part, ...style }: { part: Part } & PartStyle) {
  if (part.kind === "path") return <path d={part.d} {...style} />;
  if (part.kind === "block") {
    return <rect x={part.x} y={part.y} width={part.width} height={part.height} rx={part.radius} {...style} />;
  }
  const { cx, top, bottom, width, tilt = 0 } = part;
  return (
    <rect
      x={cx - width / 2}
      y={top}
      width={width}
      height={bottom - top}
      rx={width / 2}
      transform={tilt ? `rotate(${tilt} ${cx} ${bottom})` : undefined}
      {...style}
    />
  );
}

export function Hand({
  shape,
  ink = "currentColor",
  paper = "white",
  weight = DEFAULT_WEIGHT,
  cuff = true,
  flip = false,
}: {
  shape: HandShape;
  /** Outline colour. Match the background behind small glyphs so the outline reads as a gap. */
  ink?: string;
  /** Fill colour. */
  paper?: string;
  /** Outline width in grid units (the grid is 120 wide). Heavier for small glyphs. */
  weight?: number;
  /** The shirt cuff under the wrist. Leave it off below about 32 px. */
  cuff?: boolean;
  /** Mirror left to right, e.g. for two hands facing each other. */
  flip?: boolean;
}) {
  const { base, front } = SHAPES[shape];
  const all = [...base, ...front, ...(cuff ? [CUFF] : [])];
  return (
    <g transform={flip ? `matrix(-1 0 0 1 ${HAND_WIDTH} 0)` : undefined} strokeLinejoin="round" strokeLinecap="round">
      {/* One fat ink pass under everything makes the outer outline. */}
      <g fill={ink} stroke={ink} strokeWidth={weight * 2}>
        {all.map((part, i) => (
          <PartShape key={i} part={part} />
        ))}
      </g>
      <g fill={paper}>
        {[...base, ...front].map((part, i) => (
          <PartShape key={i} part={part} />
        ))}
      </g>
      {front.length > 0 ? (
        <g fill={paper} stroke={ink} strokeWidth={weight}>
          {front.map((part, i) => (
            <PartShape key={i} part={part} />
          ))}
        </g>
      ) : null}
      {cuff ? (
        <>
          <PartShape part={CUFF} fill={paper} stroke={ink} strokeWidth={weight} />
          <path d={CUFF_SEAM} fill="none" stroke={ink} strokeWidth={weight * 0.75} />
        </>
      ) : null}
    </g>
  );
}
