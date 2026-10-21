import test from "node:test";
import assert from "node:assert/strict";
import { tasksForDate, taskOriginDate } from "../carryover.mjs";

const today = "2026-10-19";
const tasks = [
  { id: 1, date: "2026-10-17", done: false, detail: "보존할 메모" },
  { id: 2, date: "2026-10-17", done: true },
  { id: 3, date: "2026-10-18", done: false },
  { id: 4, date: "2026-10-19", done: false },
  { id: 5, date: "2026-10-19", done: true },
  { id: 6, date: "2026-10-20", done: false },
  { id: 7, date: "2026-10-18", done: false, rolledFrom: "2026-10-15" },
];

test("today projects old unfinished tasks once without altering original records", () => {
  const before = JSON.stringify(tasks);
  const result = tasksForDate(tasks, today, today);
  assert.deepEqual(result.map(t => t.id), [1, 3, 4, 5, 7]);
  assert.equal(result[0], tasks[0]);
  assert.equal(JSON.stringify(tasks), before);
  assert.equal(taskOriginDate(result[0], today, today), "2026-10-17");
  assert.equal(taskOriginDate(tasks[6], today, today), "2026-10-15");
});

test("past/future dates show only their own tasks", () => {
  assert.deepEqual(tasksForDate(tasks, "2026-10-17", today).map(t => t.id), [1, 2]);
  assert.deepEqual(tasksForDate(tasks, "2026-10-20", today).map(t => t.id), [6]);
});

test("completed overdue tasks stop showing today but remain in history", () => {
  tasks[0].done = true;
  assert.ok(!tasksForDate(tasks, today, today).includes(tasks[0]));
  assert.ok(tasksForDate(tasks, "2026-10-17", today).includes(tasks[0]));
  tasks[0].done = false;
});

test("checking off an overdue task keeps it struck through on the completion day", () => {
  const item = { id: 8, date: "2026-10-17", done: false, title: "완료 테스트" };
  assert.deepEqual(tasksForDate([item], today, today), [item]);

  // The checkbox handler stores the completion date without changing the task date.
  item.done = true;
  item.completedOn = today;
  assert.deepEqual(tasksForDate([item], today, today), [item]);
  assert.equal(taskOriginDate(item, today, today), "2026-10-17");
  assert.deepEqual(tasksForDate([item], "2026-10-20", "2026-10-20"), []);
  assert.deepEqual(tasksForDate([item], "2026-10-17", today), [item]);

  item.done = false;
  delete item.completedOn;
  assert.deepEqual(tasksForDate([item], today, today), [item]);
});

test("completed ChatGPT collection tasks follow the same visibility rule", () => {
  const item = { id: "cloud-task", date: "2026-10-18", done: true,
    completedOn: today, _chatgpt: true };
  assert.deepEqual(tasksForDate([item], today, today), [item]);
  assert.deepEqual(tasksForDate([item], "2026-10-20", "2026-10-20"), []);
});

test("next day includes past-due unfinished tasks and today's entries", () => {
  assert.deepEqual(tasksForDate(tasks, "2026-10-20", "2026-10-20").map(t => t.id), [1, 3, 4, 6, 7]);
  assert.equal(tasks[0].date, "2026-10-17");
});

test("ChatGPT tasks participate without modifying subcollection", () => {
  const t = { id: "firestore-id", date: "2026-10-17", done: false, _chatgpt: true };
  assert.deepEqual(tasksForDate([t], today, today), [t]);
});
