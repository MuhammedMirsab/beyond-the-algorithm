"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef } from "react";
import { HowItWorks } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { formatDegrees, formatRatio } from "../engine/format";
import { LM } from "../engine/vision/face-metrics";
import { jumpThresholds } from "../engine/vision/face-controller";
import type { CalibrationResult, FaceControlSession, TrackingStats } from "../play/session";
import { tokenColor } from "./canvas-colors";
import { useSettings } from "./hooks";

/** The visitor's own 478 points at their neutral pose: no photo, only the numbers the model produced. */
function PointsVisual({ points, aspect }: { points: { x: number; y: number }[]; aspect: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || points.length === 0) return;
    const dot = tokenColor(canvas, "--game", 0.9, "rgba(198, 243, 107, 0.9)");
    const line = tokenColor(canvas, "--color-fg", 1, "rgba(255, 255, 255, 1)");

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      // Camera pixels, mirrored like the preview, fitted into the box.
      const px = points.map((p) => ({ x: (1 - p.x) * aspect, y: p.y }));
      const xs = px.map((p) => p.x);
      const ys = px.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const w = Math.max(...xs) - minX || 1;
      const h = Math.max(...ys) - minY || 1;
      const pad = 18;
      const scale = Math.min((rect.width - pad * 2) / w, (rect.height - pad * 2) / h);
      const ox = (rect.width - w * scale) / 2;
      const oy = (rect.height - h * scale) / 2;
      const at = (i: number) => ({ x: ox + (px[i].x - minX) * scale, y: oy + (px[i].y - minY) * scale });

      ctx.fillStyle = dot;
      ctx.beginPath();
      for (let i = 0; i < px.length; i++) {
        const p = at(i);
        ctx.moveTo(p.x + 1.1, p.y);
        ctx.arc(p.x, p.y, 1.1, 0, Math.PI * 2);
      }
      ctx.fill();

      // The two measurements: the eye line and the lip gap.
      ctx.strokeStyle = line;
      ctx.fillStyle = line;
      ctx.lineWidth = 2;
      const pairs: [number, number][] = [
        [LM.rightEyeOuter, LM.leftEyeOuter],
        [13, 14],
      ];
      for (const [a, b] of pairs) {
        if (!px[a] || !px[b]) continue;
        const p = at(a);
        const q = at(b);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
        for (const r of [p, q]) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [points, aspect]);

  return (
    <div className="dot-field aspect-[4/3] w-full">
      <canvas ref={ref} role="img" aria-label={`Your ${points.length} face points`} className="block size-full" />
    </div>
  );
}

/** Machine-voice readout of the two numbers. */
function Readout({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="dot-field flex flex-col gap-3 p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="type-label text-fg-subtle">{label}</dt>
          <dd className="type-title-3 tabular-nums text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The reveal. With the camera, every number is this visitor's own: their
 * points, their tilt in degrees, their mouth ratio, the jump line and the
 * tracking rate measured on this laptop. Steps that were skipped show no number.
 */
export function FaceHowItWorks({
  session,
  calibration,
  tracking,
}: {
  session: FaceControlSession;
  /** Null when the visitor never calibrated (keyboard play): the reveal then explains without numbers. */
  calibration: CalibrationResult | null;
  tracking: TrackingStats;
}) {
  const { jumpSensitivity } = useSettings();

  if (!calibration) {
    return (
      <div className="flex flex-col gap-6">
        <HowItWorks
          title="How the face controls work"
          intro="You played with the keys this time. With the camera on, the game reads your face instead."
          steps={[
            {
              title: "478 points on a face",
              text: "A face model looks at each camera picture and places 478 points on the eyes, lips, nose and face outline.",
            },
            {
              title: "Two numbers",
              text: "The game keeps only two: the angle of the line between the eyes, and how open the mouth is compared with how far apart the eyes are.",
            },
            {
              title: "A controller",
              text: "Tilting your head rolls the ball. Opening your mouth makes it jump. No buttons at all.",
            },
          ]}
        />
        <div>
          <Button variant="secondary" size="lg" icon={<Camera />} onClick={() => session.act({ type: "choose-camera" })}>
            Play with your face
          </Button>
        </div>
      </div>
    );
  }

  const { measured, profile, points, aspect } = calibration;
  const fps = tracking.fps ? Math.round(tracking.fps) : null;
  const count = tracking.points ?? points?.length ?? 478;
  const jumpAt = jumpThresholds(profile, jumpSensitivity).openAt;
  const chip = tracking.delegate === "GPU" ? "graphics chip (GPU)" : tracking.delegate === "CPU" ? "processor (CPU)" : null;
  const where = chip ? ` It ran on this laptop’s ${chip}, not on the internet.` : " It ran on this laptop, not on the internet.";

  const left = measured.left !== null ? formatDegrees(measured.left) : null;
  const right = measured.right !== null ? formatDegrees(measured.right) : null;
  const closed = measured.mouthClosed !== null ? formatRatio(measured.mouthClosed) : null;
  const open = measured.mouthOpen !== null ? formatRatio(measured.mouthOpen) : null;

  // Only what this visitor actually showed the camera: a skipped step adds no number.
  const sentences: string[] = [];
  if (left && right) sentences.push(`You tilted about ${left} left and ${right} right.`);
  else if (left) sentences.push(`You tilted about ${left} left.`);
  else if (right) sentences.push(`You tilted about ${right} right.`);
  if (closed && open) sentences.push(`Your mouth measured ${closed} closed and ${open} wide open.`);
  else if (open) sentences.push(`Wide open, your mouth measured ${open}.`);
  else if (closed) sentences.push(`Closed, your mouth measured ${closed}.`);

  const rows: [string, string][] = [];
  if (left || right) rows.push(["Eye line, your tilt", [left && `${left} left`, right && `${right} right`].filter(Boolean).join(" · ")]);
  if (closed || open) rows.push(["Mouth", [closed && `${closed} closed`, open && `${open} open`].filter(Boolean).join(" · ")]);
  rows.push(["Jump line", formatRatio(jumpAt)]);

  const twoNumbers = [
    "The angle of the line between your eyes, and how open your mouth was compared with how far apart your eyes are.",
    ...sentences,
  ].join(" ");

  return (
    <HowItWorks
      intro="The model never knew who you were. It found points on a face and measured two things about them."
      steps={[
        {
          title: `${count} points on your face`,
          text: `A face model found ${count} points on your eyes, lips, nose and face outline in every camera picture${fps ? `, about ${fps} times a second` : ""}.${where}`,
          visual: points?.length ? <PointsVisual points={points} aspect={aspect} /> : undefined,
        },
        {
          title: "Two numbers",
          text: twoNumbers,
          visual: <Readout rows={rows} />,
        },
        {
          title: "A controller",
          text: `Tilting past the neutral zone rolled the ball. Opening your mouth past ${formatRatio(jumpAt)} made it jump, once each time you opened it. That was the whole controller: two numbers${fps ? `, checked ${fps} times a second` : ""}.`,
        },
      ]}
    />
  );
}
