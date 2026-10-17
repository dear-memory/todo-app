"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

const now = new Date("2026-10-17T02:00:00Z"); // 11:00 Asia/Seoul

test("Korean voice: tomorrow 3 pm photo editing", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  assert.deepEqual(parseSpoken("할일장에 내일 오후 3시 사진 보정 추가해줘", now), {
    title: "사진 보정", date: "2026-10-18", time: "15:00", category: "업무", detail: "",
  });
});

test("Korean voice: no specific time defaults to today", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  const result = parseSpoken("오늘 촬영 파일 백업 저장해줘", now);
  assert.equal(result.date, "2026-10-17");
  assert.equal(result.time, null);
  assert.equal(result.title, "촬영 파일 백업");
});

test("Korean voice: half hour and coming year", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  const result = parseSpoken("1월 7일 오전 9시 반 스튜디오 정리", now);
  assert.equal(result.date, "2027-01-07");
  assert.equal(result.time, "09:30");
});

test("rejects empty tasks", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  assert.throws(() => parseSpoken("", now));
});

test("Korean voice: postpositions after dates and times are removed", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  const result = parseSpoken("할일장에 오늘 오후 3시에 강남에서 약속 저장해 줘", now);
  assert.deepEqual(result, {
    title: "강남에서 약속", date: "2026-10-17", time: "15:00", category: "업무", detail: "",
  });
});

test("Korean voice: tomorrow at 3 with particle", async () => {
  const { parseSpoken } = await import("../parser.mjs");
  const result = parseSpoken("내일 3시에 약속 저장해줘", now);
  assert.equal(result.title, "약속");
  assert.equal(result.date, "2026-10-18");
  assert.equal(result.time, "03:00");
});
