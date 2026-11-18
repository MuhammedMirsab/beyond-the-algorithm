/**
 * Two programs share one lens library:
 *
 * FRAGMENT_SHADER, the single-pass compositor. One full-screen triangle; for
 * every pixel:
 *   1. sample the camera (cover/contain fit, optional mirror)
 *   2. signed distance to the hand frame (4 inward edge lines → AA mask)
 *   3. inside  → the selected lens (screen-space, so patterns never swim with
 *                hand jitter — the frame is a window onto a filtered layer)
 *      outside → the "world": desaturated + dimmed while a frame is up
 *
 * PREVIEW_FRAGMENT_SHADER, the filter picker's live thumbnails: one canvas
 * holds every thumbnail, and each pixel runs the lens of the thumbnail it
 * sits in, on the same camera picture scaled to fit. The library's view
 * uniforms (video rect, frame centre and box, face) become per-thumbnail
 * globals through #defines, so both programs run the exact same lens code.
 *
 * Lens order must match LENSES in ./lenses.ts.
 *
 * Both programs also come in a FALLBACK build with the previous Cartoon lens.
 * The renderer and the thumbnails switch to it only if a graphics driver
 * rejects the current one, so a shader problem can never take the game down.
 *
 * The capture flash of the original app is gone: the booth never saves
 * pictures of visitors, so there is nothing to flash for.
 */
export const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const MAIN_HEADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uVideo;
uniform vec2 uRes;        // canvas size (device px)
uniform vec4 uVideoRect;  // fitted video rect (device px): x, y, w, h
uniform float uMirror;    // 1 = mirror horizontally
uniform vec3 uEdges[4];   // inward edge lines: dot(n, p) + c, device px
uniform vec2 uCenter;     // frame centroid (device px)
uniform vec4 uBox;        // frame bounds: minX, minY, maxX, maxY
uniform float uActive;    // 0..1 lens visibility
uniform float uTime;      // seconds
uniform int uLens;
uniform int uPrevLens;
uniform float uMix;       // 0..1 lens transition progress (1 = settled)
uniform float uDpr;
// Cartoon lens face (device px), filled by faceLayout() in face.ts:
// [0] iris R.xy, iris L.xy · [1] head centre.xy, face width, eye width
// [2] chin.xy, presence, face height · [3] cheek R.xy, cheek L.xy
// [4] right eye middle.xy, axis.xy · [5] right eye half width, upper lid, lower lid, iris radius
// [6] left eye middle.xy, axis.xy · [7] left eye sizes, as [5] · [8] nose tip.xy, nose width, 0
// [9] up.xy (unit, chin to forehead), 0, 0. Presence 0 = no face.
uniform vec4 uFace[10];

out vec4 outColor;
`;

/**
 * Helpers and the ten other lenses. Reads uVideo, uVideoRect, uMirror, uCenter,
 * uBox, uTime, uDpr and uFace: uniforms in the compositor, per-thumbnail
 * globals in the preview.
 */
const LIB_HEAD = `
// ───────────────────────────── helpers
vec2 toUV(vec2 p) {
  vec2 uv = (p - uVideoRect.xy) / uVideoRect.zw;
  uv.x = mix(uv.x, 1.0 - uv.x, uMirror);
  return uv;
}

vec3 cam(vec2 p) {
  vec2 uv = toUV(p);
  float inb = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture(uVideo, uv).rgb * inb;
}

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

float frameSpan() { return max(1.0, max(uBox.z - uBox.x, uBox.w - uBox.y)); }

float sobel(vec2 p, float o) {
  float tl = luma(cam(p + vec2(-o, -o)));
  float tc = luma(cam(p + vec2(0.0, -o)));
  float tr = luma(cam(p + vec2(o, -o)));
  float ml = luma(cam(p + vec2(-o, 0.0)));
  float mr = luma(cam(p + vec2(o, 0.0)));
  float bl = luma(cam(p + vec2(-o, o)));
  float bc = luma(cam(p + vec2(0.0, o)));
  float br = luma(cam(p + vec2(o, o)));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  return length(vec2(gx, gy));
}

// ───────────────────────────── halftone (LED dot matrix)
vec3 lensHalftone(vec2 p) {
  float cell = 7.0 * uDpr;
  vec2 c = (floor(p / cell) + 0.5) * cell;
  vec3 col = cam(c);
  float r = cell * 0.5 * (0.16 + 0.9 * sqrt(luma(col)));
  float aa = 0.8 * uDpr;
  float m = 1.0 - smoothstep(r - aa, r + aa, length(p - c));
  vec3 ink = pow(col, vec3(0.85)) * 1.3 + 0.04;
  return mix(vec3(0.012), ink, m);
}

