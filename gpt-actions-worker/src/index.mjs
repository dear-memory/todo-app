// Cloudflare Workers Free: ChatGPT custom GPT Actions -> Firebase Auth -> Firestore.
// No Firebase service-account keys; bot can ONLY create new chatgptTasks per Firestore rules.
// NEVER read, update, or delete users/{uid}, tasks, worklist, notes, or bookings.
const PROJECT_ID = "mkstroy-3dc7e";
const FIREBASE_WEB_API_KEY = "AIzaSyBfgL7gC-uQeeH2bBB4q2JRTnk2ooRTZF8";
const CATEGORIES = new Set(["업무", "개인", "운동", "개인성장"]);

function response(code, data) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function invalid(message) {
  throw new TypeError(message);
}

export function normalizeTask(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("JSON 객체가 필요합니다.");
  const { title, date, time = null, category = "업무", detail = "", requestId } = value;
  if (typeof title !== "string" || title.trim().length < 1 || title.trim().length > 160)
    invalid("제목을 1~160자로 작성해주세요.");
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    invalid("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  const testDate = new Date(date + "T00:00:00Z");
  if (!Number.isFinite(testDate.getTime()) || testDate.toISOString().slice(0, 10) !== date)
    invalid("유효하지 않은 날짜입니다.");
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
    invalid("시간은 HH:mm 또는 null이어야 합니다.");
  if (!CATEGORIES.has(category)) invalid("카테고리가 올바르지 않습니다.");
  if (typeof detail !== "string" || detail.length > 2000) invalid("상세 내용이 너무 깁니다.");
  if (requestId !== undefined && (typeof requestId !== "string" ||
      !/^[A-Za-z0-9_.:-]{8,128}$/.test(requestId)))
    invalid("requestId 형식이 잘못됐습니다.");
  return { title: title.trim(), date, time, category, detail, requestId: requestId || crypto.randomUUID() };
}

function firestoreFields(task) {
  const str = (v) => ({ stringValue: v });
  return {
    title: str(task.title),
    date: str(task.date),
    time: task.time === null ? { nullValue: null } : str(task.time),
    category: str(task.category),
    detail: str(task.detail),
    done: { booleanValue: false },
    source: str("chatgpt"),
    createdAt: { timestampValue: new Date().toISOString() },
  };
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(n => n.toString(16).padStart(2, "0")).join("");
}

async function docIdFor(uid, requestId) {
  const data = new TextEncoder().encode(uid + ":" + requestId);
  return "gpt-" + bytesToHex(await crypto.subtle.digest("SHA-256", data));
}

const safeUid = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{5,128}$/.test(v);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/tasks") return response(404, { error: "not_found" });
    if (request.method !== "POST") return response(405, { error: "method_not_allowed" });

    // Actions should use Bearer API key authentication. Never allow unauthenticated writes.
    if (!env?.GPT_ACTION_KEY || !env?.FIREBASE_BOT_EMAIL || !env?.FIREBASE_BOT_PASSWORD ||
        !safeUid(env?.FIREBASE_TARGET_UID) || !safeUid(env?.FIREBASE_BOT_UID))
      return response(503, { error: "server_not_configured" });
    const provided = request.headers.get("authorization") || "";
    if (provided !== "Bearer " + env.GPT_ACTION_KEY) return response(401, { error: "unauthorized" });
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") || ""))
      return response(415, { error: "json_required" });
    const len = Number(request.headers.get("content-length") || 0);
    if (len > 8192) return response(413, { error: "payload_too_large" });

    let task;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > 8192) return response(413, { error: "payload_too_large" });
      task = normalizeTask(JSON.parse(raw));
    } catch (e) {
      return response(400, { error: "invalid_task", message: e.message || "invalid_json" });
    }

    try {
      // Separate Firebase Auth BOT account: NOT the owner's password or an admin key.
      const signedIn = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FIREBASE_WEB_API_KEY,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: env.FIREBASE_BOT_EMAIL,
            password: env.FIREBASE_BOT_PASSWORD,
            returnSecureToken: true,
          }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!signedIn.ok) return response(503, { error: "bot_auth_failed" });
      const session = await signedIn.json();
      if (!session.idToken || session.localId !== env.FIREBASE_BOT_UID)
        return response(503, { error: "bot_identity_mismatch" });

      const docId = await docIdFor(env.FIREBASE_TARGET_UID, task.requestId);
      const root = "https://firestore.googleapis.com/v1/projects/" + PROJECT_ID
        + "/databases/(default)/documents/users/" + encodeURIComponent(env.FIREBASE_TARGET_UID)
        + "/chatgptTasks";
      const result = await fetch(root + "?documentId=" + encodeURIComponent(docId), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + session.idToken,
        },
        body: JSON.stringify({ fields: firestoreFields(task) }),
        signal: AbortSignal.timeout(10000),
      });

      // No success should be announced until Firestore confirms document creation.
      if (result.ok) return response(201, {
        saved: true, taskId: docId, title: task.title, date: task.date, time: task.time,
      });
      if (result.status === 409) return response(200, {
        saved: true, alreadySaved: true, taskId: docId,
        title: task.title, date: task.date, time: task.time,
      });
      if (result.status === 403) return response(403, { error: "firestore_rule_denied" });
      if (result.status === 401) return response(503, { error: "bot_session_not_accepted" });
      return response(502, { error: "firestore_create_failed", status: result.status });
    } catch {
      // Never log secrets, user text, login credentials, or Firebase session tokens.
      return response(503, { error: "temporary_backend_failure" });
    }
  },
};
