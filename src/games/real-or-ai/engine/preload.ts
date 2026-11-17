import { getImageProps } from "next/image";

/**
 * Background image loading, copied from the original src/utils/imagePreloader.ts
 * and pointed at the pairs. The photos are served through next/image, so each
 * preload asks for the same srcset and sizes the round's <Image> will use:
 * the browser then picks the same file and the round shows it from cache.
 */

/** `sizes` for the two round photos: side by side from 768px, full width below. */
export const ROUND_SIZES = "(min-width: 768px) 50vw, 100vw";

const cache = new Map<string, Promise<void>>();

/** Loads and decodes one photo. Never rejects: a failed preload must not block the game. */
export function preloadSingleImage(src: string, sizes: string = ROUND_SIZES): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const key = `${sizes}|${src}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = new Promise<void>((resolve) => {
    const { props } = getImageProps({ src, alt: "", fill: true, sizes });
    const img = new Image();
    img.decoding = "async";
    if (props.sizes) img.sizes = props.sizes;
    if (props.srcSet) img.srcset = props.srcSet;
    img.onload = () => {
      img.decode().then(resolve, resolve);
    };
    img.onerror = () => {
      cache.delete(key); // let a later attempt retry
      resolve();
    };
    img.src = props.src;
  });

  cache.set(key, promise);
  return promise;
}

export function preloadImages(urls: readonly string[], sizes: string = ROUND_SIZES): Promise<void> {
  return Promise.all(urls.map((url) => preloadSingleImage(url, sizes))).then(() => undefined);
}

/**
 * Warms a list in batches of 4 with a short pause between them, as the
 * original warmUpLibraryCache did, so the page stays responsive.
 * Pass URLs in play order. Returns a cancel function for effect cleanup.
 */
export function warmUp(urls: readonly string[], sizes: string = ROUND_SIZES): () => void {
  let cancelled = false;
  let index = 0;
  let timer: number | undefined;

  const next = () => {
    if (cancelled || index >= urls.length) return;
    const batch = urls.slice(index, index + 4);
    index += 4;
    void preloadImages(batch, sizes).then(() => {
      if (!cancelled) timer = window.setTimeout(next, 50);
    });
  };

  next();
  return () => {
    cancelled = true;
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