// ───────────────────────────── thermal
vec3 thermalRamp(float t) {
  t = clamp(t, 0.0, 1.0) * 6.0;
  vec3 c0 = vec3(0.02, 0.01, 0.10);
  vec3 c1 = vec3(0.22, 0.02, 0.48);
  vec3 c2 = vec3(0.70, 0.04, 0.52);
  vec3 c3 = vec3(0.96, 0.24, 0.10);
  vec3 c4 = vec3(1.00, 0.60, 0.02);
  vec3 c5 = vec3(1.00, 0.92, 0.35);
  vec3 c6 = vec3(1.00, 1.00, 0.95);
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  if (t < 4.0) return mix(c3, c4, t - 3.0);
  if (t < 5.0) return mix(c4, c5, t - 4.0);
  return mix(c5, c6, t - 5.0);
}

vec3 lensThermal(vec2 p) {
  float px = 3.0 * uDpr;
  vec2 c = (floor(p / px) + 0.5) * px;
  float o = 5.0 * uDpr;
  vec3 s = cam(c) * 0.36
    + (cam(c + vec2(o, 0.0)) + cam(c - vec2(o, 0.0)) + cam(c + vec2(0.0, o)) + cam(c - vec2(0.0, o))) * 0.16;
  float warm = clamp(s.r - max(s.g, s.b) + 0.04, 0.0, 0.45);
  float heat = pow(luma(s), 1.25) * 0.75 + warm * 1.35;
  heat = smoothstep(0.04, 0.82, heat);
  heat += (hash12(c + floor(uTime * 24.0)) - 0.5) * 0.025;
  return thermalRamp(heat);
}

// ───────────────────────────── night vision
vec3 lensNight(vec2 p) {
  float l = pow(clamp(luma(cam(p)) * 1.9, 0.0, 1.0), 0.8);
  l += (hash12(p * 0.73 + fract(uTime * 7.31) * 311.0) - 0.5) * 0.22;
  float scan = 0.86 + 0.14 * sin(p.y / uDpr * 3.14159);
  float vig = smoothstep(0.78, 0.18, length((p - uCenter) / frameSpan()));
  return vec3(0.32, 1.0, 0.42) * max(l, 0.0) * scan * (0.45 + 0.55 * vig) + vec3(0.0, 0.025, 0.005);
}

// ───────────────────────────── ascii (5×5 bitmap glyphs: " .:-=+*#%@")
const int GLYPHS[10] = int[10](0, 4194304, 131200, 14336, 459200, 4357252, 18289105, 11512810, 27070835, 15728622);

float glyphBit(int n, vec2 q) {
  ivec2 b = ivec2(floor(q));
  if (b.x < 0 || b.x > 4 || b.y < 0 || b.y > 4) return 0.0;
  return float((n >> (b.y * 5 + b.x)) & 1);
}

vec3 lensAscii(vec2 p) {
  float cell = 9.0 * uDpr;
  vec2 g = floor(p / cell);
  vec3 col = cam((g + 0.5) * cell);
  float l = luma(col);
  int idx = int(clamp(pow(l, 0.85) * 1.12, 0.0, 0.999) * 10.0);
  vec2 q = (p - g * cell) / cell * 7.0 - 1.0;
  float on = glyphBit(GLYPHS[idx], q);
  vec3 ink = mix(vec3(0.71, 1.0, 0.36) * (0.55 + 0.6 * l), col * 1.55 + 0.06, 0.35);
  return mix(vec3(0.008, 0.014, 0.008), ink, on);
}

// ───────────────────────────── 1-bit ordered dither
vec3 lensDither(vec2 p) {
  float px = 2.0 * uDpr;
  vec2 g = floor(p / px);
  float l = luma(cam((g + 0.5) * px));
  l = clamp((l - 0.5) * 1.35 + 0.52, 0.0, 1.0);
  return mix(vec3(0.05, 0.05, 0.06), vec3(0.95, 0.93, 0.87), step(bayer8(g), l));
}

// ───────────────────────────── x-ray
vec3 lensXray(vec2 p) {
  float v = pow(1.0 - luma(cam(p)), 1.8);
  float e = smoothstep(0.08, 0.6, sobel(p, 1.5 * uDpr));
  return vec3(0.50, 0.78, 1.0) * v * 0.9 + vec3(0.85, 0.95, 1.0) * e * 0.9 + vec3(0.01, 0.02, 0.04);
}

// ───────────────────────────── blueprint
float gridLine(vec2 p, float spacing, float width) {
  vec2 d = abs(fract(p / spacing + 0.5) - 0.5) * spacing;
  return 1.0 - smoothstep(0.0, width, min(d.x, d.y));
}

vec3 lensBlueprint(vec2 p) {
  float e = smoothstep(0.10, 0.42, sobel(p, 1.25 * uDpr));
  vec2 gp = p / uDpr;
  vec3 col = vec3(0.035, 0.14, 0.38);
  col += vec3(0.3, 0.5, 0.9) * (gridLine(gp, 14.0, 0.8) * 0.10 + gridLine(gp, 70.0, 1.0) * 0.22);
  return mix(col, vec3(0.88, 0.95, 1.0), e);
}

