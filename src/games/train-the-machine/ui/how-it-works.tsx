"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FEATURE_GROUPS, spreadByMove } from "../engine/explain";
import { FEATURE_COUNT, averageShape, type ShapePoint } from "../engine/features";
import { KP, MIN_POINT_SCORE, type Keypoint } from "../engine/types";
import { BONES } from "../engine/vision";
import { MoveGlyph } from "./figures";
import type { Example, Examples, Move, MoveId } from "./model";
import { shares, type TestTally } from "./test-tally";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_MOVE = [0.77, 0, 0.175, 1] as const;

const pct = (value: number) => `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
const num = (value: number) => (value < 0 ? `−${Math.abs(value).toFixed(2)}` : value.toFixed(2));

/** Plays once, when most of it has scrolled into view. */
function useReveal<T extends Element>() {
  const ref = useRef<T | null>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  return { ref, shown: inView };
}

/**
 * "How it did it": five steps, each a picture made from this visitor's own
 * examples and test, so the explanation is about what they just did.
 */
export function TrainHowItWorks({
  moves,
  examples,
  tally,
  rate,
  threshold,
}: {
  moves: readonly [Move, Move];
  examples: Examples;
  tally: TestTally;
  rate: number;
  threshold: number;
}) {
  const [a] = moves;
  const total = examples.a.length + examples.b.length;
  // The example with a photo and the clearest body: the one with the most points seen.
  const sample = [...examples.a, ...examples.b]
    .filter((e) => e.thumbnail)
    .sort((x, y) => seenCount(y.keypoints) - seenCount(x.keypoints))[0];
  const featureSample = sample ?? examples.a[0] ?? examples.b[0];
  const spread = spreadByMove({ a: examples.a.map((e) => e.features), b: examples.b.map((e) => e.features) });
  const legs = moves.some((m) => examples[m.id].some((e) => e.shape?.slice(9).some((p) => p.visible)));
  const line = Math.round(threshold * 100);
  const tested = tally.frames > 0;

  return (
    <section aria-labelledby="how-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="how-title" className="type-title-1 text-fg">
          How it did it
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          It never learned what “{a.name}” means. It turned your body into numbers and compared them with the {total} examples
          you gave it.
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        <Chapter
          index={1}
          title="Your body became points"
          visual={sample ? <BodyPoints example={sample} /> : null}
          readout={sample ? wristReadout(sample) : null}
        >
          In every frame, a pose model found 17 points on you, from your nose to your ankles. It measures them from the middle of
          your hips, in torso lengths, so it doesn’t matter where you stand or how tall you are.
        </Chapter>

        <Chapter
          index={2}
          title={`Each example became ${FEATURE_COUNT} numbers`}
          visual={featureSample ? <NumberRows values={featureSample.features} /> : null}
          readout={`${total} examples × ${FEATURE_COUNT} numbers = ${(total * FEATURE_COUNT).toLocaleString("en")} numbers`}
        >
          Where 13 of the points are, how bent your legs are, how high your hands are, which hand shape it sees, and how you
          moved over the last 1.5 seconds. These {FEATURE_COUNT} numbers are all it ever looks at.
        </Chapter>

        <Chapter
          index={3}
          title="Each move became one pattern"
          visual={<Patterns moves={moves} examples={examples} legs={legs} />}
          readout={moves.map((m) => `${m.name}: ${examples[m.id].length} examples`).join(" · ")}
        >
          For each move it averaged your examples into one pattern, shown in bold. It also keeps every example, because a new pose
          might be closest to one example even when it is far from the average.
        </Chapter>

        <Chapter
          index={4}
          title={`Under ${line}%, it says Not sure`}
          visual={<MatchScale moves={moves} tally={tally} threshold={threshold} />}
          readout={
            tested
              ? `It judged ${tally.frames.toLocaleString("en")} frames${rate > 0 ? `, about ${rate} a second` : ""}`
              : "Test it to see your own numbers here"
          }
        >
          Every frame, it measures how alike your pose is to each move: your 3 closest examples and the pattern. 100% would be
          identical. It picks the closest move, but only if it is at least {line}% alike. Otherwise it says Not sure instead of
          guessing.
        </Chapter>

        <Chapter
          index={5}
          title="Why varied examples help"
          visual={<Variety moves={moves} spread={spread} />}
          readout={moves
            .filter((m) => spread[m.id])
            .map((m) => `${m.name}: ${pct(spread[m.id].mean)} alike on average`)
            .join(" · ")}
        >
          {varietyText(moves, spread)}
        </Chapter>
      </ol>
    </section>
  );
}

function Chapter({
  index,
  title,
  visual,
  readout,
  children,
}: {
  index: number;
  title: string;
  visual: ReactNode;
  readout?: string | null;
  children: ReactNode;
}) {
  return (
    <li className="grid items-center gap-6 rounded-xl bg-surface p-4 shadow-ring sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-8 lg:p-8">
      <div className="dot-field relative aspect-[4/3] overflow-hidden rounded-lg bg-sunken">{visual}</div>
      <div className="flex min-w-0 flex-col gap-3">
        <span className="type-label text-game">Step {index}</span>
        <h3 className="type-title-2 text-fg">{title}</h3>
        <p className="type-body-lg text-fg-muted">{children}</p>
        {readout ? <p className="type-label tabular-nums text-fg-subtle">{readout}</p> : null}
      </div>
    </li>
  );
}

const seenCount = (points: readonly Keypoint[]) => points.filter((p) => p.score > MIN_POINT_SCORE).length;

/** "One wrist: 0.42 across and 1.85 up from your hips", from the example's own measured points. */
function wristReadout(example: Example): string | null {
  const shape = example.shape;
  if (!shape) return null;
  // SHAPE_POINTS order: 5 and 6 are the wrists.
  const wrists = [shape[5], shape[6]].filter((p) => p.visible);
  if (!wrists.length) return null;
  const high = wrists.reduce((best, p) => (p.y < best.y ? p : best));
  const up = -high.y;
  return `One wrist: ${num(Math.abs(high.x))} across and ${num(Math.abs(up))} ${up >= 0 ? "up" : "down"} from your hips, in torso lengths`;
}

function varietyText(moves: readonly [Move, Move], spread: ReturnType<typeof spreadByMove>): string {
  const means = moves.map((m) => spread[m.id]?.mean ?? 0);
  const lowest = Math.min(...means);
  const loosest = moves[means.indexOf(lowest)];
  if (lowest >= 0.9) {
    return "Your examples of each move were very alike, so it knows one exact version of each. Show it a few different ways, a bit higher or lower or with the other hand, and it learns what stays the same, so it recognises the move when someone else does it.";
  }
  if (lowest >= 0.7) {
    return "Your examples were a little different from each other, so it knows more than one version of each move. That variety helps it recognise the move when it is done a bit differently, as long as the two moves stay clearly apart.";
  }
  // Low alike-ness: the examples were all over the place, or the two moves look alike to it.
  return `Your ${loosest.name} examples were far from their own pattern: either they were very different from each other, or they looked a lot like your other move. A few clear, slightly varied examples that look different from the other move make it surer.`;
}

/* ── 1. The points, measured from the hips ─────────────────────────── */

function BodyPoints({ example }: { example: Example }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reduce = useReducedMotion();
  const w = 400;
  const h = Math.round(w / example.ratio);
  const kp = example.keypoints;
  const seen = (p: Keypoint | undefined): p is Keypoint => !!p && p.score > MIN_POINT_SCORE;
  const X = (p: Keypoint) => (1 - p.x) * w;
  const Y = (p: Keypoint) => p.y * h;
  const hips = [kp[KP.leftHip], kp[KP.rightHip]];
  const shoulders = [kp[KP.leftShoulder], kp[KP.rightShoulder]];
  const hasTorso = hips.every(seen) && shoulders.every(seen);
  const hip = hasTorso ? { x: (X(hips[0]) + X(hips[1])) / 2, y: (Y(hips[0]) + Y(hips[1])) / 2 } : null;
  const shoulder = hasTorso ? { x: (X(shoulders[0]) + X(shoulders[1])) / 2, y: (Y(shoulders[0]) + Y(shoulders[1])) / 2 } : null;
  const state = shown || reduce ? "on" : "off";
  // Head points first, then arms, then the body and legs: four quick groups.
  const group = (i: number) => (i <= 4 ? 0 : i <= 10 ? 1 : i <= 12 ? 2 : 3);

  return (
    <div ref={ref} className="absolute inset-0">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" className="size-full text-game" role="img" aria-label="One of your examples: the photo fades and the 17 points the pose model found remain, measured from the middle of your hips.">
        {example.thumbnail ? (
          <motion.image
            href={example.thumbnail}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid slice"
            initial={false}
            animate={{ opacity: state === "on" ? 0.22 : 1 }}
            transition={{ duration: 0.6, delay: 0.9, ease: EASE_OUT }}
          />
        ) : null}
        <g stroke="currentColor" strokeWidth={4} strokeLinecap="round">
          {BONES.map(([i, j]) => {
            const p = kp[i];
            const q = kp[j];
            if (!seen(p) || !seen(q)) return null;
            return (
              <motion.line
                key={`${i}-${j}`}
                x1={X(p)}
                y1={Y(p)}
                x2={X(q)}
                y2={Y(q)}
                initial={false}
                animate={{ opacity: state === "on" ? 1 : 0 }}
                transition={{ duration: 0.4, delay: 0.75, ease: EASE_OUT }}
              />
            );
          })}
        </g>
        {kp.map((p, i) =>
          seen(p) ? (
            <motion.circle
              key={p.name}
              cx={X(p)}
              cy={Y(p)}
              r={6}
              fill="white"
              stroke="currentColor"
              strokeWidth={3}
              initial={false}
              animate={state === "on" ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.2, delay: 0.25 + group(i) * 0.12 }}
            />
          ) : null,
        )}
        {hip && shoulder ? (
          <motion.g
            initial={false}
            animate={{ opacity: state === "on" ? 1 : 0 }}
            transition={{ duration: 0.4, delay: 1.5, ease: EASE_OUT }}
          >
            <line x1={hip.x} y1={hip.y} x2={shoulder.x} y2={shoulder.y} stroke="white" strokeWidth={3} strokeDasharray="6 6" />
            <circle cx={hip.x} cy={hip.y} r={10} fill="none" stroke="white" strokeWidth={3} />
            <path d={`M${hip.x - 18} ${hip.y}h36M${hip.x} ${hip.y - 18}v36`} stroke="white" strokeWidth={2} />
            <text
              x={hip.x + 16}
              y={(hip.y + shoulder.y) / 2}
              fill="white"
              fontSize={15}
              fontWeight={600}
              style={{ fontFamily: "var(--font-martian)" }}
              paintOrder="stroke"
              stroke="oklch(0 0 0 / 0.6)"
              strokeWidth={4}
            >
              1 torso
            </text>
          </motion.g>
        ) : null}
      </svg>
    </div>
  );
}

/* ── 2. The 44 numbers ──────────────────────────────────────────────── */

function NumberRows({ values }: { values: readonly number[] }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reduce = useReducedMotion();
  const max = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  const rows = FEATURE_GROUPS.map((g, i) => {
    const start = FEATURE_GROUPS.slice(0, i).reduce((sum, before) => sum + before.count, 0);
    return { ...g, slice: values.slice(start, start + g.count) };
  });
  const on = shown || reduce;
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`The ${values.length} numbers of one of your examples, in five groups, starting ${values.slice(0, 3).map(num).join(", ")}.`}
      className="absolute inset-0 flex flex-col justify-center gap-3 p-4 sm:gap-4 sm:p-6"
    >
      {rows.map((row, r) => (
        <motion.div
          key={row.id}
          className="flex flex-col gap-1.5"
          initial={false}
          animate={on ? { opacity: 1, x: 0 } : { opacity: 0, x: -12 }}
          transition={{ duration: 0.4, delay: r * 0.08, ease: EASE_OUT }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="type-label truncate text-fg-muted">{row.label}</span>
            <span className="type-label shrink-0 tabular-nums text-fg-subtle">
              {row.count} · {row.slice.slice(0, 2).map(num).join("  ")}
            </span>
          </div>
          {/* One cell size for every row, so the rows' lengths show how many numbers each group has. */}
          <div className="grid grid-cols-[repeat(26,minmax(0,1fr))] gap-[3px]">
            {row.slice.map((v, i) => (
              <span key={i} className="aspect-square rounded-[3px] bg-game" style={{ opacity: 0.1 + (0.9 * Math.abs(v)) / max }} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── 3. Examples averaged into one pattern ──────────────────────────── */

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

function ShapeLines({ shape, width, faint }: { shape: ShapePoint[]; width: number; faint?: boolean }) {
  return (
    <g stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeOpacity={faint ? 0.32 : 1}>
      {SHAPE_BONES.map(([i, j]) => {
        const p = shape[i];
        const q = shape[j];
        if (!p.visible || !q.visible) return null;
        // Mirrored, like the camera: a raised right hand shows on the right.
        return <line key={`${i}-${j}`} x1={-p.x} y1={p.y} x2={-q.x} y2={q.y} />;
      })}
    </g>
  );
}

function Patterns({ moves, examples, legs }: { moves: readonly [Move, Move]; examples: Examples; legs: boolean }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reduce = useReducedMotion();
  const on = shown || reduce;
  const box = legs ? "-2.1 -2.7 4.2 5.4" : "-2.1 -2.7 4.2 3.6";
  return (
    <div ref={ref} className="absolute inset-0 grid grid-cols-2 gap-2 p-3 sm:p-5">
      {moves.map((move) => {
        const shapes = examples[move.id].map((e) => e.shape).filter((s): s is ShapePoint[] => s !== null);
        const average = averageShape(shapes);
        return (
          <figure key={move.id} className="flex min-h-0 flex-col items-center gap-2">
            <svg viewBox={box} className="min-h-0 w-full flex-1 text-game" role="img" aria-label={`Your ${shapes.length} ${move.name} examples drawn on top of each other, and their average in bold.`}>
              {shapes.map((shape, i) => (
                <motion.g
                  key={i}
                  initial={false}
                  animate={{ opacity: on ? 1 : 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 4) * 0.08, ease: EASE_OUT }}
                >
                  <ShapeLines shape={shape} width={0.05} faint />
                </motion.g>
              ))}
              {average ? (
                <motion.g
                  initial={false}
                  animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.45, delay: 0.65, ease: EASE_OUT }}
                >
                  <ShapeLines shape={average} width={0.11} />
                  {average.map((p, i) =>
                    p.visible ? (
                      <circle
                        key={i}
                        cx={-p.x}
                        cy={p.y}
                        r={i === 0 ? 0.2 : 0.09}
                        className={i === 0 ? "fill-sunken" : "fill-fg"}
                        stroke="currentColor"
                        strokeWidth={i === 0 ? 0.08 : 0.05}
                      />
                    ) : null,
                  )}
                </motion.g>
              ) : null}
            </svg>
            <figcaption className="type-label flex items-center gap-1.5 text-fg-muted">
              <MoveGlyph icon={move.icon} className="size-4 text-game" />
              {move.name}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

/* ── 4. How alike, and the "Not sure" line ──────────────────────────── */

function MatchScale({ moves, tally, threshold }: { moves: readonly [Move, Move]; tally: TestTally; threshold: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reduce = useReducedMotion();
  const on = shown || reduce;
  const tested = tally.frames > 0;
  const split = shares(tally);
  const line = threshold * 100;
  const parts: { id: string; label: string; value: number; tone: string }[] = [
    { id: "a", label: moves[0].name, value: split.a, tone: "bg-game" },
    { id: "b", label: moves[1].name, value: split.b, tone: "bg-fg-muted" },
    { id: "unsure", label: "Not sure", value: split.unsure, tone: "bg-fg/25" },
  ];

  return (
    <div ref={ref} className="absolute inset-0 flex flex-col justify-center gap-7 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <span className="type-label text-fg-muted">{tested ? "Best match while you tested" : "How alike, 0 to 100%"}</span>
        <div className={cn("relative", tested && "pt-16")}>
          {tested
            ? moves.map((move, i) => {
                const value = Math.min(1, Math.max(0, tally.best[move.id as MoveId]));
                return (
                  // Two heights, so two close matches never cover each other.
                  <motion.span
                    key={move.id}
                    className="absolute top-0 flex h-16 -translate-x-1/2 flex-col items-center"
                    style={{ paddingTop: i * 26 }}
                    initial={false}
                    animate={{ left: on ? `${value * 100}%` : "0%", opacity: on ? 1 : 0 }}
                    transition={{ duration: 0.9, delay: 0.2 + i * 0.12, ease: EASE_MOVE }}
                  >
                    <span className="type-label inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-raised px-2 py-0.5 tabular-nums text-fg shadow-ring">
                      <MoveGlyph icon={move.icon} className="size-3.5 text-game" />
                      {pct(value)}
                    </span>
                    <span aria-hidden className="w-0.5 flex-1 bg-fg" />
                  </motion.span>
                );
              })
            : null}
          <div className="relative flex h-9 overflow-hidden rounded-md">
            <span className="type-label grid place-items-center bg-fg/[0.08] text-fg-subtle" style={{ width: `${line}%` }}>
              Not sure
            </span>
            <span className="type-label grid flex-1 place-items-center bg-game-soft text-game">Answers</span>
            <span aria-hidden className="absolute inset-y-0 w-0.5 bg-fg" style={{ left: `${line}%` }} />
          </div>
          <div className="type-label relative mt-1.5 h-5 tabular-nums text-fg-subtle">
            <span className="absolute left-0">0%</span>
            <span className="absolute -translate-x-1/2" style={{ left: `${line}%` }}>
              {Math.round(line)}%
            </span>
            <span className="absolute right-0">100%</span>
          </div>
        </div>
      </div>

      {tested ? (
        <div className="flex flex-col gap-2">
          <span className="type-label text-fg-muted">What it said, share of frames</span>
          <div className="flex h-3 overflow-hidden rounded-full bg-fg/10">
            {parts.map((part, i) => (
              <motion.span
                key={part.id}
                className={cn("h-full origin-left", part.tone)}
                style={{ width: `${part.value * 100}%` }}
                initial={false}
                animate={{ scaleX: on ? 1 : 0 }}
                transition={{ duration: 0.5, delay: 0.5 + i * 0.1, ease: EASE_OUT }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((part) => (
              <li key={part.id} className="type-label inline-flex items-center gap-1.5 tabular-nums text-fg-muted">
                <span aria-hidden className={cn("size-2 rounded-full", part.tone)} />
                {part.label} {pct(part.value)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ── 5. How varied the examples were ────────────────────────────────── */

function Variety({ moves, spread }: { moves: readonly [Move, Move]; spread: ReturnType<typeof spreadByMove> }) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  const reduce = useReducedMotion();
  const on = shown || reduce;
  // The axis runs from 50% to 100% alike: below half alike would be a different move.
  const position = (value: number) => Math.min(100, Math.max(0, ((value - 0.5) / 0.5) * 100));
  return (
    <div ref={ref} className="absolute inset-0 flex flex-col justify-center gap-7 p-4 sm:p-6">
      <span className="type-label text-fg-muted">Each dot is one example: how alike it is to its pattern</span>
      {moves.map((move, r) => {
        const s = spread[move.id];
        if (!s) return null;
        return (
          <div key={move.id} className="flex flex-col gap-2">
            <span className="type-small inline-flex items-center gap-2 font-semibold text-fg">
              <MoveGlyph icon={move.icon} className="size-5 text-game" />
              {move.name}
            </span>
            <div className="relative h-8 rounded-md bg-fg/[0.06]">
              {s.toPattern.map((value, i) => (
                <motion.span
                  key={i}
                  aria-hidden
                  className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sunken bg-game"
                  initial={false}
                  animate={{ left: on ? `${position(value)}%` : "100%", opacity: on ? 1 : 0 }}
                  transition={{ duration: 0.7, delay: 0.15 + r * 0.15 + Math.min(i, 4) * 0.04, ease: EASE_MOVE }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="type-label flex justify-between text-fg-subtle">
        <span>50% alike</span>
        <span>100%, all the same</span>
      </div>
    </div>
  );
}
