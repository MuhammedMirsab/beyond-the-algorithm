import { FRAGMENT_SHADER, FRAGMENT_SHADER_FALLBACK, VERTEX_SHADER } from "./shaders";

export interface DrawParams {
  /** Fitted video rect in CSS px. */
  videoRect: { x: number; y: number; w: number; h: number };
  mirror: boolean;
  /** Inward edge lines in device px (4 × vec3). */
  edges: Float32Array;
  /** Frame centroid & bounds in CSS px. */
  center: { x: number; y: number };
  box: { minX: number; minY: number; maxX: number; maxY: number };
  active: number;
  time: number;
  lens: number;
  prevLens: number;
  mix: number;
  /** Cartoon lens face in device px (10 × vec4, laid out by faceLayout in face.ts); all zero = no face. */
  face: Float32Array;
}

const UNIFORMS = [
  "uVideo",
  "uRes",
  "uVideoRect",
  "uMirror",
  "uEdges",
  "uCenter",
  "uBox",
  "uActive",
  "uTime",
  "uLens",
  "uPrevLens",
  "uMix",
  "uDpr",
  "uFace",
] as const;

type UniformName = (typeof UNIFORMS)[number];

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

/** Compiles and links one program; throws with the driver's log if it is rejected. */
function link(gl: WebGL2RenderingContext, fragment: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  let fs: WebGLShader;
  try {
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  } catch (err) {
    gl.deleteShader(vs);
    throw err;
  }
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error("Could not create program");
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}

/**
 * Raw WebGL2 (no three.js): one program, one texture, one full-screen
 * triangle. Keeps the per-frame cost to a texture upload + a single draw.
 */
export class Renderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private texture: WebGLTexture | null = null;
  private texW = 0;
  private texH = 0;
  private hasFrame = false;
  private lost = false;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  dpr = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.init();
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };

  private onRestored = () => {
    this.lost = false;
    this.texW = this.texH = 0;
    this.hasFrame = false;
    this.init();
  };

  private init() {
    const gl = this.gl;
    let program: WebGLProgram;
    try {
      program = link(gl, FRAGMENT_SHADER);
    } catch (err) {
      // A driver that rejects the Cartoon lens still gets every filter,
      // with the previous Cartoon look, instead of a broken game.
      console.error("[viewfinder] lens shader rejected; using the previous Cartoon lens", err);
      program = link(gl, FRAGMENT_SHADER_FALLBACK);
    }
    this.program = program;
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(program, name);

    this.vao = gl.createVertexArray();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Upload the frame currently shown by the video (same frame the tracker just read). */
  upload(video: HTMLVideoElement) {
    if (this.lost || !this.texture) return;
    const gl = this.gl;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (w !== this.texW || h !== this.texH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      this.texW = w;
      this.texH = h;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }
    this.hasFrame = true;
  }

  draw(p: DrawParams) {
    if (this.lost || !this.program || !this.hasFrame) return;
    const gl = this.gl;
    const u = this.uniforms;
    const d = this.dpr;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(u.uVideo, 0);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform4f(u.uVideoRect, p.videoRect.x * d, p.videoRect.y * d, p.videoRect.w * d, p.videoRect.h * d);
    gl.uniform1f(u.uMirror, p.mirror ? 1 : 0);
    gl.uniform3fv(u.uEdges, p.edges);
    gl.uniform2f(u.uCenter, p.center.x * d, p.center.y * d);
    gl.uniform4f(u.uBox, p.box.minX * d, p.box.minY * d, p.box.maxX * d, p.box.maxY * d);
    gl.uniform1f(u.uActive, p.active);
    gl.uniform1f(u.uTime, p.time);
    gl.uniform1i(u.uLens, p.lens);
    gl.uniform1i(u.uPrevLens, p.prevLens);
    gl.uniform1f(u.uMix, p.mix);
    gl.uniform1f(u.uDpr, d);
    gl.uniform4fv(u.uFace, p.face);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Frees the GPU objects and then the context itself. Browsers cap live
   * WebGL contexts per page (often 16), and the arcade runs one camera game
   * after another, so waiting for garbage collection is not enough.
   * A lost context can't be reused: the next session needs a new canvas.
   */
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    const gl = this.gl;
    if (!this.lost) {
      if (this.texture) gl.deleteTexture(this.texture);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.program) gl.deleteProgram(this.program);
    }
    this.texture = null;
    this.vao = null;
    this.program = null;
    this.hasFrame = false;
    this.lost = true;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
