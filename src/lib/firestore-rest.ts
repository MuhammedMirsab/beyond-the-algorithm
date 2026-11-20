import { createSign } from "node:crypto";

/**
 * Server only. Firestore over its REST API with the Firebase service account
 * (no extra dependency). A service account skips the security rules, so its
 * key must only ever live in a server env var:
 *
 *   FIREBASE_SERVICE_ACCOUNT = the whole service-account JSON (raw or base64)
 *
 * Never import this file from a client component.
 */

const PROJECT_ID = "beyond-the-algorithm-d26e3";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export class NoKeyError extends Error {}

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

/** The service account, or a NoKeyError / SyntaxError saying why not. */
export function serviceAccount(): ServiceAccount {
  let account: ServiceAccount | null;
  try {
    account = readServiceAccount();
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is set but isn't valid JSON.");
  }
  if (!account) throw new NoKeyError("FIREBASE_SERVICE_ACCOUNT isn't set on the server.");
  return account;
}

const b64url = (input: string | Buffer) => Buffer.from(input).toString("base64url");

let cachedToken: { token: string; expires: number } | null = null;

export async function accessToken(account: ServiceAccount): Promise<string> {
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

export const documentsRoot = (account: ServiceAccount) =>
  `projects/${account.project_id || PROJECT_ID}/databases/(default)/documents`;

/* ── Values ───────────────────────────────────────────────────────── */

/** A Firestore REST value. */
export type FsValue = Record<string, unknown>;

export function decode(value: FsValue | undefined): unknown {
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

/** Plain JSON to a Firestore REST value (whole numbers become integers). */
export function encode(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)])) } };
  }
  return { nullValue: null };
}

export interface FsDocument {
  name: string;
  fields?: Record<string, FsValue>;
  createTime: string;
}

export const plainFields = (doc: FsDocument) =>
  Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)])) as Record<string, unknown>;

/* ── Calls ────────────────────────────────────────────────────────── */

/** Every document in a top-level collection, up to 15,000. */
export async function listCollection(collection: string): Promise<FsDocument[]> {
  const account = serviceAccount();
  const token = await accessToken(account);
  const base = `https://firestore.googleapis.com/v1/${documentsRoot(account)}/${collection}`;
  const docs: FsDocument[] = [];
  let pageToken = "";
  for (let page = 0; page < 50; page++) {
    const url = `${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) throw new Error(`Firestore said ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { documents?: FsDocument[]; nextPageToken?: string };
    docs.push(...(body.documents ?? []));
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return docs;
}

/**
 * Merge `fields` into one document (creating it if needed), stamp
 * `serverTimeFields` with the server's clock and append `append` items to
 * array fields, all in one atomic write.
 */
export async function mergeDocument(
  path: string,
  fields: Record<string, unknown>,
  opts: {
    serverTimeFields?: string[];
    append?: Record<string, unknown[]>;
    /** Field paths to write (dotted for nested maps). Defaults to the top-level keys of `fields`. */
    mask?: string[];
  } = {},
): Promise<void> {
  const account = serviceAccount();
  const token = await accessToken(account);
  const root = documentsRoot(account);
  const transforms = [
    ...(opts.serverTimeFields ?? []).map((fieldPath) => ({ fieldPath, setToServerValue: "REQUEST_TIME" })),
    ...Object.entries(opts.append ?? {})
      .filter(([, items]) => items.length > 0)
      .map(([fieldPath, items]) => ({ fieldPath, appendMissingElements: { values: items.map(encode) } })),
  ];
  const write = {
    update: { name: `${root}/${path}`, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) },
    updateMask: { fieldPaths: opts.mask ?? Object.keys(fields) },
    ...(transforms.length ? { updateTransforms: transforms } : {}),
  };
  const res = await fetch(`https://firestore.googleapis.com/v1/${root}:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [write] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Firestore said ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
