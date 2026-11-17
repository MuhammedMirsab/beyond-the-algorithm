/**
 * Two hands make a frame; only what's inside is redrawn by the lens (here a
 * halftone). Hovering pushes the lens harder.
 */
const FX = 152;
const FY = 54;
const FW = 176;
const FH = 156;
const STEP = 11;

function inside(x: number, y: number) {
  return x > FX && x < FX + FW && y > FY && y < FY + FH;
}

/** Halftone of a simple scene: a sun and a hill, darker toward the bottom left. */
function tone(x: number, y: number) {
  const sun = Math.hypot(x - 262, y - 104) < 30 ? 1 : 0;
  const hill = y > 168 - Math.sin((x - FX) / 34) * 14 ? 0.85 : 0;
  const ramp = ((y - FY) / FH) * 0.45 + ((FX + FW - x) / FW) * 0.25;
  return Math.max(sun, hill, ramp);
}

const DOTS = (() => {
  const dots: { x: number; y: number; r: number; inFrame: boolean }[] = [];
  for (let y = 16; y < 250; y += STEP) {
    for (let x = 20; x < 470; x += STEP) {
      const inFrame = inside(x, y);
      dots.push({ x, y, r: inFrame ? Math.round((0.9 + tone(x, y) * 4.1) * 100) / 100 : 1.3, inFrame });
    }
  }
  return dots;
})();

function Finger({ d }: { d: string }) {
  return <path d={d} stroke="currentColor" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

export function ViewfinderArt() {
  return (
    <svg viewBox="96 6 288 254" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      {DOTS.map((d, i) =>
        d.inFrame ? (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="white" className="art-move group-hover/tile:scale-125" />
        ) : (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="currentColor" fillOpacity={0.14} />
        ),
      )}

      <rect x={FX} y={FY} width={FW} height={FH} fill="none" stroke="white" strokeWidth={2} strokeDasharray="1 7" strokeLinecap="round" />

      {/* Left hand: index up, thumb across, the corner of an L. */}
      <Finger d={`M${FX - 34} ${FY + FH + 44}L${FX} ${FY + FH}`} />
      <Finger d={`M${FX} ${FY + FH}V${FY + 62}`} />
      <Finger d={`M${FX} ${FY + FH}H${FX + 66}`} />
      {/* Right hand, rotated: index down, thumb across. */}
      <Finger d={`M${FX + FW + 34} ${FY - 44}L${FX + FW} ${FY}`} />
      <Finger d={`M${FX + FW} ${FY}V${FY + FH - 62}`} />
      <Finger d={`M${FX + FW} ${FY}H${FX + FW - 66}`} />

      {[
        [FX, FY + 62],
        [FX + 66, FY + FH],
        [FX + FW, FY + FH - 62],
        [FX + FW - 66, FY],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={7} fill="white" stroke="currentColor" strokeWidth={3} />
      ))}
    </svg>
  );
}
