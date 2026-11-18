/**
 * The machine's view as a canvas: every number from 1 to max is a cell, and
 * every change to what's still possible is animated.
 *
 * - Crossed-out numbers fall away in a wave that starts at the cut.
 * - The numbers left glide together into a bigger grid, so the field zooms
 *   in on your number with every answer.
 * - While a question is up, the numbers that would answer "yes" take the
 *   game colour, and hovering an answer dims the half it would cross out.
 *
 * No React here: one rAF loop runs only while something is moving, so the
 * field costs nothing when it is still. Under reduced motion, nothing moves:
 * cells fade, and the grid snaps to its new shape once they have gone.
 */

import { evaluateClue, type Clue } from "../../engine/clues";
import { formatNumber } from "../../engine/ranges";
import { easeInOut, easeOut, type Ease } from "../motion";
import { dropOrder, gridFor, labelSize, slotOf } from "./layout";

export interface FieldInput {
  max: number;
  /** Numbers still possible, ascending. */
  candidates: readonly number[];
  /** The question on screen. Numbers that would answer yes take the game colour. */
  question: Clue | null;
  /** The answer being hovered or focused: the numbers it would cross out dim. */
  preview: boolean | null;
  /** The last number turns into the game colour, ready to be revealed. */
  reveal: boolean;
}

export interface FieldColors {
  fg: string;
  game: string;
  gameInk: string;
  font: string;
}

/** Milliseconds. Exits are quicker than entrances; moves use ease-in-out. */
export const FIELD_TIMING = {
  drop: 420,
  dropSpreadMin: 90,
  dropSpreadMax: 320,
  moveDelay: 170,
  /** The glide runs as a cascade in reading order, so the field fills like water instead of crunching. */
  moveStagger: 150,
  move: 520,
  appear: 380,
  appearSpreadMax: 520,
  tone: 300,
  toneSweep: 240,
  preview: 160,
  reducedFade: 200,
} as const;

/** Neutral cells are white at this opacity on the dark panel. */
const NEUTRAL_FILL = 0.1;
/** How far a hovered answer dims the numbers it would cross out (they still fall visibly). */
const PREVIEW_DIM = 0.55;

interface Prop {
  from: number;
  to: number;
  start: number;
  dur: number;
  ease: Ease;
}

const prop = (value: number): Prop => ({ from: value, to: value, start: 0, dur: 0, ease: easeOut });

function valueAt(p: Prop, now: number): number {
  if (now <= p.start) return p.from;
  if (p.dur <= 0 || now >= p.start + p.dur) return p.to;
  return p.from + (p.to - p.from) * p.ease((now - p.start) / p.dur);
}

function snap(p: Prop, value: number) {
  p.from = value;
  p.to = value;
  p.start = 0;
  p.dur = 0;
}

