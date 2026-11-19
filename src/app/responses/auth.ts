"use server";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * The feedback inbox is behind one shared password, checked on the server.
 * The repo is public, so only digests live here, never the password itself:
 *
 *   PASSWORD_DIGEST = sha256(password)
 *   SESSION_DIGEST  = sha256(hmacSha256(key = password, "bta-feedback-session-v1"))
 *
 * The cookie holds the HMAC token, which can't be made without the password.
 * To change the password, recompute both digests.
 */
const PASSWORD_DIGEST = "ccca3c76934c0f77db98f643fada02bd1234970d608718af578603deff3989fd";
const SESSION_DIGEST = "62df0ee1c174e9cc50af2ce6935c95b22f6d3261c28ef196b0d70e2446e0ec17";
const COOKIE = "bta_responses";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function same(a: Buffer, hex: string) {
  const b = Buffer.from(hex, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isSignedIn(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  return Boolean(token) && same(sha256(token!), SESSION_DIGEST);
}

export async function signIn(_prev: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  const password = String(form.get("password") ?? "");
  if (!password || !same(sha256(password), PASSWORD_DIGEST)) {
    // A short wait makes guessing slow.
    await new Promise((r) => setTimeout(r, 900));
    return { error: "That password isn't right." };
  }
  const token = createHmac("sha256", password).update("bta-feedback-session-v1").digest("hex");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/responses",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect("/responses");
}

export async function signOut() {
  (await cookies()).delete({ name: COOKIE, path: "/responses" });
  redirect("/responses");
}
