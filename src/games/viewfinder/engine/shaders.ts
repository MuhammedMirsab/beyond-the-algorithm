/**
 * Single-pass compositor. One full-screen triangle; for every pixel:
 *   1. sample the camera (cover/contain fit, optional mirror)
 *   2. signed distance to the hand frame (4 inward edge lines → AA mask)
 *   3. inside  → the selected lens (screen-space, so patterns never swim with
 *                hand jitter — the frame is a window onto a filtered layer)
 *      outside → the "world": desaturated + dimmed while a frame is up
 * Lens order must match LENSES in ./lenses.ts.
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

export const FRAGMENT_SHADER = `#version 300 es
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
// Cartoon lens face (device px): [0] eyeR.xy eyeL.xy · [1] center.xy faceW eyeW
// [2] chin.xy presence 0 · [3] cheekR.xy cheekL.xy. presence 0 = no face.
uniform vec4 uFace[4];

out vec4 outColor;

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

float frameSD(vec2 p) {
  float d = dot(uEdges[0].xy, p) + uEdges[0].z;
  d = min(d, dot(uEdges[1].xy, p) + uEdges[1].z);
  d = min(d, dot(uEdges[2].xy, p) + uEdges[2].z);
  d = min(d, dot(uEdges[3].xy, p) + uEdges[3].z);
  return d;
}

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

// ───────────────────────────── 0 · halftone (LED dot matrix)
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

// ───────────────────────────── 1 · thermal
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

// ───────────────────────────── 2 · night vision
vec3 lensNight(vec2 p) {
  float l = pow(clamp(luma(cam(p)) * 1.9, 0.0, 1.0), 0.8);
  l += (hash12(p * 0.73 + fract(uTime * 7.31) * 311.0) - 0.5) * 0.22;
  float scan = 0.86 + 0.14 * sin(p.y / uDpr * 3.14159);
  float vig = smoothstep(0.78, 0.18, length((p - uCenter) / frameSpan()));
  return vec3(0.32, 1.0, 0.42) * max(l, 0.0) * scan * (0.45 + 0.55 * vig) + vec3(0.0, 0.025, 0.005);
}

// ───────────────────────────── 3 · ascii (5×5 bitmap glyphs: " .:-=+*#%@")
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

// ───────────────────────────── 4 · 1-bit ordered dither
vec3 lensDither(vec2 p) {
  float px = 2.0 * uDpr;
  vec2 g = floor(p / px);
  float l = luma(cam((g + 0.5) * px));
  l = clamp((l - 0.5) * 1.35 + 0.52, 0.0, 1.0);
  return mix(vec3(0.05, 0.05, 0.06), vec3(0.95, 0.93, 0.87), step(bayer8(g), l));
}

// ───────────────────────────── 5 · x-ray
vec3 lensXray(vec2 p) {
  float v = pow(1.0 - luma(cam(p)), 1.8);
  float e = smoothstep(0.08, 0.6, sobel(p, 1.5 * uDpr));
  return vec3(0.50, 0.78, 1.0) * v * 0.9 + vec3(0.85, 0.95, 1.0) * e * 0.9 + vec3(0.01, 0.02, 0.04);
}

// ───────────────────────────── 6 · blueprint
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

// ───────────────────────────── 7 · 8-bit (16-colour palette + ordered dither)
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

// ───────────────────────────── 8 · glitch
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

// ───────────────────────────── 9 · loupe (magnifier with lateral CA)
vec3 lensLoupe(vec2 p) {
  vec2 d = p - uCenter;
  vec2 q = uCenter + d / 2.2;
  float k = length(d) / (0.5 * frameSpan());
  vec2 dir = d / max(length(d), 1e-3);
  float ca = k * k * 5.0 * uDpr;
  vec3 col = vec3(cam(q + dir * ca).r, cam(q).g, cam(q - dir * ca).b);
  return col * (1.06 - 0.12 * k * k);
}


// ───────────────────────────── 10 · cartoon (3D animated film look)
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

vec3 lens(int id, vec2 p) {
  switch (id) {
    case 0: return lensHalftone(p);
    case 1: return lensThermal(p);
    case 2: return lensNight(p);
    case 3: return lensAscii(p);
    case 4: return lensDither(p);
    case 5: return lensXray(p);
    case 6: return lensBlueprint(p);
    case 7: return lensPixel(p);
    case 8: return lensGlitch(p);
    case 9: return lensLoupe(p);
    case 10: return lensCartoon(p);
  }
  return cam(p);
}

// ───────────────────────────── compose
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