// ───────────────────────────── 8-bit (16-colour palette + ordered dither)
const vec3 PALETTE[16] = vec3[16](
  vec3(0.04, 0.04, 0.07), vec3(0.13, 0.17, 0.35), vec3(0.47, 0.16, 0.36), vec3(0.02, 0.49, 0.34),
  vec3(0.64, 0.33, 0.22), vec3(0.37, 0.35, 0.33), vec3(0.75, 0.76, 0.79), vec3(1.00, 0.96, 0.90),
  vec3(0.98, 0.07, 0.31), vec3(1.00, 0.62, 0.05), vec3(1.00, 0.90, 0.20), vec3(0.10, 0.86, 0.27),
  vec3(0.20, 0.66, 1.00), vec3(0.52, 0.47, 0.63), vec3(1.00, 0.49, 0.66), vec3(1.00, 0.79, 0.65)
);

vec3 lensPixel(vec2 p) {
  float px = 11.0 * uDpr;
  vec2 g = floor(p / px);
  vec3 col = clamp(cam((g + 0.5) * px) * 1.1 + (bayer4(g) - 0.5) * 0.16, 0.0, 1.0);
  vec3 best = PALETTE[0];
  float bd = 1e9;
  for (int i = 0; i < 16; i++) {
    vec3 d = col - PALETTE[i];
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = PALETTE[i]; }
  }
  vec2 f = fract(p / px);
  float seam = min(1.0, step(f.x, 0.07) + step(f.y, 0.07));
  return best * (1.0 - 0.2 * seam);
}

// ───────────────────────────── glitch
vec3 lensGlitch(vec2 p) {
  float t = floor(uTime * 15.0);
  float band = floor(p.y / (12.0 * uDpr));
  float shift = hash12(vec2(band, t)) > 0.74 ? (hash12(vec2(band + 7.3, t * 1.7)) - 0.5) * 90.0 * uDpr : 0.0;
  vec2 q = p + vec2(shift, 0.0);
  float ca = (3.0 + 9.0 * hash12(vec2(t, 4.2))) * uDpr;
  vec3 col = vec3(cam(q + vec2(ca, 0.0)).r, cam(q).g, cam(q - vec2(ca, 0.0)).b);
  float h = hash12(floor(p / (42.0 * uDpr)) + vec2(t * 0.13, t * 0.71));
  if (h > 0.955) col = 1.0 - col;
  else if (h > 0.93) col = col.gbr;
  return col * (0.88 + 0.12 * sin(p.y / uDpr * 1.7 + uTime * 30.0));
}

// ───────────────────────────── loupe (magnifier with lateral CA)
vec3 lensLoupe(vec2 p) {
  vec2 d = p - uCenter;
  vec2 q = uCenter + d / 2.2;
  float k = length(d) / (0.5 * frameSpan());
  vec2 dir = d / max(length(d), 1e-3);
  float ca = k * k * 5.0 * uDpr;
  vec3 col = vec3(cam(q + dir * ca).r, cam(q).g, cam(q - dir * ca).b);
  return col * (1.06 - 0.12 * k * k);
}
`;

/** The Cartoon lens: a 3D animated film look from pixels only. */
const CARTOON = `
// ───────────────────────────── cartoon (3D animated film look)
// A 3D animated film character made from the camera's own pixels. The face
// model only says where the eyes, nose, cheeks and chin are; everything below
// is plain pixel work, nothing is generated:
//   big round eyes, a big head, a small chin, a soft round nose
//       → local warps around those points
//   clean cartoon eyes: white eyeballs, big glossy irises in the visitor's own
//   eye colour, a dark lash line and two catchlights
//       → painted inside a bigger, rounder opening that still blinks with the real eye
//   smooth skin that light seems to glow through
//       → two edge-preserving blurs (the wider one on skin only) and a warm red
//         tint where the light fades
//   a face that looks modelled in 3D
//       → lit like a soft rounded shape: warm key light from the upper left,
//         rim light on the far side, a broad sheen
//   rosy cheeks and nose, rich colour, shadows that never go black, glow
//   shallow depth of field → all but the head and shoulders melts into soft colour
vec2 bulge(vec2 p, vec2 c, float R, float s) {
  vec2 d = p - c;
  float rr = max(R, 1e-3);
  float k = max(0.0, 1.0 - dot(d, d) / (rr * rr));
  return -d * s * k * k; // s > 0 magnifies, s < 0 shrinks
}

vec2 cartoonWarp(vec2 p) {
  float w = uFace[2].z;
  if (w < 0.001) return p;
  float faceW = uFace[1].z;
  float faceH = uFace[2].w;
  vec2 up = uFace[9].xy;
  vec2 brow = 0.5 * (uFace[4].xy + uFace[6].xy) + up * (0.12 * faceH);
  vec2 off = bulge(p, brow, faceW * 1.05, 0.16 * w);         // a bigger head
  off += bulge(p, uFace[4].xy, uFace[5].x * 3.1, 0.4 * w);   // big eyes
  off += bulge(p, uFace[6].xy, uFace[7].x * 3.1, 0.4 * w);
  off += bulge(p, uFace[8].xy, uFace[8].z * 0.9, 0.16 * w);  // a soft, round nose tip
  off += bulge(p, uFace[2].xy - up * (0.06 * faceH), faceW * 0.55, -0.26 * w); // a small chin
  return p + off;
}

