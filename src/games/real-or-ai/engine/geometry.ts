/**
 * Geometry for showing the photos: how a photo fills its box (object-fit:
 * cover, centred, as every round photo does) and what a magnifier over it
 * should show. Pure functions, so they're unit tested.
 */

export interface Size {
  width: number;
  height: number;
}

/** The drawn size of an image filling `box` (cover, centred), and its offset inside the box. */
export function coverFit(box: Size, image: Size): { width: number; height: number; x: number; y: number } {
  const scale = Math.max(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { width, height, x: (box.width - width) / 2, y: (box.height - height) / 2 };
}

/**
 * CSS background size and position for a round magnifier `diameter` px wide
 * that shows the image `zoom` times larger than it is drawn, centred on the
 * box point (px, py).
 */
export function loupeBackground(
  box: Size,
  image: Size,
  px: number,
  py: number,
  zoom: number,
  diameter: number,
): { sizeX: number; sizeY: number; posX: number; posY: number } {
  const fit = coverFit(box, image);
  return {
    sizeX: fit.width * zoom,
    sizeY: fit.height * zoom,
    posX: diameter / 2 - (px - fit.x) * zoom,
    posY: diameter / 2 - (py - fit.y) * zoom,
  };
}

/**
 * The transform that makes a box sitting at `to` look like it sits at
 * `from`: the first frame of a move from one place on screen to another
 * (uniform scale, about the box's centre).
 */
export function flipFrom(from: { left: number; top: number; width: number; height: number }, to: { left: number; top: number; width: number; height: number }) {
  return {
    x: from.left + from.width / 2 - (to.left + to.width / 2),
    y: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: to.width > 0 ? from.width / to.width : 1,
  };
}
