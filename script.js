const STORAGE_KEY = "haliljang-tasks";

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

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [
    { id: 1, title: "우유랑 계란 사기", time: "09:00", category: "개인", done: true },
    { id: 2, title: "발표자료 마무리하기", time: null, category: "업무", done: false },
    { id: 3, title: "병원 예약", time: "14:00", category: "개인", done: false },
    { id: 4, title: "책 서른 페이지 읽기", time: null, category: "개인성장", done: false },
  ];
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

let tasks = loadTasks();

function periodOf(time) {
  if (!time) return "none";
  const hour = parseInt(time.split(":")[0], 10);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

const PERIOD_LABEL = { none: "시간 미정", morning: "오전", afternoon: "오후", evening: "저녁" };
const PERIOD_ORDER = ["none", "morning", "afternoon", "evening"];

function renderDate() {
  const today = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const label = `${today.getMonth() + 1}월 ${today.getDate()}일, ${days[today.getDay()]}요일`;
  document.getElementById("todayDate").textContent = label;
}

function render() {
  const container = document.getElementById("listSections");
  const emptyState = document.getElementById("emptyState");
  container.innerHTML = "";

  if (tasks.length === 0) {
    emptyState.hidden = false;
    document.getElementById("taskCountLabel").textContent = "오늘 할 일이 없어요";
  } else {
    emptyState.hidden = true;
    document.getElementById("taskCountLabel").textContent = `오늘 할 일 ${tasks.length}가지`;
  }

  const grouped = {};
  for (const p of PERIOD_ORDER) grouped[p] = [];
  for (const t of tasks) grouped[periodOf(t.time)].push(t);
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
      section.appendChild(renderTaskRow(task));
    }
    container.appendChild(section);
  }

  const doneCount = tasks.filter((t) => t.done).length;
  document.getElementById("progressValue").textContent = `${doneCount} / ${tasks.length}`;

  const encourage = document.getElementById("encourageText");
  if (tasks.length === 0) {
    encourage.textContent = "오늘은 마음 편히 쉬어도 좋아요.";
  } else if (doneCount === tasks.length) {
    encourage.textContent = "오늘 할 일을 모두 끝냈어요. 수고했어요.";
  } else {
    encourage.textContent = "잘하고 있어요. 하나씩 지워가는 재미로 오늘도.";
  }
}

function renderTaskRow(task) {
  const row = document.createElement("div");
  row.className = "task-row";

  const time = document.createElement("span");
  time.className = "task-time";
  time.textContent = task.time || "";
  row.appendChild(time);

  const checkbox = document.createElement("button");
  checkbox.type = "button";
  checkbox.className = "checkbox" + (task.done ? " done" : "");
  checkbox.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  checkbox.addEventListener("click", () => toggleDone(task.id));
  row.appendChild(checkbox);

  const title = document.createElement("span");
  title.className = "task-title" + (task.done ? " done" : "");
  title.textContent = task.title;
  title.addEventListener("click", () => toggleDone(task.id));
  row.appendChild(title);

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
    });
    saveTasks();
    render();

    titleInput.value = "";
    timeToggle.checked = false;
    timeField.hidden = true;
    titleInput.focus();
  });

  titleInputLiveClearError();
}

function titleInputLiveClearError() {
  const titleInput = document.getElementById("titleInput");
  const titleError = document.getElementById("titleError");
  titleInput.addEventListener("input", () => {
    if (titleInput.value.trim()) titleError.hidden = true;
  });
}

renderDate();
render();
setupForm();