// Edge-preserving blur: neighbours of a similar colour are averaged, edges stay.
vec3 bilateral(vec2 q, float r, float k, out vec3 bright) {
  vec3 c0 = cam(q);
  vec3 sum = c0;
  float wsum = 1.0;
  bright = max(c0 - 0.72, 0.0);
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.3926991 + 0.2;
    vec2 o = vec2(cos(a), sin(a)) * r * ((i & 1) == 0 ? 1.0 : 0.55);
    vec3 c = cam(q + o);
    vec3 dc = c - c0;
    float wt = exp(-dot(dc, dc) * k);
    sum += c * wt;
    wsum += wt;
    bright += max(c - 0.72, 0.0);
  }
  bright /= 17.0;
  return sum / wsum;
}

// A second, wider pass for skin: pores, freckles and creases go, features stay.
vec3 skinBlur(vec2 q, float r, vec3 c0) {
  vec3 sum = c0;
  float wsum = 1.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    vec3 c = cam(q + vec2(cos(a), sin(a)) * r);
    vec3 dc = c - c0;
    float wt = exp(-dot(dc, dc) * 22.0);
    sum += c * wt;
    wsum += wt;
  }
  return sum / wsum;
}

vec3 discBlur(vec2 q, float r) {
  vec3 sum = cam(q);
  for (int i = 0; i < 20; i++) {
    float a = float(i) * 2.39996; // golden angle spiral
    float rr = r * sqrt((float(i) + 0.5) / 20.0);
    sum += cam(q + vec2(cos(a), sin(a)) * rr);
  }
  return sum / 21.0;
}

float skinTone(vec3 c) {
  float cb = -0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b;
  float cr = 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b;
  // Light and dark skin both sit in this small patch of blue-difference / red-difference.
  return (1.0 - smoothstep(0.025, 0.06, abs(cb + 0.07))) * (1.0 - smoothstep(0.035, 0.085, abs(cr - 0.1))) * smoothstep(0.04, 0.12, luma(c));
}

float softDot(vec2 p, vec2 c, float r) {
  float rr = max(r, 1e-3);
  return 1.0 - smoothstep(rr * 0.55, rr, length(p - c));
}

// One cartoon eye, drawn in camera space (q) so it follows the warp.
// m: middle of the corners · ax: unit vector along the eye
// g: half width, upper lid, lower lid, iris radius · ic: iris centre.
// Returns the eye's colour and how much of this pixel it covers; lash gets
// the strength of the dark lid lines (they also fall on the skin around it).
vec4 cartoonEye(vec2 q, vec2 m, vec2 ax, vec4 g, vec2 ic, out float lash) {
  lash = 0.0;
  float a = max(g.x, 1.0);
  vec2 d = q - m;
  if (dot(d, d) > 4.0 * a * a) return vec4(0.0);
  vec2 upv = vec2(ax.y, -ax.x);
  if (upv.y > 0.0) upv = -upv; // screen y grows downwards
  float lx = dot(d, ax);
  float ly = dot(d, upv);
  float t = min(abs(lx) / a, 1.0);
  float edge = max(1.0 - t * t, 0.0);
  float fe = 0.04 * a + 0.6 * uDpr;

  // A rounder, taller opening than the real one; it still closes in a blink.
  float upper = g.y * 1.7 * pow(edge, 0.55);
  float lower = g.z * 1.5 * pow(edge, 0.75);
  float open = smoothstep(-fe, fe, upper - ly) * smoothstep(-fe, fe, ly + lower) * (1.0 - smoothstep(a - fe, a + fe, abs(lx)));

  // Eyeball: warm white, shaded under the upper lid and into the corners.
  float lidShade = 1.0 - smoothstep(upper - 0.6 * max(upper, 1.0), upper, ly);
  vec3 ball = vec3(0.96, 0.94, 0.92) * mix(0.6, 1.0, lidShade) * mix(0.82, 1.0, 1.0 - smoothstep(0.55, 1.0, t));

  // Iris: bigger than the real one, in the visitor's own eye colour made rich.
  float ir = max(g.w, 0.5) * 1.3;
  vec2 di = q - ic;
  float r = length(di) / ir;
  float rs = g.w * 0.55;
  vec3 raw = 0.25 * (cam(ic + vec2(rs, 0.3 * rs)) + cam(ic + vec2(-rs, 0.3 * rs))
    + cam(ic + vec2(0.35 * rs, rs)) + cam(ic + vec2(-0.35 * rs, rs)));
  float rl = luma(raw);
  vec3 chroma = raw - vec3(rl);
  vec3 tint = clamp((vec3(rl) + chroma * 2.0) * (0.36 / max(rl, 0.03)), 0.0, 1.0);
  vec3 iris = mix(vec3(0.45, 0.27, 0.13), tint, smoothstep(0.015, 0.05, length(chroma)));
  float below = clamp(dot(di, -upv) / ir, -1.0, 1.0);
  iris *= 0.55 + 0.75 * smoothstep(-0.6, 0.9, below); // light pools in the lower half
  float fibre = r > 0.4 ? sin(atan(di.y, di.x) * 23.0) : 0.0; // (atan needs a non-zero vector)
  iris *= 1.0 + 0.12 * fibre * smoothstep(0.45, 0.9, r); // fibres
  iris *= mix(1.0, 0.3, smoothstep(0.74, 1.0, r)); // dark rim
  iris = mix(iris, vec3(0.025, 0.02, 0.02), 1.0 - smoothstep(0.4, 0.47, r)); // pupil
  float inIris = 1.0 - smoothstep(1.0 - fe / ir, 1.0, r);
  ball = mix(ball, iris * mix(0.6, 1.0, lidShade), inIris);
  // Lit like the face around it (the cheek below), so the eyes never glow in a dim room.
  ball *= clamp(0.45 + 0.9 * luma(cam(m - upv * (g.z + a))), 0.65, 1.0);

  // Catchlights: the window reflection animated eyes always have.
  vec2 key = vec2(-0.6, -0.8); // towards the light: up and to the left on screen
  float shine = 1.0 - smoothstep(0.16, 0.25, length(di / ir - key * 0.42));
  shine = max(shine, 0.8 * (1.0 - smoothstep(0.05, 0.09, length(di / ir + key * 0.4))));
  ball = mix(ball, vec3(1.0), shine * inIris);

  // Lash line: a dark upper lid edge, thickest in the middle, thin at the corners.
  float th = a * 0.16 * (0.3 + 0.7 * pow(edge, 0.35));
  float du = ly - upper;
  lash = smoothstep(-0.4 * th - fe, -0.4 * th, du) * (1.0 - smoothstep(th, th + fe, du)) * (1.0 - smoothstep(a * 0.86, a * 1.06, abs(lx)));
  // And a soft lower lid line.
  float dl = -ly - lower;
  float tl = a * 0.05;
  lash = max(lash, 0.3 * smoothstep(-tl - fe, -tl, dl) * (1.0 - smoothstep(tl, tl + fe, dl)) * (1.0 - smoothstep(a * 0.55, a, abs(lx))));
  return vec4(ball, open);
}

