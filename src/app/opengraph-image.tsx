import { ImageResponse } from "next/og";

export const alt = "Beyond the Algorithm: ten games that show what AI can work out about you";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SPECTRUM = ["#ff6fa6", "#ffd93d", "#b6f04a", "#6ec8ff", "#ff7a5c", "#4fe0b0", "#4fd6e8", "#ffa64d", "#7aa0ff"];

export default function OpengraphImage() {
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
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", width: 132, gap: 12 }}>
          {SPECTRUM.map((c) => (
            <div key={c} style={{ width: 36, height: 36, borderRadius: 18, background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1, letterSpacing: -3, maxWidth: 980 }}>
            How much can a machine work out about you?
          </div>
          <div style={{ fontSize: 32, color: "#b9bdca" }}>Beyond the Algorithm · EDEX 2026 · IISJ Computer Science</div>
        </div>
      </div>
    ),
    size,
  );
}
