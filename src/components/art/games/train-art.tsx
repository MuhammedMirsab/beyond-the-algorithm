/**
 * A body as 17 points, waving, next to the two moves it was taught.
 * Hovering waves the arm and the matching example lights up.
 */
type Pose = Record<"head" | "ls" | "rs" | "le" | "re" | "lw" | "rw" | "lh" | "rh" | "lk" | "rk" | "la" | "ra", [number, number]>;

const WAVE: Pose = {
  head: [140, 54],
  ls: [116, 92],
  rs: [164, 92],
  le: [96, 128],
  lw: [88, 166],
  re: [192, 74],
  rw: [202, 34],
  lh: [124, 158],
  rh: [156, 158],
  lk: [120, 198],
  rk: [162, 198],
  la: [116, 236],
  ra: [166, 236],
};

const CLAP: Pose = {
  ...WAVE,
  le: [108, 124],
  lw: [136, 118],
  re: [172, 124],
  rw: [144, 118],
};

function Skeleton({ pose, scale = 1, dot = 5, line = 3.4, waveArm = false }: { pose: Pose; scale?: number; dot?: number; line?: number; waveArm?: boolean }) {
  const p = (k: keyof Pose) => pose[k];
  const seg = (a: keyof Pose, b: keyof Pose) => `M${p(a)[0]} ${p(a)[1]}L${p(b)[0]} ${p(b)[1]}`;
  const body = [seg("ls", "rs"), seg("ls", "le"), seg("le", "lw"), seg("ls", "lh"), seg("rs", "rh"), seg("lh", "rh"), seg("lh", "lk"), seg("lk", "la"), seg("rh", "rk"), seg("rk", "ra"), seg("rs", "re")];
  const joints: (keyof Pose)[] = ["ls", "rs", "le", "lw", "re", "lh", "rh", "lk", "rk", "la", "ra"];
  return (
    <g transform={`scale(${scale})`}>
      {body.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth={line} strokeLinecap="round" />
      ))}
      <g
        className={waveArm ? "art-move group-hover/tile:rotate-[-26deg]" : undefined}
        style={waveArm ? { transformBox: "view-box", transformOrigin: `${p("re")[0]}px ${p("re")[1]}px` } : undefined}
      >
        <path d={seg("re", "rw")} stroke="currentColor" strokeWidth={line} strokeLinecap="round" />
        <circle cx={p("rw")[0]} cy={p("rw")[1]} r={dot} fill="white" stroke="currentColor" strokeWidth={line * 0.72} />
      </g>
      <circle cx={p("head")[0]} cy={p("head")[1]} r={16} fill="white" stroke="currentColor" strokeWidth={line} />
      {joints.map((k) => (
        <circle key={k} cx={p(k)[0]} cy={p(k)[1]} r={dot} fill="white" stroke="currentColor" strokeWidth={line * 0.72} />
      ))}
    </g>
  );
}

function ExampleCard({ y, pose, label, lit }: { y: number; pose: Pose; label: string; lit?: boolean }) {
  return (
    <g transform={`translate(270 ${y})`}>
      <rect width={176} height={76} rx={16} fill="white" fillOpacity={0.95} />
      {lit ? (
        <rect width={176} height={76} rx={16} fill="none" stroke="currentColor" strokeWidth={3} className="art-move opacity-0 group-hover/tile:opacity-100" />
      ) : null}
      <g transform="translate(-14 -2)">
        <Skeleton pose={pose} scale={0.36} dot={9} line={7} />
      </g>
      <text x={74} y={34} fontSize={16} fontWeight={760} fill="currentColor" style={{ fontFamily: "var(--font-mona)" }}>
        {label}
      </text>
      {Array.from({ length: 5 }, (_, i) => (
        <circle key={i} cx={78 + i * 14} cy={54} r={4.5} fill="currentColor" fillOpacity={0.85} />
      ))}
    </g>
  );
}

export function TrainArt() {
  return (
    <svg viewBox="60 18 400 236" className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <g transform="translate(14 0)">
        <Skeleton pose={WAVE} waveArm />
      </g>
      <ExampleCard y={42} pose={WAVE} label="Wave" lit />
      <ExampleCard y={140} pose={CLAP} label="Clap" />
    </svg>
  );
}