vec3 lensCartoon(vec2 p) {
  float w = uFace[2].z;
  bool hasFace = w > 0.001;
  float faceW = max(uFace[1].z, 1.0);
  float faceH = max(uFace[2].w, 1.0);
  vec2 fu = uFace[9].xy;       // up the face, chin to forehead
  vec2 fr = vec2(-fu.y, fu.x); // across the face, to the right on screen
  vec2 q = cartoonWarp(p);

  // Every surface smoothed like a modelled, painted one; skin smoothest of all.
  float r = hasFace ? clamp(faceW * 0.035, 3.0 * uDpr, 12.0 * uDpr) : 5.0 * uDpr;
  vec3 bright;
  vec3 col = bilateral(q, r, 40.0, bright);
  float skin = skinTone(col);
  if (skin > 0.02) col = mix(col, skinBlur(q, r * 2.2, col), skin * 0.75);

  if (hasFace) {
    // The face, lit like a soft rounded shape (an ellipsoid) from the upper left.
    vec2 hd = q - uFace[1].xy;
    vec2 e2 = vec2(dot(hd, fr) / (0.55 * faceW), dot(hd, fu) / (0.58 * faceH));
    float rr = dot(e2, e2);
    float z = sqrt(max(1.0 - rr, 0.0));
    vec3 n = normalize(vec3(e2, z + 0.2));
    vec3 L = normalize(vec3(-0.55, 0.6, 0.65));
    float wrap = clamp((dot(n, L) + 0.5) / 1.5, 0.0, 1.0);
    float on = (1.0 - smoothstep(0.8, 1.08, sqrt(rr))) * skin * w;
    vec3 lit = col * (0.74 + 0.4 * wrap);
    // Where the light fades, it glows red through the skin.
    lit += vec3(0.09, 0.02, 0.0) * smoothstep(0.2, 0.45, wrap) * (1.0 - smoothstep(0.45, 0.75, wrap));
    // Rim light on the far side, and a broad soft sheen.
    lit += vec3(1.0, 0.9, 0.82) * 0.16 * pow(1.0 - min(z, 1.0), 2.0) * smoothstep(-0.1, 0.6, e2.x);
    lit += vec3(1.0, 0.96, 0.9) * 0.09 * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 16.0);
    col = mix(col, lit, on);

    // Rosy cheeks and nose tip, and a soft highlight on the nose.
    float blush = min(softDot(q, uFace[3].xy, faceW * 0.16) + softDot(q, uFace[3].zw, faceW * 0.16), 1.0);
    col = mix(col, col * vec3(1.06, 0.8, 0.8) + vec3(0.07, 0.01, 0.02), blush * skin * 0.42 * w);
    float nose = softDot(q, uFace[8].xy, uFace[8].z * 0.55);
    col = mix(col, col * vec3(1.05, 0.85, 0.83) + vec3(0.05, 0.0, 0.0), nose * skin * 0.3 * w);
    col += vec3(1.0, 0.95, 0.9) * (0.14 * w) * softDot(q, uFace[8].xy + (fu * 0.22 - fr * 0.18) * uFace[8].z, uFace[8].z * 0.22);

    // Depth of field: the head and shoulders stay sharp, the rest melts into soft colour.
    vec2 hp = p - uFace[1].xy;
    float eh = length(vec2(dot(hp, fr) / (0.78 * faceW), dot(hp, fu) / (0.8 * faceH)));
    vec2 tp = p - (uFace[2].xy - fu * (0.9 * faceH));
    float et = length(vec2(dot(tp, fr) / (1.55 * faceW), dot(tp, fu) / (0.95 * faceH)));
    float dof = smoothstep(0.95, 1.5, min(eh, et)) * w;
    if (dof > 0.01) {
      vec3 bg = discBlur(q, clamp(faceW * 0.09, 8.0 * uDpr, 26.0 * uDpr));
      float bl = luma(bg);
      bg = max(mix(vec3(bl), bg, 1.3), 0.0) * 0.84 + vec3(0.11, 0.085, 0.08);
      col = mix(col, bg, dof);
    }
  }

  // Rich colour, cool shadows and warm highlights, never a crushed black.
  float g = luma(col);
  col = max(mix(vec3(g), col, 1.25), 0.0);
  col *= mix(vec3(0.95, 0.97, 1.05), vec3(1.04, 1.0, 0.94), smoothstep(0.2, 0.85, g));
  col = col * 0.88 + vec3(0.045, 0.05, 0.065);

  if (hasFace) {
    float lashR;
    float lashL;
    vec4 eyeR = cartoonEye(q, uFace[4].xy, uFace[4].zw, uFace[5], uFace[0].xy, lashR);
    vec4 eyeL = cartoonEye(q, uFace[6].xy, uFace[6].zw, uFace[7], uFace[0].zw, lashL);
    col = mix(col, eyeR.rgb, eyeR.a * w);
    col = mix(col, eyeL.rgb, eyeL.a * w);
    col = mix(col, vec3(0.07, 0.045, 0.04), max(lashR, lashL) * w);
  }

  // Soft glow around bright areas.
  col += bright * vec3(1.0, 0.86, 0.72) * 0.7;
  return col;
}
`;

/**
 * The previous Cartoon lens, kept as a fallback: if the new one fails to
 * compile on some graphics driver, the renderer and the thumbnails build their
 * program with this one instead, so the game keeps working. It reads only
 * uFace[0] to uFace[3], which mean the same in both.
 */
const CARTOON_FALLBACK = `
// ───────────────────────────── cartoon (3D animated film look)
// What makes the look, and how each part is faked in one pass:
//   big eyes, big head, small chin → three local warps around face points
//   smooth "subsurface" skin       → edge-preserving (bilateral) blur + warm glow in skin tones
//   simple, rounded forms           → soft tone bands blended into the shading
//   soft warm key light, cool fill  → warm highlights, lifted blue-ish shadows, glow
//   shallow depth of field          → the background blurs away from the face
//   bright, rich colour + eye shine → saturation boost, cheek blush, catchlights
vec2 bulge(vec2 p, vec2 c, float R, float s) {
  vec2 d = p - c;
  float k = max(0.0, 1.0 - dot(d, d) / (R * R));
  return -d * s * k * k; // s > 0 magnifies, s < 0 shrinks
}

