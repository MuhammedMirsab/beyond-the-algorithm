import { ImageResponse } from "next/og";

export const alt = "Beyond the Algorithm: nine games that show what AI can work out about you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The brand mark: one dot per game in hue order, on a 3 x 3 grid (see SpectrumMark). */
const ROWS = [
  ["#ff6fa6", "#ff7a5c", "#ffa64d"],
  ["#ffd93d", "#b6f04a", "#4fe0b0"],
  ["#4fd6e8", "#6ec8ff", "#7aa0ff"],
];

const TITLE = "How much can a machine work out about you?";
const LINE = "Beyond the Algorithm · EDEX 2026 · IISJ Computer Science";

/**
 * The site's own Mona Sans, so a shared link looks like the arcade. Google
 * Fonts serves TrueType (which the image renderer needs) subset to the text.
 * If the build is offline the card still renders, in the fallback face.
 */
async function monaSans(weight: number, width: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Mona+Sans:wdth,wght@${width},${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url)).text();
    const faces = css.split("@font-face").filter((face) => face.includes("src:"));
    const face = faces.find((f) => (width > 100 ? !f.includes("font-stretch: normal") : true)) ?? faces[0];
    const src = face?.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    return await (await fetch(src)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [display, body] = await Promise.all([monaSans(800, 112, TITLE), monaSans(500, 100, LINE)]);
  const fonts = [
    ...(display ? [{ name: "Mona Display", data: display, weight: 800 as const, style: "normal" as const }] : []),
    ...(body ? [{ name: "Mona Body", data: body, weight: 500 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0e1015",
          color: "#f6f7fb",
          fontFamily: "Mona Body, sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ROWS.map((row) => (
            <div key={row.join()} style={{ display: "flex", gap: 12 }}>
              {row.map((c) => (
                <div key={c} style={{ width: 36, height: 36, borderRadius: 18, background: c }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontFamily: "Mona Display, sans-serif",
              fontSize: 80,
              fontWeight: 800,
              lineHeight: 0.98,
              letterSpacing: -3,
              maxWidth: 1056,
            }}
          >
            {TITLE}
          </div>
          <div style={{ fontSize: 30, color: "#b9bdca" }}>{LINE}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
