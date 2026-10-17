"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("snapshot signatures detect remote list and note changes", async () => {
  const { stateSignature } = await import("../storage-safety.mjs");
  const base = { tasks: [{ id: 1, title: "old" }], worklist: [], notes: "original", updatedAt: 5 };
  assert.notEqual(stateSignature(base),
    stateSignature({ ...base, notes: "changed" }));
  assert.notEqual(stateSignature(base),
    stateSignature({ ...base, tasks: [] }));
  assert.notEqual(stateSignature(base),
    stateSignature({ ...base, updatedAt: 6 }));
});

test("snapshot signatures normalize legacy missing fields", async () => {
  const { stateSignature } = await import("../storage-safety.mjs");
  assert.equal(stateSignature({}), stateSignature({ tasks: [], worklist: [], notes: "", updatedAt: null }));
});

test("malformed existing data must not be considered safe", async () => {
  const { validUserDocument } = await import("../storage-safety.mjs");
  assert.equal(validUserDocument({ tasks: [], worklist: [], notes: "hello" }), true);
  assert.equal(validUserDocument({ tasks: "corrupted" }), false);
  assert.equal(validUserDocument({ worklist: {} }), false);
  assert.equal(validUserDocument(null), false);
});