vec2 cartoonWarp(vec2 p) {
  float w = uFace[2].z;
  if (w < 0.001) return p;
  float faceW = uFace[1].z;
  float eyeW = uFace[1].w;
  vec2 chin = uFace[2].xy + (uFace[2].xy - uFace[1].xy) * 0.12;
  vec2 off = bulge(p, uFace[1].xy, faceW * 0.95, 0.12 * w);
  off += bulge(p, uFace[0].xy, eyeW * 1.6, 0.5 * w);
  off += bulge(p, uFace[0].zw, eyeW * 1.6, 0.5 * w);
  off += bulge(p, chin, faceW * 0.55, -0.28 * w);
  return p + off;
}

vec3 bilateral(vec2 q, float r, out vec3 bright) {
  vec3 c0 = cam(q);
  vec3 sum = c0;
  float wsum = 1.0;
  bright = max(c0 - 0.72, 0.0);
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988 + 0.26;
    vec2 o = vec2(cos(a), sin(a)) * r * ((i & 1) == 0 ? 1.0 : 0.5);
    vec3 c = cam(q + o);
    vec3 dc = c - c0;
    float w = exp(-dot(dc, dc) * 45.0);
    sum += c * w;
    wsum += w;
    bright += max(c - 0.72, 0.0);
  }
  bright /= 13.0;
  return sum / wsum;
}

vec3 discBlur(vec2 q, float r) {
  vec3 sum = cam(q);
  for (int i = 0; i < 14; i++) {
    float a = float(i) * 2.39996; // golden angle spiral
    float rr = r * sqrt((float(i) + 0.5) / 14.0);
    sum += cam(q + vec2(cos(a), sin(a)) * rr);
  }
  return sum / 15.0;
}

