export type ThemeId = "dawn" | "dusk" | "night";

export interface Theme {
  id: ThemeId;
  sky: [string, string];
  /** Sun or moon: position as a fraction of the screen, radius in screen-heights. */
  orb: { color: string; glow: string; x: number; y: number; r: number };
  stars: boolean;
  /** Far → near silhouette colours and shape style. */
  layers: [string, string, string];
  layerStyle: "hills" | "mesas" | "peaks";
  platform: { body: string; top: string; lip: string; shade: string };
  mover: { body: string; top: string; lip: string; shade: string };
  hazard: string;
  hazardDark: string;
  spark: string;
  sparkCore: string;
  /** Particle tints (numbers for Phaser). */
  dust: number;
  mote: number;
  sign: { board: string; ink: string; post: string };
  finish: { a: string; b: string; post: string };
  flag: { idle: string; active: string; pole: string };
  pad: string;
  boost: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  dawn: {
    id: "dawn",
    sky: ["#F5ECDF", "#F7D3BA"],
    orb: { color: "#FCE4CA", glow: "rgba(255, 238, 214, 0.55)", x: 0.74, y: 0.34, r: 0.13 },
    stars: false,
    layers: ["#EECAAE", "#E3AC8F", "#CF8D72"],
    layerStyle: "hills",
    platform: { body: "#2A231F", top: "#3D322B", lip: "#F7D9B9", shade: "#1C1714" },
    mover: { body: "#2A231F", top: "#FF8A55", lip: "#FFC6A6", shade: "#1C1714" },
    hazard: "#E0245E",
    hazardDark: "#9C1442",
    spark: "#FFBF2E",
    sparkCore: "#FFF6D6",
    dust: 0xc9a58a,
    mote: 0xffffff,
    sign: { board: "#2A231F", ink: "#F7E6D2", post: "#2A231F" },
    finish: { a: "#2A231F", b: "#F7E6D2", post: "#2A231F" },
    flag: { idle: "#B9A698", active: "#14B8A6", pole: "#2A231F" },
    pad: "#14B8A6",
    boost: "#FF8A55",
  },
  dusk: {
    id: "dusk",
    sky: ["#0E3A44", "#2F7C77"],
    orb: { color: "#F8CB78", glow: "rgba(248, 203, 120, 0.35)", x: 0.24, y: 0.6, r: 0.11 },
    stars: false,
    layers: ["#1E6165", "#164C52", "#0F3940"],
    layerStyle: "mesas",
    platform: { body: "#E9DBBC", top: "#F7EEDC", lip: "#FFFFFF", shade: "#C9B793" },
    mover: { body: "#E9DBBC", top: "#F8B84E", lip: "#FFE3A8", shade: "#C9B793" },
    hazard: "#FF3D6E",
    hazardDark: "#B01E4A",
    spark: "#FFD045",
    sparkCore: "#FFF8DC",
    dust: 0xd6c6a3,
    mote: 0xfff2c8,
    sign: { board: "#F7EEDC", ink: "#0F3940", post: "#E9DBBC" },
    finish: { a: "#0F3940", b: "#F7EEDC", post: "#E9DBBC" },
    flag: { idle: "#8FB3AE", active: "#F8B84E", pole: "#E9DBBC" },
    pad: "#F8B84E",
    boost: "#F8B84E",
  },
  night: {
    id: "night",
    sky: ["#0A0920", "#2B2058"],
    orb: { color: "#ECE7FF", glow: "rgba(190, 176, 255, 0.28)", x: 0.8, y: 0.2, r: 0.075 },
    stars: true,
    layers: ["#261D50", "#1C1541", "#130E2F"],
    layerStyle: "peaks",
    platform: { body: "#2B2366", top: "#43389A", lip: "#B3A6FF", shade: "#1E184E" },
    mover: { body: "#2B2366", top: "#56E0E6", lip: "#C3FAFC", shade: "#1E184E" },
    hazard: "#FF4F8B",
    hazardDark: "#B3245A",
    spark: "#FFD84D",
    sparkCore: "#FFFBE6",
    dust: 0x8f86d9,
    mote: 0xcfc6ff,
    sign: { board: "#43389A", ink: "#F1EEFF", post: "#43389A" },
    finish: { a: "#130E2F", b: "#ECE7FF", post: "#43389A" },
    flag: { idle: "#5C5591", active: "#56E0E6", pole: "#8C82D8" },
    pad: "#56E0E6",
    boost: "#56E0E6",
  },
};

/** The ball is the one constant across every world — the brand colour. */
export const BALL_COLORS = {
  base: "#FF5B23",
  band: "#FFF1E2",
  bandEdge: "#D9430F",
  shade: "rgba(70, 18, 0, 0.42)",
};

export const hex = (css: string) => parseInt(css.replace("#", ""), 16);
