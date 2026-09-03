const STORAGE_KEY = "haliljang-tasks";
const NOTES_KEY = "haliljang-notes";
const WORKLIST_KEY = "haliljang-worklist";

const CATEGORY_BG = {
  "업무": "var(--work-bg)",
  "개인": "var(--personal-bg)",
  "운동": "var(--exercise-bg)",
  "개인성장": "var(--growth-bg)",
};
const CATEGORY_FG = {
  "업무": "var(--work)",
  "개인": "var(--personal)",
  "운동": "var(--exercise)",
  "개인성장": "var(--growth)",
};

const ICONS = {
  none: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></svg>',
  morning: '<svg class="icon" viewBox="0 0 24 24"><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.2" y1="10.2" x2="5.6" y2="11.6"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.4" y1="11.6" x2="19.8" y2="10.2"/><line x1="1" y1="22" x2="23" y2="22"/></svg>',
  afternoon: '<svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>',
  evening: '<svg class="icon" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let currentDate = todayStr();

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  const t = todayStr();
  return [
    { id: 1, title: "우유랑 계란 사기", time: "09:00", category: "개인", done: true, date: t },
    { id: 2, title: "발표자료 마무리하기", time: null, category: "업무", done: false, date: t },
    { id: 3, title: "병원 예약", time: "14:00", category: "개인", done: false, date: t },
    { id: 4, title: "책 서른 페이지 읽기", time: null, category: "개인성장", done: false, date: t },
  ];
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

let tasks = loadTasks();
// 이전 버전 데이터 호환: date 필드가 없는 항목은 오늘 날짜로 채움
tasks.forEach((t) => { if (!t.date) t.date = todayStr(); });

function periodOf(time) {
  if (!time) return "none";
  const hour = parseInt(time.split(":")[0], 10);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

const PERIOD_LABEL = { none: "시간 미정", morning: "오전", afternoon: "오후", evening: "저녁" };
const PERIOD_ORDER = ["none", "morning", "afternoon", "evening"];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const isToday = dateStr === todayStr();
  return `${m}월 ${d}일, ${days[dateObj.getDay()]}요일${isToday ? " · 오늘" : ""}`;
}

function renderDate() {
  document.getElementById("todayDate").textContent = formatDateLabel(currentDate);
  document.getElementById("datePicker").value = currentDate;
}

function shiftDate(days) {
  const [y, m, d] = currentDate.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + days);
  const ny = dateObj.getFullYear();
  const nm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const nd = String(dateObj.getDate()).padStart(2, "0");
  currentDate = `${ny}-${nm}-${nd}`;
  renderDate();
  render();
}

let expandedIds = new Set();

function render() {
  const container = document.getElementById("listSections");
  const emptyState = document.getElementById("emptyState");
  container.innerHTML = "";

  const dayTasks = tasks.filter((t) => t.date === currentDate);

  if (dayTasks.length === 0) {
    emptyState.hidden = false;
    document.getElementById("taskCountLabel").textContent = "이 날짜엔 할 일이 없어요";
  } else {
    emptyState.hidden = true;
    document.getElementById("taskCountLabel").textContent = `할 일 ${dayTasks.length}가지`;
  }

  const grouped = {};
  for (const p of PERIOD_ORDER) grouped[p] = [];
  for (const t of dayTasks) grouped[periodOf(t.time)].push(t);
  for (const p of PERIOD_ORDER) grouped[p].sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  for (const period of PERIOD_ORDER) {
    const list = grouped[period];
    if (list.length === 0) continue;

    const section = document.createElement("div");
    section.className = "time-group";

    const label = document.createElement("p");
    label.className = "time-group-label";
    label.innerHTML = `${ICONS[period]}<span>${PERIOD_LABEL[period]}</span>`;
    section.appendChild(label);

    for (const task of list) {
      section.appendChild(renderTaskItem(task));
    }
    container.appendChild(section);
  }

  const doneCount = dayTasks.filter((t) => t.done).length;
  document.getElementById("progressValue").textContent = `${doneCount} / ${dayTasks.length}`;

  const encourage = document.getElementById("encourageText");
  if (dayTasks.length === 0) {
    encourage.textContent = "이 날짜는 마음 편히 비워두어도 좋아요.";
  } else if (doneCount === dayTasks.length) {
    encourage.textContent = "할 일을 모두 끝냈어요. 수고했어요.";
  } else {
    encourage.textContent = "잘하고 있어요. 하나씩 지워가는 재미로 오늘도.";
  }
}

function renderTaskItem(task) {
  const wrapper = document.createElement("div");
  const isExpanded = expandedIds.has(task.id);

  wrapper.appendChild(renderTaskRow(task, isExpanded));

  if (isExpanded) {
    const detail = document.createElement("div");
    detail.className = "task-detail";
    const textarea = document.createElement("textarea");
    textarea.placeholder = "세부 내용을 적어보세요.";
    textarea.value = task.detail || "";
    textarea.addEventListener("input", () => {
      task.detail = textarea.value;
      saveTasks();
    });
    detail.appendChild(textarea);
    wrapper.appendChild(detail);
  }

  return wrapper;
}

