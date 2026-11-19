#!/usr/bin/env node
/**
 * Dumps every visitor feedback answer from Firestore to JSON and CSV.
 *
 *   node scripts/export-feedback.mjs <service-account.json> [out-dir]
 *
 * or set FIREBASE_SERVICE_ACCOUNT (the JSON, raw or base64) and leave out the
 * first argument. Get the key in the Firebase console: Project settings,
 * Service accounts, Generate new private key. Never commit it (*.json keys
 * matching *-firebase-adminsdk-* are git-ignored).
 */
import { createSign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [keyPath, outDir = "feedback-export"] = process.argv.slice(2);
const raw = keyPath ? readFileSync(keyPath, "utf8") : process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("Usage: node scripts/export-feedback.mjs <service-account.json> [out-dir]");
  process.exit(1);
}
const account = JSON.parse(raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
const project = account.project_id || "beyond-the-algorithm-d26e3";

const b64url = (s) => Buffer.from(s).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
  JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }),
)}`;
const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key.replace(/\\n/g, "\n"));

const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }),
});
if (!tokenRes.ok) throw new Error(`Google sign-in failed: ${tokenRes.status} ${await tokenRes.text()}`);
const { access_token } = await tokenRes.json();

const decode = (v) => {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
};

const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/feedback`;
const entries = [];
let pageToken = "";
do {
  const res = await fetch(`${base}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`Firestore said ${res.status}: ${await res.text()}`);
  const body = await res.json();
  for (const doc of body.documents ?? []) {
    const f = Object.fromEntries(Object.entries(doc.fields ?? {}).map(([k, v]) => [k, decode(v)]));
    const games = Array.isArray(f.games) && f.games.length ? f.games : f.game ? [f.game] : [];
    entries.push({
      id: doc.name.split("/").pop(),
      at: f.at ?? doc.createTime,
      name: (f.name ?? "").trim(),
      rating: f.rating ?? null,
      games,
      from: f.from || f.game || "",
      issues: f.issues ?? [],
      comment: (f.comment ?? "").trim(),
    });
  }
  pageToken = body.nextPageToken ?? "";
} while (pageToken);

entries.sort((a, b) => String(b.at).localeCompare(String(a.at)));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "feedback.json"), JSON.stringify(entries, null, 2));
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [
  ["at", "name", "rating", "games", "from", "issues", "comment", "id"].join(","),
  ...entries.map((e) => [e.at, e.name, e.rating, e.games.join("; "), e.from, e.issues.join("; "), e.comment, e.id].map(cell).join(",")),
].join("\r\n");
writeFileSync(join(outDir, "feedback.csv"), "﻿" + csv);

const avg = entries.length ? entries.reduce((s, e) => s + (e.rating ?? 0), 0) / entries.length : 0;
console.log(`${entries.length} answers, average ${avg.toFixed(2)} / 5 -> ${join(outDir, "feedback.json")} and feedback.csv`);
