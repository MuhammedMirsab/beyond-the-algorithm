import { Hand } from "./hand-shapes";

/**
 * Your open hand against the AI's card, face down and locked before you
 * throw. Hovering reveals what it locked in: scissors, which beats paper.
 */
export function RpsArt() {
  return (
    <svg viewBox="58 24 366 212" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden style={{ fontFamily: "var(--font-mona)" }}>
      {/* You */}
      <g transform="translate(70 38) rotate(-5 60 92)">
        <rect width={124} height={184} rx={22} fill="white" fillOpacity={0.96} />
        <g transform="translate(13 26) scale(0.98)">
          <Hand shape="paper" />
        </g>
        <text x={62} y={164} textAnchor="middle" fontSize={15} fontWeight={760} fill="currentColor">
          You
        </text>
      </g>

      <text x={240} y={138} textAnchor="middle" fontSize={20} fontWeight={800} fill="currentColor" fillOpacity={0.75}>
        vs
      </text>

      {/* The AI's sealed card */}
      <g transform="translate(286 38) rotate(5 62 92)">
        <rect width={124} height={184} rx={22} fill="currentColor" />
        <g className="art-move group-hover/tile:scale-75 group-hover/tile:opacity-0">
          <rect x={44} y={74} width={36} height={30} rx={7} fill="var(--game)" />
          <path d="M51 74v-9a11 11 0 0 1 22 0v9" fill="none" stroke="var(--game)" strokeWidth={5} strokeLinecap="round" />
          <circle cx={62} cy={88} r={3.6} fill="currentColor" />
        </g>
        <g className="art-move scale-75 opacity-0 group-hover/tile:scale-100 group-hover/tile:opacity-100">
          <g transform="translate(13 26) scale(0.98)">
            <Hand shape="scissors" ink="var(--game)" paper="currentColor" />
          </g>
        </g>
        <text x={62} y={164} textAnchor="middle" fontSize={15} fontWeight={760} fill="var(--game)">
          AI
        </text>
      </g>
    </svg>
  );
}
