import { describe, expect, test } from "bun:test";
import { PRESENCE_SIZE, presenceFromPixels } from "./presence";

function frame(pixel: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(PRESENCE_SIZE * PRESENCE_SIZE * 4);
  for (let y = 0; y < PRESENCE_SIZE; y++) {
    for (let x = 0; x < PRESENCE_SIZE; x++) {
      const [r, g, b] = pixel(x, y);
      const i = (y * PRESENCE_SIZE + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("presenceFromPixels", () => {
  test("a covered lens is dark", () => {
    expect(presenceFromPixels(frame(() => [3, 3, 3]))).toEqual({ isEmpty: true, reason: "dark" });
  });

  test("a plain wall is blank", () => {
    expect(presenceFromPixels(frame(() => [180, 175, 170]))).toEqual({ isEmpty: true, reason: "blank" });
  });

  test("an object with edges is something to look at", () => {
    const object = frame((x, y) => ((x - 32) ** 2 + (y - 32) ** 2 < 200 ? [30, 60, 200] : [235, 230, 220]));
    expect(presenceFromPixels(object).isEmpty).toBe(false);
    const stripes = frame((x) => (Math.floor(x / 4) % 2 ? [20, 20, 20] : [230, 230, 230]));
    expect(presenceFromPixels(stripes).isEmpty).toBe(false);
  });
});
