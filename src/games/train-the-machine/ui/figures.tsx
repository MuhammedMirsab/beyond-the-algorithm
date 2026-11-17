import { Hand, HandFist, PersonStanding, Pointer, ThumbsUp } from "lucide-react";
import type { ShapePoint } from "../engine/features";
import type { MoveIcon } from "../engine/presets";
import { MIN_POINT_SCORE, type Keypoint } from "../engine/types";
import { BONES } from "../engine/vision";
import { cn } from "@/lib/cn";

/* ── The machine's view: points and bones ─────────────────────────── */

/** Bones between the 13 measured points (nose, shoulders, elbows, wrists, hips, knees, ankles). */
const SHAPE_BONES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 7],
  [2, 8],
  [7, 8],
  [1, 3],
  [3, 5],
  [2, 4],
  [4, 6],
  [7, 9],
  [9, 11],
  [8, 10],
  [10, 12],
  [0, 1],
  [0, 2],
];

/**
 * A body drawn from the 13 measured points, in torso lengths around the hips.
 * Mirrored, like the camera, so a raised right hand shows on the right.
 */
export function PoseFigure({
  shape,
  legs = false,
  label,
  className,
}: {
  shape: ShapePoint[] | null;
  /** Leave room for legs (only when any were seen). */
  legs?: boolean;
  label: string;
  className?: string;
}) {
  const box = legs ? "-2 -2.6 4 5.2" : "-2 -2.6 4 3.4";
  return (
    <svg viewBox={box} role="img" aria-label={label} className={cn("block text-game", className)}>
      {shape ? (
        <>
          <g stroke="currentColor" strokeWidth={0.075} strokeLinecap="round">
            {SHAPE_BONES.map(([i, j]) => {
              const a = shape[i];
              const b = shape[j];
              if (!a.visible || !b.visible) return null;
              return <line key={`${i}-${j}`} x1={-a.x} y1={a.y} x2={-b.x} y2={b.y} />;
            })}
          </g>
          {shape.map((p, i) =>
            p.visible ? (
              <circle
                key={i}
                cx={-p.x}
                cy={p.y}
                r={i === 0 ? 0.2 : 0.085}
                className={i === 0 ? "fill-sunken" : "fill-fg"}
                stroke="currentColor"
                strokeWidth={i === 0 ? 0.075 : 0.045}
              />
            ) : null,
          )}
        </>
      ) : null}
    </svg>
  );
}

/** One example: the small photo with the 17 points it was measured from. */
export function ExampleThumb({
  thumbnail,
  keypoints,
  ratio,
  label,
}: {
  thumbnail: string | null;
  keypoints: readonly Keypoint[];
  ratio: number;
  /** Leave out when the picture is decoration next to other text. */
  label?: string;
}) {
  const w = 160;
  const h = Math.round(w / ratio);
  const seen = (p: Keypoint | undefined): p is Keypoint => !!p && p.score > MIN_POINT_SCORE;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="block size-full text-game"
    >
      {thumbnail ? (
        <image href={thumbnail} width={w} height={h} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <rect width={w} height={h} className="fill-sunken" />
      )}
      <g stroke="currentColor" strokeWidth={3} strokeLinecap="round">
        {BONES.map(([i, j]) => {
          const a = keypoints[i];
          const b = keypoints[j];
          if (!seen(a) || !seen(b)) return null;
          return <line key={`${i}-${j}`} x1={(1 - a.x) * w} y1={a.y * h} x2={(1 - b.x) * w} y2={b.y * h} />;
        })}
      </g>
      {keypoints.filter(seen).map((p) => (
        <circle key={p.name} cx={(1 - p.x) * w} cy={p.y * h} r={3.2} fill="white" stroke="currentColor" strokeWidth={1.6} />
      ))}
    </svg>
  );
}

/* ── Pictograms for the move cards (24 px grid, 2 px stroke, like lucide) ── */

function Body({ arms }: { arms: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v7" />
      <path d="M12 14 8.5 20" />
      <path d="m12 14 3.5 6" />
      <path d={arms} />
    </svg>
  );
}

const BODY_ARMS: Partial<Record<MoveIcon, string>> = {
  // One arm up, the hand moving.
  wave: "M12 9.5 7.5 13M12 9.5 16.5 4.5M19 2.5c.8.6 1.3 1.5 1.4 2.5",
  // Both hands meeting in front of the chest.
  clap: "M12 9.5 8 12.5l3-1.2M12 9.5l4 3-3-1.2",
  up: "M12 9.5 7.5 4.5M12 9.5l4.5-5",
  down: "M12 9.5 8.5 15M12 9.5l3.5 5.5",
};

export function MoveGlyph({ icon, className }: { icon: MoveIcon; className?: string }) {
  const arms = BODY_ARMS[icon];
  const glyph = arms ? (
    <Body arms={arms} />
  ) : icon === "open" ? (
    <Hand aria-hidden />
  ) : icon === "fist" ? (
    <HandFist aria-hidden />
  ) : icon === "thumb" ? (
    <ThumbsUp aria-hidden />
  ) : icon === "point" ? (
    <Pointer aria-hidden />
  ) : (
    <PersonStanding aria-hidden />
  );
  return <span className={cn("grid place-items-center [&_svg]:size-full", className)}>{glyph}</span>;
}
