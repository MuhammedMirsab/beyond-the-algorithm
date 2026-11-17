/**
 * Three hand shapes for rock, paper and scissors, drawn on a 100 x 110 grid.
 * Fingers are drawn before the palm so the palm's edge reads as the knuckle line.
 */
export type HandShape = "rock" | "paper" | "scissors";

export function Hand({ shape, ink = "currentColor", paper = "white" }: { shape: HandShape; ink?: string; paper?: string }) {
  const s = { stroke: ink, strokeWidth: 3.5, strokeLinejoin: "round" as const, fill: paper };
  if (shape === "paper") {
    return (
      <g>
        <rect x={6} y={46} width={16} height={44} rx={8} transform="rotate(-36 14 86)" {...s} />
        <rect x={22} y={16} width={16} height={56} rx={8} {...s} />
        <rect x={39} y={6} width={16} height={66} rx={8} {...s} />
        <rect x={56} y={10} width={16} height={62} rx={8} {...s} />
        <rect x={73} y={22} width={15} height={50} rx={7.5} {...s} />
        <rect x={20} y={54} width={70} height={50} rx={22} {...s} />
      </g>
    );
  }
  if (shape === "scissors") {
    return (
      <g>
        <rect x={30} y={4} width={16} height={66} rx={8} transform="rotate(-14 38 70)" {...s} />
        <rect x={52} y={4} width={16} height={66} rx={8} transform="rotate(12 60 70)" {...s} />
        <rect x={20} y={52} width={70} height={52} rx={22} {...s} />
        <rect x={62} y={54} width={22} height={16} rx={8} {...s} />
        <rect x={26} y={72} width={40} height={15} rx={7.5} {...s} />
      </g>
    );
  }
  return (
    <g>
      <rect x={16} y={34} width={76} height={70} rx={26} {...s} />
      <rect x={24} y={44} width={18} height={24} rx={9} {...s} />
      <rect x={42} y={42} width={18} height={26} rx={9} {...s} />
      <rect x={60} y={44} width={18} height={24} rx={9} {...s} />
      <rect x={20} y={70} width={46} height={16} rx={8} {...s} />
    </g>
  );
}
