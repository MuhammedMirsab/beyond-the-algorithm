/**
 * Everything the game keeps outside React state: the embedding cache, the
 * trained classifier (tensors), and camera photo blob URLs.
 *
 * One instance per page. Library photo embeddings are kept across visitors
 * (they are the same for everyone and make the next training faster).
 * Anything that came from a visitor (camera photos, their embeddings, the
 * trained model) is dropped by resetVisitor().
 */

import { disposeClassifier, type Classifier } from "../engine/classifier";
import { extractEmbedding, loadImage } from "../engine/vision";

export interface EmbeddablePhoto {
  id: string;
  url: string;
  /** Camera photos belong to a visitor; library photos do not. */
  fromVisitor: boolean;
}

class Session {
  private cache = new Map<string, Float32Array>();
  private inflight = new Map<string, Promise<Float32Array>>();
  private visitorIds = new Set<string>();
  private blobUrls = new Set<string>();
  private classifier: Classifier | null = null;
  /** Bumped on reset, so late results from the last visitor are dropped. */
  private generation = 0;

  has(id: string) {
    return this.cache.has(id);
  }

  get(id: string) {
    return this.cache.get(id) ?? null;
  }

  /** Read a photo once and cache its 1,280 numbers. Concurrent calls share the work. */
  embed(photo: EmbeddablePhoto, source?: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement): Promise<Float32Array> {
    const hit = this.cache.get(photo.id);
    if (hit) return Promise.resolve(hit);
    const pending = this.inflight.get(photo.id);
    if (pending) return pending;

    const generation = this.generation;
    if (photo.fromVisitor) this.visitorIds.add(photo.id);
    const work = (async () => {
      const pixels = source ?? (await loadImage(photo.url));
      const embedding = await extractEmbedding(pixels);
      if (generation === this.generation) this.cache.set(photo.id, embedding);
      return embedding;
    })();
    this.inflight.set(photo.id, work);
    const clear = () => {
      if (this.inflight.get(photo.id) === work) this.inflight.delete(photo.id);
    };
    work.then(clear, clear);
    return work;
  }

  /** Embed in the background, one at a time; errors are left for training to report. */
  async warm(photos: EmbeddablePhoto[], shouldStop: () => boolean) {
    for (const photo of photos) {
      if (shouldStop()) return;
      if (this.cache.has(photo.id)) continue;
      try {
        await this.embed(photo);
      } catch {
        // Training reads every photo again and shows a real error if it fails.
      }
    }
  }

  trackBlobUrl(url: string) {
    this.blobUrls.add(url);
  }

  /** A visitor removed one of their camera photos. */
  forgetVisitorPhoto(id: string, url: string) {
    this.cache.delete(id);
    this.inflight.delete(id);
    this.visitorIds.delete(id);
    if (this.blobUrls.delete(url)) URL.revokeObjectURL(url);
  }

  getClassifier() {
    return this.classifier;
  }

  /** Swap in a new model; the old one's tensors are freed. */
  setClassifier(next: Classifier | null) {
    if (this.classifier && this.classifier !== next) disposeClassifier(this.classifier);
    this.classifier = next;
  }

  /** Next player: drop the model and everything that came from the visitor. */
  resetVisitor() {
    this.generation++;
    this.setClassifier(null);
    for (const id of this.visitorIds) {
      this.cache.delete(id);
      this.inflight.delete(id);
    }
    this.visitorIds.clear();
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls.clear();
  }
}

/** The page's single session. Created lazily so nothing runs on the server. */
let instance: Session | null = null;
export function getSession(): Session {
  instance ??= new Session();
  return instance;
}
