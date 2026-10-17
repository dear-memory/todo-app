"use strict";

// Write-only endpoint for an already-authenticated Firebase user.
// It NEVER updates the existing users/{uid} document, tasks, worklist or notes.
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createHash } = require("node:crypto");
const { normalizeTask } = require("./validation");

if (!getApps().length) initializeApp();

exports.createChatgptTask = onRequest(
  { region: "asia-northeast3", timeoutSeconds: 20, maxInstances: 3, cors: false },
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
      return res.set("Allow", "POST").status(405).json({ error: "method_not_allowed" });
    }
    if (!req.is("application/json")) {
      return res.status(415).json({ error: "application/json required" });
    }

    const match = /^Bearer\s+([^\s]+)$/i.exec(req.get("authorization") || "");
    if (!match) {
      return res.status(401).json({ error: "firebase_id_token_required" });
    }
    let uid;
    try {
      const verified = await getAuth().verifyIdToken(match[1], true);
      uid = verified.uid;
      if (!uid) throw new Error("Missing Firebase user identity");
    } catch (error) {
      return res.status(401).json({ error: "invalid_or_revoked_firebase_id_token" });
    }

    let payload;
    try {
      if (Buffer.byteLength(JSON.stringify(req.body || {}), "utf8") > 8192) {
        return res.status(413).json({ error: "payload_too_large" });
      }
      payload = normalizeTask(req.body);
    } catch (error) {
      return res.status(error.status || 400).json({ error: "invalid_task", message: error.message });
    }

    // Client may reuse the same Idempotency-Key on retries to prevent duplicates.
    const requestKey = req.get("Idempotency-Key");
    if (requestKey && (requestKey.length > 128 || !/^[A-Za-z0-9_.:-]+$/.test(requestKey))) {
      return res.status(400).json({ error: "invalid_idempotency_key" });
    }
    const tasks = getFirestore().collection("users").doc(uid).collection("chatgptTasks");
    const ref = requestKey
      ? tasks.doc(createHash("sha256").update(requestKey).digest("hex"))
      : tasks.doc();

    try {
      await ref.create({ ...payload, createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ ok: true, taskId: ref.id, task: payload });
    } catch (error) {
      if (error.code === 6 || error.code === "already-exists") {
        // A retry does not overwrite the previous task.
        return res.status(409).json({ error: "already_created", taskId: ref.id });
      }
      console.error("Failed to create ChatGPT task", error);
      return res.status(500).json({ error: "task_save_failed" });
    }
  }
);
