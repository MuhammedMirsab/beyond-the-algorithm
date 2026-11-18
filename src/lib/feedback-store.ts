import type { FeedbackEntry } from "@/content/feedback";

/**
 * Where feedback goes: a Redis list on Upstash (Vercel Marketplace), spoken to
 * over its REST API so no client library is needed. Connecting an Upstash
 * Redis database to the Vercel project sets these variables by itself.
 */
const KEY = "edex:feedback";

function credentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const storeConfigured = () => credentials() !== null;

async function command(args: (string | number)[]): Promise<unknown> {
  const creds = credentials();
  if (!creds) throw new Error("Feedback storage is not connected");
  const res = await fetch(creds.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !data || data.error) throw new Error(data?.error ?? `Storage answered ${res.status}`);
  return data.result;
}

/** Saves one entry. Without storage it still lands in the Vercel function logs. */
export async function saveFeedback(entry: FeedbackEntry): Promise<boolean> {
  const line = JSON.stringify(entry);
  if (!storeConfigured()) {
    console.warn("[feedback] storage not connected, logged only:", line);
    return false;
  }
  await command(["LPUSH", KEY, line]);
  return true;
}

/** Newest first. */
export async function readFeedback(): Promise<FeedbackEntry[]> {
  const result = await command(["LRANGE", KEY, 0, -1]);
  if (!Array.isArray(result)) return [];
  const entries: FeedbackEntry[] = [];
  for (const item of result) {
    if (typeof item !== "string") continue;
    try {
      entries.push(JSON.parse(item) as FeedbackEntry);
    } catch {
      // A broken line is skipped, never shown.
    }
  }
  return entries;
}