float skinTone(vec3 c) {
  float cb = -0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b;
  float cr = 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b;
  return smoothstep(0.03, 0.0, abs(cb + 0.07)) * smoothstep(0.075, 0.02, abs(cr - 0.1));
}

float softDot(vec2 p, vec2 c, float r) {
  return 1.0 - smoothstep(r * 0.55, r, length(p - c));
}

vec3 lensCartoon(vec2 p) {
  float face = uFace[2].z;
  float faceW = uFace[1].z;
  float eyeW = uFace[1].w;
  vec2 q = cartoonWarp(p);

  // Skin and surfaces: smooth away pores and noise, keep edges.
  float r = face > 0.001 ? clamp(faceW * 0.04, 3.0 * uDpr, 14.0 * uDpr) : 5.0 * uDpr;
  vec3 bright;
  vec3 col = bilateral(q, r, bright);

  // Depth of field: the further from the face, the softer.
  if (face > 0.001) {
    vec2 d = (p - uFace[1].xy) / faceW;
    float dof = smoothstep(0.8, 1.7, length(d * vec2(1.0, 0.7))) * face;
    if (dof > 0.01) col = mix(col, discBlur(q, 16.0 * uDpr), dof);
  }

  // Simple rounded forms: soft tone bands blended into the shading.
  float l = luma(col);
  float b = l * 5.0;
  float lb = (floor(b) + smoothstep(0.3, 0.7, fract(b))) / 5.0;
  col *= mix(1.0, lb / max(l, 0.02), 0.3);

  // Rich colour, warm key light, cool lifted shadows.
  float g = luma(col);
  col = max(mix(vec3(g), col, 1.22), 0.0);
  col *= mix(vec3(0.94, 0.98, 1.06), vec3(1.05, 1.0, 0.93), smoothstep(0.15, 0.8, g));
  col = col * 0.86 + vec3(0.05, 0.06, 0.08);

  // Subsurface glow: light seems to pass through skin, so skin tones redden softly.
  float skin = skinTone(cam(q));
  col += vec3(0.07, 0.03, 0.01) * skin * (1.0 - g);

  if (face > 0.001) {
    // Cheek blush.
    float blush = softDot(p, uFace[3].xy, faceW * 0.13) + softDot(p, uFace[3].zw, faceW * 0.13);
    col = mix(col, col * vec3(1.1, 0.86, 0.86) + vec3(0.06, 0.0, 0.01), min(blush, 1.0) * 0.28 * face);

    // Catchlights: the bright window reflection animated eyes always have.
    vec2 ex = normalize(uFace[0].zw - uFace[0].xy + vec2(1e-4, 0.0));
    vec2 up = vec2(ex.y, -ex.x);
    if (up.y > 0.0) up = -up;
    vec2 side = ex.x > 0.0 ? -ex : ex;
    float shine = 0.0;
    for (int e = 0; e < 2; e++) {
      vec2 c = e == 0 ? uFace[0].xy : uFace[0].zw;
      shine += softDot(p, c + (up * 0.17 + side * 0.13) * eyeW, eyeW * 0.085);
    }
    col = mix(col, vec3(1.0, 0.99, 0.96), min(shine, 1.0) * 0.92 * face);
  }

  // Soft glow around bright areas.
  col += bright * vec3(1.0, 0.85, 0.7) * 0.9;
  return col;
}
`;

const LIB_TAIL = `
vec3 lens(int id, vec2 p) {
  switch (id) {
    case 0: return lensPixel(p);
    case 1: return lensThermal(p);
    case 2: return lensCartoon(p);
    case 3: return lensHalftone(p);
    case 4: return lensAscii(p);
    case 5: return lensNight(p);
    case 6: return lensXray(p);
    case 7: return lensBlueprint(p);
    case 8: return lensDither(p);
    case 9: return lensGlitch(p);
    case 10: return lensLoupe(p);
  }
  return cam(p);
}
`;

/** Helpers, every lens and the lens switch, with the given Cartoon lens. */
const lensLibrary = (cartoon: string) => LIB_HEAD + cartoon + LIB_TAIL;

const MAIN_COMPOSE = `
// ───────────────────────────── compose
float frameSD(vec2 p) {
  float d = dot(uEdges[0].xy, p) + uEdges[0].z;
  d = min(d, dot(uEdges[1].xy, p) + uEdges[1].z);
  d = min(d, dot(uEdges[2].xy, p) + uEdges[2].z);
  d = min(d, dot(uEdges[3].xy, p) + uEdges[3].z);
  return d;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float sd = frameSD(p);
  float aa = uDpr;
  float coverage = smoothstep(-aa, aa, sd);
  float inside = coverage * uActive;
  float outside = (1.0 - coverage) * uActive;

  // World: subtle grade + vignette + grain; recedes while a frame is held.
  vec3 world = cam(p);
  world = mix(world, vec3(luma(world)), 0.6 * outside);
  world *= 1.0 - 0.42 * outside;
  vec2 uv = p / uRes;
  float vig = smoothstep(1.15, 0.25, length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)));
  world *= mix(0.72, 1.0, vig);
  world += (hash12(p + fract(uTime) * 917.0) - 0.5) * 0.02;

  vec3 col = world;
  if (inside > 0.0005) {
    vec3 current = lens(uLens, p);
    if (uMix < 1.0) {
      // Left→right scan wipe from the previous lens to the new one.
      vec3 prev = lens(uPrevLens, p);
      float span = max(1.0, uBox.z - uBox.x);
      float x = (p.x - uBox.x) / span;
      float edge = uMix * 1.2 - 0.1;
      current = mix(prev, current, smoothstep(edge + 0.03, edge - 0.03, x));
      current += exp(-abs(x - edge) * span / (5.0 * uDpr)) * (1.0 - uMix) * 0.9;
    }
    col = mix(world, current, inside);
  }

  // Soft rim light just outside the frame edge.
  col += exp(-max(-sd, 0.0) / (14.0 * uDpr)) * outside * 0.1;
  outColor = vec4(col, 1.0);
}
`;

export const FRAGMENT_SHADER = MAIN_HEADER + lensLibrary(CARTOON) + MAIN_COMPOSE;

/** The compositor with the previous Cartoon lens, for drivers that reject the new one. */
export const FRAGMENT_SHADER_FALLBACK = MAIN_HEADER + lensLibrary(CARTOON_FALLBACK) + MAIN_COMPOSE;

/** Most thumbnails the preview program lays out (one per lens). */
export const PREVIEW_MAX_CELLS = 12;

const PREVIEW_HEADER = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uVideo;
uniform float uMirror;
uniform float uTime;
uniform float uDpr;
uniform vec2 uRes;              // canvas size (device px)
uniform vec4 uCells[${PREVIEW_MAX_CELLS}];         // thumbnail rects (device px, y down): x, y, w, h
uniform int uCount;
uniform float uRadius;          // thumbnail corner radius (device px)
uniform vec4 uLocalRect;        // the camera picture fitted into one thumbnail (thumbnail px)
// The Cartoon lens face, laid out like uFace in the compositor, with points as
// fractions of the main view's video rect and lengths as fractions of its width.
uniform vec4 uFaceN[10];

out vec4 outColor;

// The library's view uniforms, per thumbnail.
vec4 gRect;
vec2 gCenter;
vec4 gBox;
vec4 gFace[10];
#define uVideoRect gRect
#define uCenter gCenter
#define uBox gBox
#define uFace gFace
`;

