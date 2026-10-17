// Voice transcript -> simple Korean task data. Pure functions for offline tests.
const DAY = 86400000;

function seoulToday(now = new Date()) {
  // Extract calendar parts in Korea even when the caller is in a different timezone.
  const fields = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const p = Object.fromEntries(fields.map((v) => [v.type, v.value]));
  return p.year + "-" + p.month + "-" + p.day;
}

function plusDays(date, days) {
  const d = new Date(date + "T00:00:00Z");
  d.setTime(d.getTime() + days * DAY);
  return d.toISOString().slice(0, 10);
}

function parseSpoken(text, now = new Date()) {
  let title = String(text || "").trim();
  if (!title) throw new Error("할 일을 말하거나 입력해 주세요.");

  let date = seoulToday(now);
  const start = date;
  const fullDate = title.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일(?:에)?/);
  const monthDay = !fullDate && title.match(/(\d{1,2})월\s*(\d{1,2})일(?:에)?/);
  const relative = title.match(/(오늘|내일|모레|글피)(?:에)?/);
  let dateExpr = null;
  if (fullDate || monthDay) {
    dateExpr = fullDate || monthDay;
    const year = fullDate ? Number(fullDate[1]) : Number(start.slice(0, 4));
    const month = Number(fullDate ? fullDate[2] : monthDay[1]);
    const day = Number(fullDate ? fullDate[3] : monthDay[2]);
    let y = year;
    let target = new Date(Date.UTC(y, month - 1, day));
    if (target.getUTCFullYear() !== y || target.getUTCMonth() !== month - 1 || target.getUTCDate() !== day) {
      throw new Error("날짜를 다시 확인해 주세요.");
    }
    if (!fullDate && target.toISOString().slice(0, 10) < start) y++;
    date = String(y).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0");
  } else if (relative) {
    dateExpr = relative;
    date = plusDays(start, { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[relative[1]]);
  }

  let time = null;
  const timeExpr = title.match(/(오전|오후)?\s*(\d{1,2})시\s*(?:(반)|(\d{1,2})분)?(?:에)?/);
  if (timeExpr) {
    const hour = Number(timeExpr[2]), minute = timeExpr[3] ? 30 : Number(timeExpr[4] || 0);
    if (hour > 23 || minute > 59 || (timeExpr[1] && (hour < 1 || hour > 12))) {
      throw new Error("시간을 다시 확인해 주세요.");
    }
    const h = timeExpr[1] === "오후" ? (hour % 12) + 12 :
      timeExpr[1] === "오전" ? hour % 12 : hour;
    time = String(h).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  }

  if (dateExpr) title = title.replace(dateExpr[0], " ");
  if (timeExpr) title = title.replace(timeExpr[0], " ");
  title = title.replace(/^(?:할일장에|할일장|할 일장에|할 일장|할 일|해야 할 일)\s*/, "")
    .replace(/(?:추가해\s*줘|저장해\s*줘|기록해\s*줘|등록해\s*줘|추가하기|추가|저장|기록|등록)[.!?\s]*$/i, "")
    .replace(/\s+/g, " ").trim();
  if (!title) throw new Error("할 일 제목을 인식하지 못했습니다.");
  return { title, date, time, category: "업무", detail: "" };
}

export { parseSpoken, seoulToday };
