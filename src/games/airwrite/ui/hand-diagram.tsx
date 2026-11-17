import { HAND_CONNECTIONS } from "../engine/gesture";
import { cn } from "@/lib/cn";

/** A pointing hand in MediaPipe's 21-point layout (0..100 space). Middle, ring and pinky are curled. */
const POINTS: [number, number][] = [
  [50, 96],
  [38, 89], [29, 80], [23, 71], [18, 63],
  [40, 60], [38, 44], [37, 33], [36, 21],
  [50, 59], [51, 47], [51, 40], [51, 34],
  [59, 61], [61, 51], [61, 45], [61, 40],
  [67, 65], [70, 57], [71, 52], [72, 47],
];

const TIP = 8;

/** What the hand model sees: 21 points and the bones between them. The index tip, the pen, is in the game colour. */
export function HandDiagram({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="A hand drawn as 21 points" className={cn("text-fg", className)}>
      <g stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" opacity={0.45}>
        {HAND_CONNECTIONS.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={POINTS[a][0]} y1={POINTS[a][1]} x2={POINTS[b][0]} y2={POINTS[b][1]} />
        ))}
      </g>
      {POINTS.map(([x, y], i) => (i === TIP ? null : <circle key={i} cx={x} cy={y} r={2} fill="currentColor" />))}
      <circle cx={POINTS[TIP][0]} cy={POINTS[TIP][1]} r={7.5} fill="none" strokeWidth={1.2} className="stroke-game" />
      <circle cx={POINTS[TIP][0]} cy={POINTS[TIP][1]} r={3.6} className="fill-game" />
    </svg>
  );
}
