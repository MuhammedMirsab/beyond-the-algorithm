import { mergeDocument } from "@/lib/firestore-rest";
import { parseTrack } from "@/content/visits";

/**
 * POST /api/track: the feedback form reports what a visitor did (see
 * src/content/visits.ts). Writes `visits/<session>` with the service
 * account. Always answers 204 so a tracking hiccup never shows up for the
 * visitor; failures go to the Vercel logs.
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 16_000) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const data = parseTrack(body);
  if (!data) return new Response(null, { status: 400 });

  // Null means "not yet": leaving it out keeps a late, older post from wiping a newer value.
  const fields: Record<string, unknown> = { visitor: data.v };
  for (const [key, value] of Object.entries(data.sum)) {
    if (value !== null && value !== "" && key !== "from") fields[key] = value;
  }
  const serverTimeFields = ["lastAt"];

  if (data.dev) {
    const { fp, returning, visitNo, sentBefore, ...device } = data.dev;
    Object.assign(fields, { fp, returning, visitNo, sentBefore, device, from: data.sum.from });
    // Country only (Vercel adds it); the IP address itself is never stored.
    const country = request.headers.get("x-vercel-ip-country");
    if (country && /^[A-Z]{2}$/.test(country)) fields.country = country;
    serverTimeFields.push("openedAt");
  }

  try {
    await mergeDocument(`visits/${data.s}`, fields, { serverTimeFields, append: { events: data.e } });
  } catch (err) {
    console.error("track:", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 204 });
}