interface Cell {
  n: number;
  label: string;
  alive: boolean;
  x: Prop;
  y: Prop;
  size: Prop;
  scale: Prop;
  lift: Prop;
  alpha: Prop;
  tone: Prop;
  dim: Prop;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class FieldEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private colors: FieldColors;
  private readonly reduced: boolean;
  private cells: Cell[] = [];
  private alive: number[] = [];
  private input: FieldInput | null = null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private busyUntil = 0;
  private moveEnd = 0;
  private font = "";
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, options: { reduced: boolean; colors: FieldColors }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.reduced = options.reduced;
    this.colors = options.colors;
  }

  setColors(colors: FieldColors) {
    this.colors = colors;
    this.font = "";
    this.kick();
  }

  resize(width: number, height: number, dpr: number) {
    if (this.destroyed || width <= 0 || height <= 0) return;
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    // Resizing a canvas resets its context, font included.
    this.font = "";
    if (this.input) {
      if (first) this.apply(this.input);
      else this.relayout();
    }
    this.kick();
  }

  update(input: FieldInput) {
    if (this.destroyed) return;
    this.input = input;
    if (this.width > 0) this.apply(input);
  }

  destroy() {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private ensureCells(max: number) {
    for (let n = this.cells.length + 1; n <= max; n++) {
      this.cells.push({
        n,
        label: formatNumber(n),
        alive: false,
        x: prop(0),
        y: prop(0),
        size: prop(0),
        scale: prop(1),
        lift: prop(0),
        alpha: prop(0),
        tone: prop(0),
        dim: prop(0),
      });
    }
  }

  private set(p: Prop, to: number, now: number, dur: number, delay: number, ease: Ease): boolean {
    if (p.to === to) return false;
    p.from = valueAt(p, now);
    p.to = to;
    p.start = now + delay;
    p.dur = dur;
    p.ease = ease;
    this.busyUntil = Math.max(this.busyUntil, p.start + dur);
    return true;
  }

  /** A resize: every cell jumps to its new place, nothing animates. */
  private relayout() {
    const input = this.input;
    if (!input) return;
    const grid = gridFor(Math.max(1, this.alive.length), this.width, this.height);
    this.alive.forEach((n, i) => {
      const cell = this.cells[n - 1];
      const slot = slotOf(grid, i);
      snap(cell.x, slot.x);
      snap(cell.y, slot.y);
      snap(cell.size, grid.cell);
    });
    this.moveEnd = 0;
  }

  private apply(input: FieldInput) {
    const now = performance.now();
    const reduced = this.reduced;
    this.ensureCells(input.max);

    const next = input.candidates.filter((n) => n >= 1 && n <= input.max);
    const nextSet = new Set(next);
    const previous = this.alive;
    const removed = new Set<number>();
    for (const n of previous) if (!nextSet.has(n)) removed.add(n);

    // 1. What the answer ruled out falls away, starting at the cut.
    if (removed.size > 0) {
      const order = dropOrder(previous, removed);
      const spread = clamp(removed.size * 6 + 60, FIELD_TIMING.dropSpreadMin, FIELD_TIMING.dropSpreadMax);
      for (const n of removed) {
        const cell = this.cells[n - 1];
        cell.alive = false;
        const delay = reduced ? 0 : (order.get(n) ?? 0) * spread;
        this.set(cell.alpha, 0, now, reduced ? FIELD_TIMING.reducedFade : FIELD_TIMING.drop, delay, easeOut);
        if (!reduced) {
          const size = valueAt(cell.size, now);
          this.set(cell.lift, size * 0.55, now, FIELD_TIMING.drop + 60, delay, easeOut);
          this.set(cell.scale, 0.7, now, FIELD_TIMING.drop + 60, delay, easeOut);
        }
      }
    }

    // 2. The rest glide together into bigger cells.
    const grid = gridFor(Math.max(1, next.length), this.width, this.height);
    const moveDelay = removed.size > 0 ? (reduced ? FIELD_TIMING.reducedFade : FIELD_TIMING.moveDelay) : 0;
    const moveDur = reduced ? 0 : FIELD_TIMING.move;
    const arriving = next.filter((n) => !this.cells[n - 1].alive).length;
    const arriveSpread = Math.min(FIELD_TIMING.appearSpreadMax, arriving * 10);
    let arrived = 0;
    let moved = false;

    const cascade = reduced || next.length < 2 ? 0 : FIELD_TIMING.moveStagger;
    next.forEach((n, i) => {
      const cell = this.cells[n - 1];
      const slot = slotOf(grid, i);
      if (cell.alive) {
        const delay = moveDelay + (cascade * i) / Math.max(1, next.length - 1);
        moved = this.set(cell.x, slot.x, now, moveDur, delay, easeInOut) || moved;
        moved = this.set(cell.y, slot.y, now, moveDur, delay, easeInOut) || moved;
        moved = this.set(cell.size, grid.cell, now, moveDur, delay, easeInOut) || moved;
        return;
      }
      // New to the field, or back after an undo: appear in place.
      cell.alive = true;
      const delay = moveDelay + (reduced || arriving < 2 ? 0 : (arrived / (arriving - 1)) * arriveSpread);
      arrived += 1;
      snap(cell.x, slot.x);
      snap(cell.y, slot.y);
      snap(cell.size, grid.cell);
      if (reduced) {
        snap(cell.scale, 1);
        snap(cell.lift, 0);
      } else {
        if (valueAt(cell.alpha, now) < 0.05) {
          snap(cell.scale, 0.82);
          snap(cell.lift, grid.cell * 0.2);
        }
        this.set(cell.scale, 1, now, FIELD_TIMING.appear + 80, delay, easeOut);
        this.set(cell.lift, 0, now, FIELD_TIMING.appear + 80, delay, easeOut);
      }
      this.set(cell.alpha, 1, now, reduced ? FIELD_TIMING.reducedFade : FIELD_TIMING.appear, delay, easeOut);
    });
    if (moved || removed.size > 0) this.moveEnd = now + moveDelay + cascade + moveDur;

    // 3. The question: "yes" numbers take the game colour once the field has settled.
    const wait = Math.max(0, this.moveEnd - now);
    const total = next.length;
    next.forEach((n, i) => {
      const cell = this.cells[n - 1];
      const yes = input.reveal || (input.question ? evaluateClue(input.question, n) : false);
      const sweep = reduced || !yes || total < 2 ? 0 : (i / (total - 1)) * FIELD_TIMING.toneSweep;
      this.set(cell.tone, yes ? 1 : 0, now, FIELD_TIMING.tone, yes ? wait + sweep : 0, easeOut);
      const crossedOut =
        input.preview !== null && input.question !== null && evaluateClue(input.question, n) !== input.preview;
      this.set(cell.dim, crossedOut ? 1 : 0, now, FIELD_TIMING.preview, 0, easeOut);
    });

    this.alive = next;
    this.kick();
  }

  private kick() {
    if (this.destroyed || this.raf || !this.ctx) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const busy = this.draw(now);
    if (busy) this.kick();
  };

  private setFont(size: number) {
    const rounded = Math.round(size * 4) / 4;
    const font = `650 ${rounded}px ${this.colors.font}`;
    if (font !== this.font && this.ctx) {
      this.ctx.font = font;
      this.font = font;
    }
  }

  private draw(now: number): boolean {
    const ctx = this.ctx;
    if (!ctx || this.width === 0) return false;
    const { fg, game, gameInk } = this.colors;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Falling cells first, so they pass behind the ones that stay.
    for (const pass of [false, true]) {
      for (const cell of this.cells) {
        if (cell.alive !== pass) continue;
        const alpha = valueAt(cell.alpha, now) * (1 - PREVIEW_DIM * valueAt(cell.dim, now));
        if (alpha < 0.004) continue;
        const size = valueAt(cell.size, now) * valueAt(cell.scale, now);
        if (size < 0.5) continue;
        const x = valueAt(cell.x, now);
        const y = valueAt(cell.y, now) + valueAt(cell.lift, now);
        const tone = valueAt(cell.tone, now);
        const radius = Math.min(size * (size < 14 ? 0.32 : 0.22), 16);

        ctx.beginPath();
        if (typeof ctx.roundRect === "function") ctx.roundRect(x - size / 2, y - size / 2, size, size, radius);
        else ctx.rect(x - size / 2, y - size / 2, size, size);
        if (tone < 0.999) {
          ctx.globalAlpha = alpha * (1 - tone) * NEUTRAL_FILL;
          ctx.fillStyle = fg;
          ctx.fill();
        }
        if (tone > 0.001) {
          ctx.globalAlpha = alpha * tone;
          ctx.fillStyle = game;
          ctx.fill();
        }

        const fontSize = labelSize(size, cell.n);
        if (fontSize >= 8.5) {
          const labelAlpha = alpha * Math.min(1, (fontSize - 8.5) / 2.5);
          this.setFont(fontSize);
          const baseline = y + fontSize * 0.36;
          if (tone < 0.999) {
            ctx.globalAlpha = labelAlpha * (1 - tone) * 0.92;
            ctx.fillStyle = fg;
            ctx.fillText(cell.label, x, baseline);
          }
          if (tone > 0.001) {
            ctx.globalAlpha = labelAlpha * tone;
            ctx.fillStyle = gameInk;
            ctx.fillText(cell.label, x, baseline);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
    return now < this.busyUntil;
  }
}
