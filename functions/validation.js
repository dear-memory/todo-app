"use strict";

const CATEGORIES = new Set(["업무", "개인", "운동", "개인성장"]);

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizeTask(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalid("할 일 입력은 JSON 객체여야 합니다.");
  }
  const { title, date, time = null, category = "업무", detail = "" } = input;
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160) {
    throw invalid("할 일 제목은 1~160자여야 합니다.");
  }
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw invalid("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const parsed = new Date(date + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw invalid("존재하지 않는 날짜입니다.");
  }
  if (time !== null && (typeof time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    throw invalid("시간은 HH:mm 형식 또는 null이어야 합니다.");
  }
  if (!CATEGORIES.has(category)) throw invalid("지원하지 않는 카테고리입니다.");
  if (typeof detail !== "string" || detail.length > 2000) {
    throw invalid("상세 내용은 2000자 이하여야 합니다.");
  }
  return {
    title: title.trim(),
    date,
    time,
    category,
    detail,
    done: false,
    source: "chatgpt",
  };
}

module.exports = { normalizeTask };
