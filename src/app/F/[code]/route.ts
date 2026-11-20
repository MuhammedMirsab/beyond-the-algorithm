import type { NextRequest } from "next/server";
import { feedbackPathForCode } from "@/lib/feedback-link";

/** GET /F/<code>: the short link in the feedback QR, on to /feedback?game=<slug>. */
export async function GET(request: NextRequest, ctx: RouteContext<"/F/[code]">) {
  const { code } = await ctx.params;
  return Response.redirect(new URL(feedbackPathForCode(code), request.url), 307);
}
