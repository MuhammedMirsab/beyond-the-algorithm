/**
 * The recorder's AudioWorklet processor, copied from the original app. It is
 * kept as a string (the repo has no .js files under src) and loaded from a
 * Blob URL. It captures PCM from the record tap and switches on and off at
 * sample precision, at AudioContext times sent from the main thread.
 */
export const CAPTURE_PROCESSOR = "air-capture";

export const CAPTURE_WORKLET_SOURCE = `
class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.on = false; this.pending = []; this.L = []; this.R = []; this.count = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === 'capture') this.pending.push({ on: m.on, at: m.at });
      if (m.cmd === 'flush') { this.flush(); this.port.postMessage({ type: 'flushed' }); }
      if (m.cmd === 'reset') { this.on = false; this.pending = []; this.L = []; this.R = []; this.count = 0; }
    };
  }
  flush() {
    if (!this.count) return;
    const l = new Float32Array(this.count), r = new Float32Array(this.count);
    let o = 0;
    for (let i = 0; i < this.L.length; i++) { l.set(this.L[i], o); r.set(this.R[i], o); o += this.L[i].length; }
    this.port.postMessage({ type: 'data', l, r }, [l.buffer, r.buffer]);
    this.L = []; this.R = []; this.count = 0;
  }
  process(inputs) {
    const inp = inputs[0];
    const n = 128;
    const l = inp && inp[0] ? inp[0] : null;
    const r = inp && inp[1] ? inp[1] : l;
    let start = 0;
    // Apply pending on/off changes at sample precision.
    while (start < n) {
      let nextIdx = n, next = null;
      for (const p of this.pending) {
        const idx = Math.round((p.at - currentTime) * sampleRate);
        if (idx < nextIdx) { nextIdx = Math.max(start, idx); next = p; }
      }
      const end = next ? nextIdx : n;
      if (this.on && end > start) {
        const a = new Float32Array(end - start), b = new Float32Array(end - start);
        if (l) { a.set(l.subarray(start, end)); b.set(r.subarray(start, end)); }
        this.L.push(a); this.R.push(b); this.count += end - start;
      }
      if (next) {
        this.on = next.on;
        this.pending.splice(this.pending.indexOf(next), 1);
        this.port.postMessage({ type: 'state', on: next.on, frame: currentFrame + end });
      }
      start = end;
      if (!next) break;
    }
    if (this.count >= 8192) this.flush();
    return true;
  }
}
registerProcessor('${CAPTURE_PROCESSOR}', Capture);
`;
