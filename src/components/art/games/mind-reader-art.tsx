/**
 * Binary search, drawn: the numbers 1 to 100, already halved twice
 * ("more than 50?" no, "even?" yes). Hovering answers the next question and
 * another half goes dark.
 */
export function MindReaderArt() {
  const step = 20;
  const cell = 17;
  const gx = 58;
  const gy = 30;
  const cells = Array.from({ length: 100 }, (_, i) => {
    const n = i + 1;
    const out = n > 50 || n % 2 === 1;
    const next = !out && n > 26;
    return { n, x: gx + (i % 10) * step, y: gy + Math.floor(i / 10) * step, out, next };
  });

  return (
    <svg viewBox="40 18 426 222" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden style={{ fontFamily: "var(--font-mona)" }}>
      {cells.map((c) =>
        c.out ? (
          <rect key={c.n} x={c.x} y={c.y} width={cell} height={cell} rx={4.5} fill="currentColor" fillOpacity={0.12} />
        ) : (
          <g key={c.n} className={c.next ? "art-move group-hover/tile:opacity-25" : undefined}>
            <rect x={c.x} y={c.y} width={cell} height={cell} rx={4.5} fill="white" fillOpacity={0.95} />
            <text
              x={c.x + cell / 2}
              y={c.y + cell / 2 + 3.2}
              textAnchor="middle"
              fontSize={8.6}
              fontWeight={700}
              fill="currentColor"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {c.n}
            </text>
          </g>
        ),
      )}

      {/* The halving line. */}
      <path d={`M${gx - 8} ${gy + step * 5 - 1.5}H${gx + step * 10 + 5}`} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 6" />

      {/* The question card. */}
      <g transform="translate(300 62)">
        <rect width={150} height={142} rx={20} fill="white" fillOpacity={0.96} />
        <text x={18} y={30} fontSize={9.5} fontWeight={600} fill="currentColor" fillOpacity={0.6} letterSpacing="0.08em" style={{ fontFamily: "var(--font-martian)" }}>
          QUESTION 3
        </text>
        <text x={18} y={58} fontSize={17} fontWeight={760} fill="currentColor">
          Is it more
        </text>
        <text x={18} y={79} fontSize={17} fontWeight={760} fill="currentColor">
          than 26?
        </text>
        <rect x={18} y={98} width={54} height={28} rx={14} fill="none" stroke="currentColor" strokeWidth={2} />
        <text x={45} y={116.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="currentColor">
          Yes
        </text>
        <rect x={80} y={98} width={54} height={28} rx={14} fill="none" stroke="currentColor" strokeWidth={2} />
        <rect x={80} y={98} width={54} height={28} rx={14} fill="currentColor" className="art-move opacity-0 group-hover/tile:opacity-100" />
        <text x={107} y={116.5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="currentColor" className="art-move group-hover/tile:fill-white">
          No
        </text>
      </g>
    </svg>
  );
}
