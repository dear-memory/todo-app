import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { normalizeTask } from "../src/index.mjs";

const env = {
  GPT_ACTION_KEY: "test-key-not-real",
  FIREBASE_BOT_EMAIL: "bot@example.test",
  FIREBASE_BOT_PASSWORD: "local-test-password",
  FIREBASE_BOT_UID: "testBotUser123",
  FIREBASE_TARGET_UID: "testRealUser123",
};
const origFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = origFetch; });

function request(data, auth = "Bearer test-key-not-real") {
  return new Request("https://test.example/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: auth,
    },
    body: JSON.stringify(data),
  });
}

const validTask = {
  title: "오늘 오후 3시 약속",
  date: "2026-10-17",
  time: "15:00",
  category: "개인",
  detail: "",
  requestId: "unit-test-123",
};

test("rejects impossible dates and unknown categories", () => {
  assert.throws(() => normalizeTask({ ...validTask, date: "2026-02-30" }));
  assert.throws(() => normalizeTask({ ...validTask, category: "관리자" }));
  assert.throws(() => normalizeTask({ ...validTask, time: "31:20" }));
});

test("missing or wrong API secret results in no network request", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw Error("must not connect"); };
  const result = await worker.fetch(request(validTask, "Bearer wrong"), env);
  assert.equal(result.status, 401);
  assert.equal(called, false);
});

test("bot UID mismatch cannot write", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ idToken: "fake-test-id-token", localId: "wrong-user" }), { status: 200 });
  };
  const result = await worker.fetch(request(validTask), env);
  assert.equal(result.status, 503);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /accounts:signInWithPassword/);
});

test("creates only users/{owner}/chatgptTasks/{newId}", async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("accounts:signInWithPassword")) {
      return new Response(JSON.stringify({ idToken: "fake-test-id-token", localId: env.FIREBASE_BOT_UID }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  };
  const result = await worker.fetch(request(validTask), env);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).saved, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].opts.method, "POST");
  assert.match(calls[1].url, /\/documents\/users\/testRealUser123\/chatgptTasks\?documentId=gpt-/);
  assert.equal(calls[1].opts.headers.authorization, "Bearer fake-test-id-token");
  assert.ok(!calls[1].url.includes("/bookings/"));
  const data = JSON.parse(calls[1].opts.body);
  assert.equal(data.fields.title.stringValue, validTask.title);
  assert.equal(data.fields.done.booleanValue, false);
  assert.equal(data.fields.source.stringValue, "chatgpt");
  for (const key of ["tasks", "worklist", "notes"]) assert.ok(!(key in data.fields));
});

test("Firestore denied -> never falsely reports saved", async () => {
  globalThis.fetch = async (url) => {
    if (url.includes("accounts:signInWithPassword")) {
      return new Response(JSON.stringify({ idToken: "fake", localId: env.FIREBASE_BOT_UID }), { status: 200 });
    }
    return new Response(JSON.stringify({error:{code:403}}), {status:403});
  };
  const result = await worker.fetch(request(validTask), env);
  assert.equal(result.status, 403);
  assert.equal((await result.json()).saved, undefined);
});

test("requestId retries use stable document ID", async () => {
  const urls = [];
  globalThis.fetch = async (url) => {
    if (url.includes("accounts:signInWithPassword")) {
      return new Response(JSON.stringify({ idToken: "fake", localId: env.FIREBASE_BOT_UID }), { status: 200 });
    }
    urls.push(url);
    return new Response("{}", { status: 409 });
  };
  const a = await worker.fetch(request(validTask), env);
  const b = await worker.fetch(request(validTask), env);
  assert.equal(a.status, 200);
  assert.equal((await a.json()).alreadySaved, true);
  assert.equal(urls[0], urls[1]);
  assert.equal(b.status, 200);
});
