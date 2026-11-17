import type { ReactNode } from "react";

/**
 * Examples in, a guess out: a pile of cups and a pile of pens teach the model,
 * then it labels a cup it has never seen. Hovering fans the examples out.
 */
function Cup() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-20 -16h34v24a14 14 0 0 1-14 14h-6a14 14 0 0 1-14-14z" fill="currentColor" fillOpacity={0.12} />
      <path d="M14 -10h4a8 8 0 0 1 0 16h-4" />
      <path d="M-12 -28c0-4 4-4 4-8M-2 -28c0-4 4-4 4-8" strokeWidth={3} strokeOpacity={0.6} />
    </g>
  );
}

function Pen() {
  return (
    <g transform="rotate(-38)" fill="none" stroke="currentColor" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
      <rect x={-6} y={-30} width={12} height={46} rx={4} fill="currentColor" fillOpacity={0.12} />
      <path d="M-6 16l6 14 6-14" />
      <path d="M-6 -18h12" />
    </g>
  );
}

function Stack({ x, label, children }: { x: number; label: string; children: ReactNode }) {
  const cards = [
    { angle: -12, hover: "group-hover/tile:-rotate-[9deg] group-hover/tile:-translate-x-2" },
    { angle: -4, hover: "" },
    { angle: 5, hover: "group-hover/tile:rotate-[9deg] group-hover/tile:translate-x-2" },
  ];
  return (
    <g transform={`translate(${x} 136)`}>
      {cards.map((card, i) => (
        <g key={card.angle} transform={`rotate(${card.angle})`}>
          <g className={card.hover ? `art-move ${card.hover}` : undefined}>
            <rect x={-42} y={-42} width={84} height={84} rx={14} fill="white" fillOpacity={0.96} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.5} />
            {i === cards.length - 1 ? children : null}
          </g>
        </g>
      ))}
      <g transform="translate(0 70)">
        <rect x={-30} y={-14} width={60} height={28} rx={14} fill="currentColor" />
        <text y={5.5} textAnchor="middle" fontSize={14} fontWeight={760} fill="white" style={{ fontFamily: "var(--font-mona)" }}>
          {label}
        </text>
      </g>
    </g>
  );
}

export function LearnsArt() {
  return (
    <svg viewBox="22 40 432 200" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <Stack x={78} label="cup">
        <Cup />
      </Stack>
      <Stack x={190} label="pen">
        <Pen />
      </Stack>

      <path d="M252 130h44m-12-11 12 11-12 11" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />

      {/* A new photo, and the model's answer. */}
      <g transform="translate(374 116)">
        <rect x={-62} y={-66} width={124} height={124} rx={18} fill="white" fillOpacity={0.96} />
        <g transform="translate(0 -6) scale(1.35)">
          <Cup />
        </g>
        <g transform="translate(0 84)">
          <rect x={-62} y={-16} width={124} height={32} rx={16} fill="white" fillOpacity={0.96} />
          <text x={-46} y={5.5} fontSize={14} fontWeight={760} fill="currentColor" style={{ fontFamily: "var(--font-mona)" }}>
            cup
          </text>
          <rect x={-8} y={-4} width={58} height={8} rx={4} fill="currentColor" fillOpacity={0.15} />
          <rect x={-8} y={-4} width={58} height={8} rx={4} fill="currentColor" className="art-move scale-x-[0.72] group-hover/tile:scale-x-[0.94]" style={{ transformOrigin: "left center" }} />
        </g>
      </g>
    </svg>
  );
}