const PREVIEW_MAIN = `
vec2 toCell(vec2 n) { return gRect.xy + n * gRect.zw; }

float roundRectSD(vec2 p, vec2 size, float r) {
  vec2 q = abs(p - size * 0.5) - (size * 0.5 - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  int id = -1;
  vec4 cell = vec4(0.0);
  for (int i = 0; i < ${PREVIEW_MAX_CELLS}; i++) {
    if (i >= uCount) break;
    vec4 c = uCells[i];
    if (p.x >= c.x && p.y >= c.y && p.x < c.x + c.z && p.y < c.y + c.w) {
      id = i;
      cell = c;
      break;
    }
  }
  if (id < 0) {
    outColor = vec4(0.0);
    return;
  }

  vec2 local = p - cell.xy;
  float alpha = clamp(0.5 - roundRectSD(local, cell.zw, uRadius), 0.0, 1.0);
  if (alpha <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  gRect = uLocalRect;
  gCenter = cell.zw * 0.5;
  gBox = vec4(0.0, 0.0, cell.zw);
  gFace[0] = vec4(toCell(uFaceN[0].xy), toCell(uFaceN[0].zw));
  gFace[1] = vec4(toCell(uFaceN[1].xy), uFaceN[1].zw * gRect.z);
  gFace[2] = vec4(toCell(uFaceN[2].xy), uFaceN[2].z, uFaceN[2].w * gRect.z);
  gFace[3] = vec4(toCell(uFaceN[3].xy), toCell(uFaceN[3].zw));
  gFace[4] = vec4(toCell(uFaceN[4].xy), uFaceN[4].zw);
  gFace[5] = uFaceN[5] * gRect.z;
  gFace[6] = vec4(toCell(uFaceN[6].xy), uFaceN[6].zw);
  gFace[7] = uFaceN[7] * gRect.z;
  gFace[8] = vec4(toCell(uFaceN[8].xy), uFaceN[8].z * gRect.z, 0.0);
  gFace[9] = uFaceN[9];

  vec3 col = clamp(lens(id, local), 0.0, 1.0);
  outColor = vec4(col * alpha, alpha);
}
`;

export const PREVIEW_FRAGMENT_SHADER = PREVIEW_HEADER + lensLibrary(CARTOON) + PREVIEW_MAIN;

/** The thumbnails with the previous Cartoon lens, for drivers that reject the new one. */
export const PREVIEW_FRAGMENT_SHADER_FALLBACK = PREVIEW_HEADER + lensLibrary(CARTOON_FALLBACK) + PREVIEW_MAIN;
