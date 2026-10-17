"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTask } = require("../validation");

test("valid task is normalized without changing existing user data", () => {
  assert.deepEqual(
    normalizeTask({ title: "  사진 보정  ", date: "2026-10-18", time: "15:00", category: "업무" }),
    { title: "사진 보정", date: "2026-10-18", time: "15:00", category: "업무", detail: "", done: false, source: "chatgpt" }
  );
});

test("time and category can use safe defaults", () => {
  const task = normalizeTask({ title: "산책", date: "2026-11-01" });
  assert.equal(task.time, null);
  assert.equal(task.category, "업무");
});

test("invalid dates, time and categories are rejected", () => {
  assert.throws(() => normalizeTask({ title: "x", date: "2026-02-30" }));
  assert.throws(() => normalizeTask({ title: "x", date: "2026-10-18", time: "25:00" }));
  assert.throws(() => normalizeTask({ title: "x", date: "2026-10-18", category: "unknown" }));
});

test("non-text and oversized titles are rejected", () => {
  assert.throws(() => normalizeTask({ title: "", date: "2026-10-18" }));
  assert.throws(() => normalizeTask({ title: 22, date: "2026-10-18" }));
  assert.throws(() => normalizeTask({ title: "x".repeat(161), date: "2026-10-18" }));
});

test("details must be text within 2000 characters", () => {
  assert.throws(() => normalizeTask({ title: "x", date: "2026-10-18", detail: "x".repeat(2001) }));
});