function renderTaskRow(task, isExpanded) {
  const row = document.createElement("div");
  row.className = "task-row";

  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = task.time || "";
  row.appendChild(time);

  const checkbox = document.createElement("button");
  checkbox.type = "button";
  checkbox.className = "checkbox" + (task.done ? " done" : "");
  checkbox.setAttribute("aria-label", task.done ? "완료 취소" : "완료 처리");
  checkbox.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  checkbox.addEventListener("click", () => toggleDone(task.id));
  row.appendChild(checkbox);

  const title = document.createElement("span");
  title.className = "task-title task-title-clickable" + (task.done ? " done" : "");
  title.textContent = task.title;
  title.addEventListener("click", () => toggleExpanded(task.id));
  row.appendChild(title);

  const chevron = document.createElement("span");
  chevron.className = "task-chevron" + (isExpanded ? " expanded" : "");
  chevron.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  chevron.addEventListener("click", () => toggleExpanded(task.id));
  row.appendChild(chevron);

  const tag = document.createElement("span");
  tag.className = "task-tag";
  tag.textContent = task.category;
  tag.style.background = CATEGORY_BG[task.category];
  tag.style.color = CATEGORY_FG[task.category];
  row.appendChild(tag);

  const del = document.createElement("button");
  del.type = "button";
  del.className = "task-delete";
  del.setAttribute("aria-label", "삭제");
  del.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  del.addEventListener("click", () => deleteTask(task.id));
  row.appendChild(del);

  return row;
}

function toggleExpanded(id) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id);
  } else {
    expandedIds.add(id);
  }
  render();
}

function toggleDone(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) task.done = !task.done;
  saveTasks();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
}

let selectedCategory = "업무";

function setupDateNav() {
  document.getElementById("prevDayBtn").addEventListener("click", () => shiftDate(-1));
  document.getElementById("nextDayBtn").addEventListener("click", () => shiftDate(1));
  document.getElementById("todayBtn").addEventListener("click", () => {
    currentDate = todayStr();
    renderDate();
    render();
  });
  document.getElementById("datePicker").addEventListener("change", (e) => {
    if (e.target.value) {
      currentDate = e.target.value;
      renderDate();
      render();
    }
  });
}

function setupForm() {
  const timeToggle = document.getElementById("timeToggle");
  const timeField = document.getElementById("timeField");
  timeToggle.addEventListener("change", () => {
    timeField.hidden = !timeToggle.checked;
  });

  const chips = document.querySelectorAll(".chip");
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      selectedCategory = chip.dataset.category;
    });
  });

  document.getElementById("addForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const titleInput = document.getElementById("titleInput");
    const titleError = document.getElementById("titleError");
    const title = titleInput.value.trim();

    if (!title) {
      titleError.hidden = false;
      titleInput.focus();
      return;
    }
    titleError.hidden = true;

    const time = timeToggle.checked ? document.getElementById("timeInput").value : null;

    tasks.push({
      id: Date.now(),
      title,
      time,
      category: selectedCategory,
      done: false,
      date: currentDate,
    });
    saveTasks();
    render();

    titleInput.value = "";
    timeToggle.checked = false;
    timeField.hidden = true;
    titleInput.focus();
  });

  const titleInput = document.getElementById("titleInput");
  const titleError = document.getElementById("titleError");
  titleInput.addEventListener("input", () => {
    if (titleInput.value.trim()) titleError.hidden = true;
  });
}

function setupNav() {
  const navItems = document.querySelectorAll(".nav-item");
  const views = {
    today: document.getElementById("view-today"),
    week: document.getElementById("view-week"),
    worklist: document.getElementById("view-worklist"),
    notes: document.getElementById("view-notes"),
  };
  const sidePanel = document.getElementById("sidePanel");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      navItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");

      const target = item.dataset.view;
      Object.keys(views).forEach((key) => {
        views[key].hidden = key !== target;
      });

      sidePanel.hidden = target !== "today";
    });
  });
}

function setupNotes() {
  const notesArea = document.getElementById("notesArea");
  notesArea.value = localStorage.getItem(NOTES_KEY) || "";
  notesArea.addEventListener("input", () => {
    localStorage.setItem(NOTES_KEY, notesArea.value);
  });
}

function loadWorklist() {
  try {
    const raw = localStorage.getItem(WORKLIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveWorklist() {
  localStorage.setItem(WORKLIST_KEY, JSON.stringify(worklist));
}

let worklist = loadWorklist();

function renderWorklist() {
  const container = document.getElementById("worklistItems");
  const empty = document.getElementById("worklistEmpty");
  container.innerHTML = "";

  empty.hidden = worklist.length !== 0;

  worklist.forEach((item) => {
    const row = document.createElement("div");
    row.className = "worklist-row";

    const checkbox = document.createElement("button");
    checkbox.type = "button";
    checkbox.className = "checkbox" + (item.done ? " done" : "");
    checkbox.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    checkbox.addEventListener("click", () => {
      item.done = !item.done;
      saveWorklist();
      renderWorklist();
    });
    row.appendChild(checkbox);

    const title = document.createElement("span");
    title.className = "task-title" + (item.done ? " done" : "");
    title.style.flex = "1";
    title.textContent = item.title;
    title.addEventListener("click", () => {
      item.done = !item.done;
      saveWorklist();
      renderWorklist();
    });
    row.appendChild(title);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "task-delete";
    del.setAttribute("aria-label", "삭제");
    del.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.addEventListener("click", () => {
      worklist = worklist.filter((w) => w.id !== item.id);
      saveWorklist();
      renderWorklist();
    });
    row.appendChild(del);

    container.appendChild(row);
  });
}

function setupWorklist() {
  document.getElementById("worklistForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("worklistInput");
    const error = document.getElementById("worklistError");
    const title = input.value.trim();

    if (!title) {
      error.hidden = false;
      input.focus();
      return;
    }
    error.hidden = true;

    worklist.push({ id: Date.now(), title, done: false });
    saveWorklist();
    renderWorklist();

    input.value = "";
    input.focus();
  });

  const input = document.getElementById("worklistInput");
  const error = document.getElementById("worklistError");
  input.addEventListener("input", () => {
    if (input.value.trim()) error.hidden = true;
  });
}

renderDate();
render();
setupForm();
setupNav();
setupNotes();
setupDateNav();
setupWorklist();
renderWorklist();
