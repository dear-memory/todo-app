"use strict";

const { randomUUID, createHash } = require("node:crypto");
const { parseTask, firestoreFields } = require("../lib/validation");

const PROJECT_ID = "mkstroy-3dc7e";
// Firebase's web API key is a public client identifier, never a service account key.
const FIREBASE_WEB_API_KEY = "AIzaSyBfgL7gC-uQeeH2bBB4q2JRTnk2ooRTZF8";

function reply(res, code, body) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(code).json(body);
}

async function handle(req, res, request = fetch) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res, 405, { error: "method_not_allowed" });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
    return reply(res, 415, { error: "json_required" });
  }
  const authorization = req.headers.authorization || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > 8000) {
    return reply(res, 401, { error: "firebase_sign_in_required" });
  }
  const body = req.body;
  if (Buffer.byteLength(JSON.stringify(body || {})) > 8192) {
    return reply(res, 413, { error: "body_too_large" });
  }

  let task;
  try {
    task = parseTask(body);
  } catch (e) {
    return reply(res, e.status || 400, { error: "invalid_task", message: e.message });
  }

  const requestKey = req.headers["idempotency-key"] || randomUUID();
  if (typeof requestKey !== "string" || requestKey.length > 128 ||
      !/^[A-Za-z0-9_.:-]+$/.test(requestKey)) {
    return reply(res, 400, { error: "invalid_idempotency_key" });
  }

  try {
    // Firebase lookup validates the token and returns the authenticated Firebase UID.
    // Never trust an account ID supplied by the browser request.
    const identity = await request(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: match[1] }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!identity.ok) return reply(res, 401, { error: "invalid_firebase_session" });
    const who = await identity.json();
    const uid = who.users?.[0]?.localId;
    if (typeof uid !== "string" || !uid || uid.includes("/")) {
      return reply(res, 401, { error: "invalid_firebase_session" });
    }
    if (who.users?.[0]?.disabled) {
      return reply(res, 403, { error: "account_disabled" });
    }

    // A new document is created in a separate collection, never users/{uid}.
    // Firestore applies per-user Security Rules to this Firebase ID token.
    const docId = createHash("sha256").update(uid + ":" + requestKey).digest("hex");
    const root = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID
      + "/databases/(default)/documents/users/" + encodeURIComponent(uid)
      + "/chatgptTasks";
    const url = root + "?documentId=" + encodeURIComponent(docId);
    const written = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + match[1],
      },
      body: JSON.stringify({
        fields: firestoreFields(task, new Date().toISOString()),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (written.ok) return reply(res, 201, { ok: true, id: docId, task });
    if (written.status === 409) {
      return reply(res, 200, { ok: true, id: docId, alreadySaved: true });
    }
    if (written.status === 401) return reply(res, 401, { error: "session_expired" });
    if (written.status === 403) {
      return reply(res, 403, { error: "firestore_rule_denied" });
    }
    return reply(res, 502, { error: "firestore_write_failed" });
  } catch (e) {
    // Deliberately never log authentication tokens or private task content.
    return reply(res, 503, { error: "temporary_connection_error" });
  }
}

module.exports = (req, res) => handle(req, res);
module.exports.handle = handle;
