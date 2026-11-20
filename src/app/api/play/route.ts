import { mergeDocument } from "@/lib/firestore-rest";
import { hourBucket, parsePlay } from "@/content/plays";

/**
 * POST /api/play: a game page reports what a player did (see
 * src/content/plays.ts). Merges one session into
 * `plays/<device>_<hour>` with the service account, in one write. Always
 * answers 204 so a tracking hiccup never shows up for the visitor; failures
 * go to the Vercel logs.
 */

const TWO_DAYS_MS = 48 * 3_600_000;

const header = (request: Request, name: string, max = 80) => {
  const value = request.headers.get(name);
  if (!value) return "";
  try {
    return decodeURIComponent(value).slice(0, max);
  } catch {
    return value.slice(0, max);
  }
};

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 32_000) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const data = parsePlay(body);
  if (!data) return new Response(null, { status: 400 });

  // The hour picks the document; refuse ones far from now so nobody can scatter junk documents.
  const now = Date.now();
  const near = [now - TWO_DAYS_MS, now, now + 3_600_000].map((t) => hourBucket(new Date(t)));
  if (data.b < near[0] || data.b > near[2]) return new Response(null, { status: 400 });

  const base = `s.${data.s}`;
  const session: Record<string, unknown> = { sum: data.sum };
  const mask = [`${base}.sum`];
  const serverTimeFields = [`${base}.last`, "updatedAt"];

  if (data.dev) {
    // First post of the session: who and where. The team asked for the IP address.
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    session.dev = data.dev;
    session.net = {
      ip: (forwarded || request.headers.get("x-real-ip") || "").slice(0, 45),
      country: header(request, "x-vercel-ip-country", 2),
      region: header(request, "x-vercel-ip-country-region", 8),
      city: header(request, "x-vercel-ip-city", 60),
      ua: header(request, "user-agent", 300),
    };
    mask.push(`${base}.dev`, `${base}.net`);
    serverTimeFields.push(`${base}.at`);
  }

  const fields: Record<string, unknown> = { s: { [data.s]: session }, device: data.d };
  mask.push("device");

  try {
    await mergeDocument(`plays/${data.d}_${data.b}`, fields, {
      mask,
      serverTimeFields,
      append: { [`${base}.ev`]: data.e },
    });
  } catch (err) {
    console.error("play:", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 204 });
}
