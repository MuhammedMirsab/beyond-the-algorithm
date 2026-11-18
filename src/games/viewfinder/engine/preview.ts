import { PREVIEW_FRAGMENT_SHADER, PREVIEW_FRAGMENT_SHADER_FALLBACK, PREVIEW_MAX_CELLS, VERTEX_SHADER } from "./shaders";

/** A thumbnail's place on the preview canvas, in CSS px from the canvas's top left. */
export interface PreviewCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewLayout {
  /** One cell per lens, in lens order. */
  cells: readonly PreviewCell[];
  /** Canvas size in CSS px. */
  width: number;
  height: number;
  /** Thumbnail corner radius in CSS px. */
  radius: number;
}

export interface PreviewFrame {
  video: HTMLVideoElement;
  mirror: boolean;
  /** Shader time in seconds (0 under reduced motion, like the main view). */
  time: number;
  /** Cartoon face as fractions of the main view's video rect (40 floats, see faceLayout in face.ts; all zero = no face). */
  face: Float32Array;
}

/** A thumbnail shows the middle of the camera picture, a little closer than the main view. */
export const PREVIEW_ZOOM = 1.2;
const DPR_CAP = 2;

/**
 * Where the camera picture sits inside one thumbnail (thumbnail px): cover-fit
 * and zoomed about the centre, so the visitor's face fills it.
 */
export function thumbnailVideoRect(videoW: number, videoH: number, cellW: number, cellH: number, zoom = PREVIEW_ZOOM) {
  const s = Math.max(cellW / Math.max(1, videoW), cellH / Math.max(1, videoH)) * zoom;
  const w = videoW * s;
  const h = videoH * s;
  return { x: (cellW - w) / 2, y: (cellH - h) / 2, w, h };
}

const UNIFORMS = [
  "uVideo",
  "uMirror",
  "uTime",
  "uDpr",
  "uRes",
  "uCells",
  "uCount",
  "uRadius",
  "uLocalRect",
  "uFaceN",
] as const;

type UniformName = (typeof UNIFORMS)[number];

interface ParallelCompile {
  readonly COMPLETION_STATUS_KHR: number;
}

/**
 * The filter picker's live thumbnails: every lens at once, on the visitor's
 * own camera picture, in one small WebGL2 canvas behind the picker buttons.
 *
 * It runs the same lens code as the main view (shaders.ts), so a thumbnail is
 * the real look, not a sample image. The program compiles in the background
 * where the browser allows it (KHR_parallel_shader_compile), so opening the
 * camera never waits for it; until it is ready, the thumbnails stay empty.
 * The engine calls draw() a few times a second, after its own frame.
 */
export class LensPreview {
  private readonly gl: WebGL2RenderingContext;
  private readonly parallel: ParallelCompile | null;
  private program: WebGLProgram | null = null;
  private linked = false;
  private failed = false;
  /** True once the driver rejected the new Cartoon lens: build with the previous one. */
  private fallback = false;
  private vao: WebGLVertexArrayObject | null = null;
  private texture: WebGLTexture | null = null;
  private texW = 0;
  private texH = 0;
  private lost = false;
  private disposed = false;
  private uniforms = {} as Record<UniformName, WebGLUniformLocation | null>;
  private layout: PreviewLayout | null = null;
  private dpr = 1;
  private readonly cells = new Float32Array(PREVIEW_MAX_CELLS * 4);

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      // Same GPU as the main view on dual-GPU laptops.
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 unavailable");
    this.gl = gl;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile") as ParallelCompile | null;
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
    this.init();
  };

  private init() {
    if (!this.buildProgram()) return;
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /** Starts compiling the lens program (in the background where the browser allows it). */
  private buildProgram() {
    const gl = this.gl;
    this.linked = false;
    this.failed = false;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      this.failed = true;
      return false;
    }
    gl.shaderSource(vs, VERTEX_SHADER);
    gl.shaderSource(fs, this.fallback ? PREVIEW_FRAGMENT_SHADER_FALLBACK : PREVIEW_FRAGMENT_SHADER);
    gl.compileShader(vs);
    gl.compileShader(fs);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    // Flagged for deletion; they live as long as the program.
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    return true;
  }

  /** Finishes linking once the (possibly background) compile is done. */
  private checkLinked() {
    if (this.linked) return true;
    if (this.failed || this.lost || !this.program) return false;
    const gl = this.gl;
    if (this.parallel && !gl.getProgramParameter(this.program, this.parallel.COMPLETION_STATUS_KHR)) return false;
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      if (!this.fallback) {
        // Same rescue as the main view: the previous Cartoon lens, compiled now.
        console.warn("[viewfinder] filter previews: using the previous Cartoon lens:", gl.getProgramInfoLog(this.program));
        this.fallback = true;
        gl.deleteProgram(this.program);
        this.program = null;
        this.buildProgram();
        return false;
      }
      console.warn("[viewfinder] filter previews unavailable:", gl.getProgramInfoLog(this.program));
      this.failed = true;
      return false;
    }
    for (const name of UNIFORMS) this.uniforms[name] = gl.getUniformLocation(this.program, name);
    this.linked = true;
    return true;
  }

  /** Where the thumbnails are. Call again whenever the picker's layout changes. */
  setLayout(layout: PreviewLayout, devicePixelRatio: number) {
    this.layout = layout;
    this.dpr = Math.min(Math.max(1, devicePixelRatio), DPR_CAP);
    const w = Math.max(1, Math.round(layout.width * this.dpr));
    const h = Math.max(1, Math.round(layout.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.cells.fill(0);
    layout.cells.slice(0, PREVIEW_MAX_CELLS).forEach((c, i) => {
      this.cells.set([c.x * this.dpr, c.y * this.dpr, c.w * this.dpr, c.h * this.dpr], i * 4);
    });
  }

  /** Draws every thumbnail from the frame the video shows now. False if it couldn't yet. */
  draw(frame: PreviewFrame) {
    if (this.disposed || this.lost || !this.layout || !this.layout.cells.length || !this.checkLinked()) return false;
    const { video } = frame;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || video.readyState < 2) return false;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (vw !== this.texW || vh !== this.texH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      this.texW = vw;
      this.texH = vh;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    const d = this.dpr;
    const first = this.layout.cells[0];
    const local = thumbnailVideoRect(vw, vh, first.w * d, first.h * d);
    const u = this.uniforms;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(u.uVideo, 0);
    gl.uniform1f(u.uMirror, frame.mirror ? 1 : 0);
    gl.uniform1f(u.uTime, frame.time);
    gl.uniform1f(u.uDpr, d);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform4fv(u.uCells, this.cells);
    gl.uniform1i(u.uCount, Math.min(PREVIEW_MAX_CELLS, this.layout.cells.length));
    gl.uniform1f(u.uRadius, this.layout.radius * d);
    gl.uniform4f(u.uLocalRect, local.x, local.y, local.w, local.h);
    gl.uniform4fv(u.uFaceN, frame.face);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /** Frees the GPU objects and the context (the canvas is thrown away with it). */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
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
    this.lost = true;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
