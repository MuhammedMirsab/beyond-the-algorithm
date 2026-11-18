/**
 * Where every number sits in the field. Pure maths, so it can be tested and
 * shared by the live field and the How it works pictures.
 *
 * The field always packs the numbers that are still possible into the
 * biggest square cells that fit. Fewer numbers means bigger cells, so the
 * field zooms in on your number as the answers come in.
 */

export interface GridLayout {
  count: number;
  cols: number;
  rows: number;
  /** Distance between two cell centres. */
  pitch: number;
  /** Side of one cell (pitch minus the gap). */
  cell: number;
  /** Centre of the first cell. */
  originX: number;
  originY: number;
}

/** Cells never grow past this share of the shorter side (the reveal is drawn separately). */
const MAX_PITCH_SHARE = 0.36;

/** Gap between cells: tight dots for big fields, roomier tiles for small ones. */
export function cellFor(pitch: number): number {
  return pitch * (pitch >= 24 ? 0.87 : 0.8);
}

/**
 * The grid with the biggest cells that holds `count` cells in a `width` × `height` box.
 * Rows fill left to right, top to bottom; the block is centred.
 */
export function gridFor(count: number, width: number, height: number): GridLayout {
  const n = Math.max(1, Math.floor(count));
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  let best = { cols: 1, rows: n, pitch: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const pitch = Math.min(w / cols, h / rows);
    // On a tie, more columns win: wide rows read like a number line.
    if (pitch >= best.pitch - 1e-9) best = { cols, rows, pitch };
    if (rows === 1) break;
  }
  const pitch = Math.min(best.pitch, Math.min(w, h) * MAX_PITCH_SHARE);
  const cols = Math.min(best.cols, n);
  const rows = Math.ceil(n / cols);
  return {
    count: n,
    cols,
    rows,
    pitch,
    cell: cellFor(pitch),
    originX: (w - cols * pitch) / 2 + pitch / 2,
    originY: (h - rows * pitch) / 2 + pitch / 2,
  };
}

/** Centre of the cell at `index` in reading order. */
export function slotOf(layout: GridLayout, index: number): { x: number; y: number } {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  return { x: layout.originX + col * layout.pitch, y: layout.originY + row * layout.pitch };
}

/**
 * The order in which crossed-out numbers fall away, as 0 (first) to 1 (last).
 * When they form one block (a "more than" answer), the wave starts at the cut
 * and runs outward; when they're scattered (even or odd), it runs in reading order.
 */
export function dropOrder(previous: readonly number[], removed: ReadonlySet<number>): Map<number, number> {
  const order = new Map<number, number>();
  const indices: number[] = [];
  previous.forEach((n, i) => {
    if (removed.has(n)) indices.push(i);
  });
  if (indices.length === 0) return order;
  const first = indices[0];
  const last = indices[indices.length - 1];
  const block = last - first + 1 === indices.length;
  const span = Math.max(1, indices.length - 1);
  indices.forEach((index, k) => {
    let rank = k;
    if (block && last === previous.length - 1 && first > 0) rank = index - first; // upper block: from the cut upward
    else if (block && first === 0 && last < previous.length - 1) rank = last - index; // lower block: from the cut downward
    order.set(previous[index], rank / span);
  });
  return order;
}

/** Digits a number shows with, counting the thousands comma. */
export function labelLength(n: number): number {
  return n >= 1000 ? 5 : String(n).length;
}

/** Font size for a number inside a cell, by how many characters it shows. */
export function labelSize(cell: number, n: number): number {
  const chars = labelLength(n);
  const share = chars <= 2 ? 0.42 : chars === 3 ? 0.34 : 0.25;
  return cell * share;
}
