import { createSign } from "node:crypto";

/**
 * Server only. Reads the Firestore `feedback` collection with the Firebase
 * service account, over the REST API (no extra dependency). The security
 * rules keep this collection unreadable from the site; a service account
 * skips the rules, so its key must only ever live in a server env var:
 *
 *   FIREBASE_SERVICE_ACCOUNT = the whole service-account JSON (raw or base64)
 *
 * Never import this file from a client component.
 */

const PROJECT_ID = "beyond-the-algorithm-d26e3";

export interface FeedbackEntry {
  id: string;
  name: string;
  games: string[];
  from: string;
  rating: number;
  issues: string[];
  comment: string;
  /** ISO time the answer reached the server. */
  at: string;
}

export type FeedbackResult =
  | { ok: true; entries: FeedbackEntry[]; fetchedAt: string }
  | { ok: false; reason: "no-key" | "error"; message: string };

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, "\n") };
  }
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  return null;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

let cachedToken: { token: string; expires: number } | null = null;

async function accessToken(account: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(account.private_key));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** A Firestore REST value, decoded to plain JSON. */
type FsValue = Record<string, unknown>;

function decode(value: FsValue | undefined): unknown {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    const values = (value.arrayValue as { values?: FsValue[] }).values ?? [];
    return values.map(decode);
  }
  if ("mapValue" in value) {
    const fields = (value.mapValue as { fields?: Record<string, FsValue> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
  }
  return undefined;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

interface FsDocument {
  name: string;
  fields?: Record<string, FsValue>;
  createTime: string;
}

function toEntry(doc: FsDocument): FeedbackEntry {
  const f = Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)]));
  // The first answers (before 18 Nov) used one `game` field instead of `games`.
  const games = strList(f.games);
  const legacy = str(f.game);
  return {
    id: doc.name.split("/").pop() ?? doc.name,
    name: str(f.name).trim(),
    games: games.length ? games : legacy ? [legacy] : [],
    from: str(f.from) || legacy,
    rating: typeof f.rating === "number" ? f.rating : 0,
    issues: strList(f.issues),
    comment: str(f.comment).trim(),
    at: str(f.at) || doc.createTime,
  };
}

export async function fetchAllFeedback(): Promise<FeedbackResult> {
  let account: ServiceAccount | null;
  try {
    account = readServiceAccount();
  } catch {
    return { ok: false, reason: "error", message: "FIREBASE_SERVICE_ACCOUNT is set but isn't valid JSON." };
  }
  if (!account) {
    return { ok: false, reason: "no-key", message: "FIREBASE_SERVICE_ACCOUNT isn't set on the server." };
  }
  try {
    const token = await accessToken(account);
    const project = account.project_id || PROJECT_ID;
    const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/feedback`;
    const entries: FeedbackEntry[] = [];
    let pageToken = "";
    for (let page = 0; page < 50; page++) {
      const url = `${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) throw new Error(`Firestore said ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { documents?: FsDocument[]; nextPageToken?: string };
      entries.push(...(body.documents ?? []).map(toEntry));
      if (!body.nextPageToken) break;
      pageToken = body.nextPageToken;
    }
    entries.sort((a, b) => b.at.localeCompare(a.at));
    return { ok: true, entries, fetchedAt: new Date().toISOString() };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
