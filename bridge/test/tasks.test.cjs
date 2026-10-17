"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseTask, firestoreFields } = require("../lib/validation");
const { handle } = require("../api/tasks");

function mockResponse() {
  return {
    code: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const request = (body, headers = {}) => ({
  method: "POST",
  body,
  headers: {
    "content-type": "application/json",
    authorization: "Bearer VALID_TEST_TOKEN",
    "idempotency-key": "test-request-1",
    ...headers,
  },
});

test("normalizes tasks and creates exactly the Firestore fields expected", () => {
  const task = parseTask({ title: " 사진 보정 ", date: "2026-10-18", time: "15:00" });
  assert.equal(task.title, "사진 보정");
  assert.equal(task.source, "chatgpt");
  assert.equal(task.done, false);
  const fields = firestoreFields(task, "2026-10-17T10:00:00.000Z");
  assert.deepEqual(fields.date, { stringValue: "2026-10-18" });
  assert.deepEqual(fields.done, { booleanValue: false });
  assert.ok(fields.createdAt.timestampValue);
});

test("rejects impossible dates and invalid categories", () => {
  assert.throws(() => parseTask({ title: "x", date: "2026-02-30" }));
  assert.throws(() => parseTask({ title: "x", date: "2026-10-18", category: "other" }));
});

test("does not request Firestore unless Firebase verifies the token", async () => {
  const calls = [];
  const res = mockResponse();
  await handle(request({ title: "x", date: "2026-10-18" }), res, async (url) => {
    calls.push(url);
    return { ok: false, status: 401 };
  });
  assert.equal(res.code, 401);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes("accounts:lookup"));
});

test("creates only new chatgptTasks documents under verified account", async () => {
  const calls = [];
  const res = mockResponse();
  await handle(request({ title: "x", date: "2026-10-18" }), res, async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("accounts:lookup")) {
      return { ok: true, json: async () => ({ users: [{ localId: "auth-user-123" }] }) };
    }
    return { ok: true, status: 200 };
  });
  assert.equal(res.code, 201);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/users\/auth-user-123\/chatgptTasks\?documentId=/);
  assert.equal(calls[1].opts.method, "POST");
  assert.equal(calls[1].opts.headers.Authorization, "Bearer VALID_TEST_TOKEN");
  assert.ok(!calls[1].url.includes("/documents/users/auth-user-123?"));
  const data = JSON.parse(calls[1].opts.body);
  assert.ok(!Object.hasOwn(data.fields, "notes"));
  assert.ok(!Object.hasOwn(data.fields, "worklist"));
  assert.ok(!Object.hasOwn(data.fields, "tasks"));
});

test("server returns permission error without retrying a forbidden write", async () => {
  const res = mockResponse();
  await handle(request({ title: "x", date: "2026-10-18" }), res, async (url) => {
    if (url.includes("accounts:lookup")) {
      return { ok: true, json: async () => ({ users: [{ localId: "u" }] }) };
    }
    return { ok: false, status: 403 };
  });
  assert.equal(res.code, 403);
  assert.equal(res.body.error, "firestore_rule_denied");
});
