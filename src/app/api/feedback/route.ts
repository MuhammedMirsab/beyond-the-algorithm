import { parseFeedback } from "@/content/feedback";
import { saveFeedback } from "@/lib/feedback-store";

export const dynamic = "force-dynamic";

/** One visitor's feedback from the /feedback form. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);

  // A hidden field people never see; anything filled in it is a bot.
  if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
    return Response.json({ ok: true });
  }

  const input = parseFeedback(body);
  if (!input) return Response.json({ ok: false, error: "Pick a game and a rating." }, { status: 400 });

  try {
    await saveFeedback({ ...input, at: new Date().toISOString() });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[feedback] save failed", error);
    return Response.json({ ok: false, error: "It didn't send. Try again in a moment." }, { status: 502 });
  }
}
