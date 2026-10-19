import { firebaseConfig } from "./app-config.js";
import { parseSpoken } from "./bridge/parser.mjs";
import { stateSignature, validUserDocument } from "./storage-safety.mjs?v=2";
import { tasksForDate, taskOriginDate } from "./carryover.mjs?v=1";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDocFromServer,
  runTransaction,
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

const PERIOD_LABEL = { none: "시간 미정", morning: "오전", afternoon: "오후", evening: "저녁" };
const PERIOD_ORDER = ["none", "morning", "afternoon", "evening"];

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let currentDate = todayStr();
let currentUser = null;
let tasks = [];
let worklist = [];
// ChatGPT 항목은 별도의 하위 컬렉션에 보관하며 기존 tasks 배열은 건드리지 않습니다.
let chatgptTasks = [];
let stopChatgptTaskSync = null;
let expandedIds = new Set();
let selectedCategory = "업무";
let saveTimer = null;
let isDataReady = false;
let saveBlocked = false;
let loadedSignature = null;
let lastLoadedTime = null;
let saving = false;
let pendingChanges = 0;
let savedRevision = 0;
let authGeneration = 0;

// ---------- Firestore 안전 동기화 ----------
// Fail closed: users/{uid} is NEVER rewritten unless its current contents were
// read successfully and are still identical to the last verified snapshot.
function setSyncWarning(message) {
  const note = document.getElementById("syncNote");
  if (!note) return;
  note.textContent = message;
  note.hidden = !message;
}

function scheduleSave() {
  if (!currentUser || !isDataReady || saveBlocked) {
    setSyncWarning("데이터가 완전히 로드되지 않았거나 충돌이 발견되어 저장이 차단됐습니다. 새로고침하여 확인해 주세요.");
    return;
  }
  pendingChanges++;
  setSyncWarning("저장 중...");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFirestore, 500);
}

async function saveToFirestore() {
  if (!currentUser || !isDataReady || saveBlocked || saving) return;
  const uid = currentUser.uid;
  const generation = authGeneration;
  const currentRevision = pendingChanges;
  const snapshotTasks = JSON.parse(JSON.stringify(tasks));
  const snapshotWorklist = JSON.parse(JSON.stringify(worklist));
  const snapshotNotes = document.getElementById("notesArea").value;
  const signatureAtStart = loadedSignature;
  const nextUpdatedAt = Math.max(
    Date.now(),
    (typeof lastLoadedTime === "number" ? lastLoadedTime : 0) + 1
  );
  saving = true;
  try {
    await runTransaction(db, async (transaction) => {
      if (authGeneration !== generation || currentUser?.uid !== uid || !isDataReady) {
        throw new Error("auth_changed");
      }
      const userRef = doc(db, "users", uid);
      const current = await transaction.get(userRef);
      if (!current.exists() || !validUserDocument(current.data()) ||
          stateSignature(current.data()) !== signatureAtStart) {
        throw new Error("remote_data_conflict");
      }
      // Use update (not setDoc) to avoid erasing unknown fields on the user document.
      // Only previously-loaded fields are changed, under a Firestore transaction.
      transaction.update(userRef, {
        tasks: snapshotTasks,
        worklist: snapshotWorklist,
        notes: snapshotNotes,
        updatedAt: nextUpdatedAt,
      });
    });
    if (authGeneration !== generation || currentUser?.uid !== uid) return;
    loadedSignature = stateSignature({
      tasks: snapshotTasks, worklist: snapshotWorklist,
      notes: snapshotNotes, updatedAt: nextUpdatedAt,
    });
    lastLoadedTime = nextUpdatedAt;
    savedRevision = currentRevision;
    setSyncWarning(pendingChanges > savedRevision ? "저장 중..." : "저장 완료");
  } catch (error) {
    if (authGeneration !== generation) return;
    console.error("안전 저장 차단:", error);
    saveBlocked = true;
    setSyncWarning("저장하지 않았습니다. 기존 데이터와 충돌하거나 연결이 끊겼습니다. 현재 내용을 복사해 보관하고 새로고침한 뒤 확인해 주세요.");
  } finally {
    saving = false;
    if (authGeneration === generation && !saveBlocked && pendingChanges > currentRevision) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveToFirestore, 100);
    }
  }
}

async function loadFromFirestore(uid) {
  // A real document is required; a missing/denied/offline read must never be
  // interpreted as an empty account and then saved over existing records.
  // Never trust a possibly stale cached copy as the baseline for future writes.
  const snap = await withTimeout(getDocFromServer(doc(db, "users", uid)), 12000);
  if (!snap.exists()) throw new Error("user_document_missing");
  const data = snap.data();
  if (!validUserDocument(data)) throw new Error("invalid_user_document");
  tasks = data.tasks ?? [];
  worklist = data.worklist ?? [];
  loadedSignature = stateSignature(data);
  lastLoadedTime = data.updatedAt ?? null;
  return data.notes ?? "";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// ---------- ChatGPT 전용 하위 컬렉션 (기존 사용자 문서 불변) ----------

function subscribeChatgptTasks(uid) {
  if (stopChatgptTaskSync) stopChatgptTaskSync();
  stopChatgptTaskSync = onSnapshot(
    collection(db, "users", uid, "chatgptTasks"),
    (snap) => {
      if (currentUser?.uid !== uid) return;
      chatgptTasks = snap.docs.map((entry) => ({
        ...entry.data(),
        id: entry.id,
        _chatgpt: true,
      }));
      render();
      if (!document.getElementById("view-week").hidden) renderWeek();
    },
    (error) => {
      console.error("ChatGPT 할 일 동기화 실패:", error);
      const note = document.getElementById("syncNote");
      if (note) {
        note.textContent = "ChatGPT 추가 항목을 불러오지 못했습니다. 연결을 확인해주세요.";
        note.hidden = false;
      }
    }
  );
}

async function updateChatgptTask(id, changes) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid, "chatgptTasks", id), changes);
  } catch (error) {
    console.error("ChatGPT 할 일 수정 실패:", error);
    alert("수정에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

async function deleteChatgptTask(id) {
  if (!currentUser) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "chatgptTasks", id));
  } catch (error) {
    console.error("ChatGPT 할 일 삭제 실패:", error);
    alert("삭제에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// ---------- 날짜/할 일 (오늘 화면) ----------

function periodOf(time) {
  if (!time) return "none";
  const hour = parseInt(time.split(":")[0], 10);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const isToday = dateStr === todayStr();
  return `${m}월 ${d}일, ${days[dateObj.getDay()]}요일${isToday ? " · 오늘" : ""}`;
}

function formatShortDate(dateStr) {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
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

function render() {
  const container = document.getElementById("listSections");
  const emptyState = document.getElementById("emptyState");
  container.innerHTML = "";

  const dayTasks = tasksForDate([...tasks, ...chatgptTasks], currentDate, todayStr());

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

let categoryMenuTaskId = null;

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
      if (task._chatgpt) updateChatgptTask(task.id, { detail: task.detail });
      else scheduleSave();
    });
    detail.appendChild(textarea);
    wrapper.appendChild(detail);
  }

  if (categoryMenuTaskId === task.id) {
    const menu = document.createElement("div");
    menu.className = "category-menu";
    CATEGORY_ORDER.forEach((cat) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "category-menu-option" + (cat === task.category ? " selected" : "");
      opt.textContent = cat;
      opt.style.background = CATEGORY_BG[cat];
      opt.style.color = CATEGORY_FG[cat];
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        task.category = cat;
        categoryMenuTaskId = null;
        if (task._chatgpt) updateChatgptTask(task.id, { category: cat });
        else scheduleSave();
        render();
      });
      menu.appendChild(opt);
    });
    wrapper.appendChild(menu);
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

  const originDate = taskOriginDate(task, currentDate, todayStr());
  if (originDate) {
    const rolled = document.createElement("span");
    rolled.className = "task-rolled-tag";
    rolled.title = `${formatShortDate(originDate)}에 등록된 미완료 할 일을 오늘도 표시하고 있어요`;
    rolled.textContent = `${formatShortDate(originDate)}부터`;
    row.appendChild(rolled);
  }

  const chevron = document.createElement("span");
  chevron.className = "task-chevron" + (isExpanded ? " expanded" : "");
  chevron.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  chevron.addEventListener("click", () => toggleExpanded(task.id));
  row.appendChild(chevron);

  const tag = document.createElement("button");
  tag.type = "button";
  tag.className = "task-tag";
  tag.textContent = task.category;
  tag.style.background = CATEGORY_BG[task.category];
  tag.style.color = CATEGORY_FG[task.category];
  tag.setAttribute("aria-label", "카테고리 변경");
  tag.addEventListener("click", (e) => {
    e.stopPropagation();
    categoryMenuTaskId = categoryMenuTaskId === task.id ? null : task.id;
    render();
  });
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

const CATEGORY_ORDER = ["업무", "개인", "운동", "개인성장"];

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
  if (task) {
    task.done = !task.done;
    scheduleSave();
    render();
    return;
  }
  const chatgptTask = chatgptTasks.find((t) => t.id === id);
  if (chatgptTask) updateChatgptTask(id, { done: !chatgptTask.done });
}

function deleteTask(id) {
  const chatgptTask = chatgptTasks.find((t) => t.id === id);
  if (chatgptTask) {
    deleteChatgptTask(id);
    return;
  }
  tasks = tasks.filter((t) => t.id !== id);
  scheduleSave();
  render();
}

// Automatic rollover was intentionally disabled to protect existing dates.

let dayWatcherStarted = false;

function startDayWatcher() {
  if (dayWatcherStarted) return;
  dayWatcherStarted = true;
  let lastKnownToday = todayStr();

  setInterval(() => {
    const nowToday = todayStr();
    if (nowToday === lastKnownToday) return;

    const wasOnToday = currentDate === lastKnownToday;
    lastKnownToday = nowToday;

    // Never move or rewrite previous records automatically at midnight.
    // Incomplete tasks keep their originally saved dates.
    if (wasOnToday) {
      currentDate = nowToday;
      renderDate();
      render();
    }

    if (!document.getElementById("view-week").hidden) {
      renderWeek();
    }
  }, 30000);
}

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
    scheduleSave();
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

// ---------- 이번 주 ----------

function getWeekDates() {
  const t = todayStr();
  const [y, m, d] = t.split("-").map(Number);
  const today = new Date(y, m - 1, d);
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    const ny = dt.getFullYear();
    const nm = String(dt.getMonth() + 1).padStart(2, "0");
    const nd = String(dt.getDate()).padStart(2, "0");
    dates.push(`${ny}-${nm}-${nd}`);
  }
  return dates;
}

function renderWeek() {
  const weekDates = getWeekDates();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const today = todayStr();

  const first = weekDates[0].split("-");
  const last = weekDates[6].split("-");
  document.getElementById(
    "weekRangeLabel"
  ).textContent = `${parseInt(first[1], 10)}월 ${parseInt(first[2], 10)}일 – ${parseInt(last[1], 10)}월 ${parseInt(last[2], 10)}일`;

  const grid = document.getElementById("weekGrid");
  grid.innerHTML = "";

  weekDates.forEach((dateStr, i) => {
    const [, m, d] = dateStr.split("-").map(Number);
    const dayTasks = tasksForDate([...tasks, ...chatgptTasks], dateStr, today)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const col = document.createElement("div");
    col.className = "week-day" + (dateStr === today ? " is-today" : "");
    col.addEventListener("click", (e) => {
      if (e.target.closest(".checkbox")) return;
      currentDate = dateStr;
      renderDate();
      render();
      document.querySelector('.nav-item[data-view="today"]').click();
    });

    const header = document.createElement("p");
    header.className = "week-day-header";
    header.textContent = `${m}/${d} (${days[i]})`;
    col.appendChild(header);

    if (dayTasks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "week-day-empty";
      empty.textContent = "할 일 없음";
      col.appendChild(empty);
    } else {
      dayTasks.forEach((task) => {
        const row = document.createElement("div");
        row.className = "week-task";

        const checkbox = document.createElement("button");
        checkbox.type = "button";
        checkbox.className = "checkbox" + (task.done ? " done" : "");
        checkbox.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
        checkbox.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleDone(task.id);
          renderWeek();
        });
        row.appendChild(checkbox);

        const title = document.createElement("span");
        title.className = "week-task-title" + (task.done ? " done" : "");
        title.textContent = task.title;
        row.appendChild(title);

        const originDate = taskOriginDate(task, dateStr, today);
        if (originDate) {
          const rolled = document.createElement("span");
          rolled.className = "task-rolled-tag";
          rolled.textContent = ` ${formatShortDate(originDate)}부터`;
          row.appendChild(rolled);
        }

        col.appendChild(row);
      });
    }

    grid.appendChild(col);
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

      if (target === "week") renderWeek();

      sidePanel.hidden = target !== "today";
    });
  });
}

function setupNotes() {
  const notesArea = document.getElementById("notesArea");
  notesArea.addEventListener("input", () => {
    scheduleSave();
  });
}

// ---------- 작업 목록 ----------

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
      scheduleSave();
      renderWorklist();
    });
    row.appendChild(checkbox);

    const title = document.createElement("span");
    title.className = "task-title" + (item.done ? " done" : "");
    title.style.flex = "1";
    title.textContent = item.title;
    title.addEventListener("click", () => {
      item.done = !item.done;
      scheduleSave();
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
      scheduleSave();
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
    scheduleSave();
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

// ---------- 로그인 / 회원가입 ----------

function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "이메일 형식이 올바르지 않아요.",
    "auth/user-not-found": "가입되지 않은 이메일이에요.",
    "auth/wrong-password": "비밀번호가 틀렸어요.",
    "auth/invalid-credential": "이메일 또는 비밀번호가 올바르지 않아요.",
    "auth/email-already-in-use": "이미 가입된 이메일이에요.",
    "auth/weak-password": "비밀번호는 6자 이상이어야 해요.",
    "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 시도해주세요.",
  };
  return map[code] || "문제가 발생했어요. 다시 시도해주세요.";
}

function setupAuth() {
  let mode = "login";
  const tabLogin = document.getElementById("tabLogin");
  const tabSignup = document.getElementById("tabSignup");
  const submitBtn = document.getElementById("authSubmitBtn");
  const authError = document.getElementById("authError");
  const authNote = document.getElementById("authNote");
  const forgotLink = document.getElementById("forgotLink");

  function setMode(newMode) {
    mode = newMode;
    tabLogin.classList.toggle("active", mode === "login");
    tabSignup.classList.toggle("active", mode === "signup");
    submitBtn.textContent = mode === "login" ? "로그인" : "회원가입";
    forgotLink.hidden = mode !== "login";
    authNote.textContent =
      mode === "login" ? "" : "회원가입하면 바로 로그인됩니다.";
    authError.hidden = true;
  }

  tabLogin.addEventListener("click", () => setMode("login"));
  tabSignup.addEventListener("click", () => setMode("signup"));

  forgotLink.addEventListener("click", async () => {
    const email = document.getElementById("authEmail").value.trim();
    authError.hidden = true;
    authNote.textContent = "";

    if (!email) {
      authError.textContent = "재설정 메일을 받을 이메일을 먼저 입력해주세요.";
      authError.hidden = false;
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      authNote.textContent = `${email} 주소로 재설정 링크를 보냈어요. 메일함을 확인해주세요.`;
    } catch (err) {
      authError.textContent = authErrorMessage(err.code);
      authError.hidden = false;
    }
  });

  document.getElementById("authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    authError.hidden = true;
    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = mode === "login" ? "로그인 중..." : "가입 중...";

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        submitBtn.textContent = "데이터 불러오는 중...";
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      authError.textContent = authErrorMessage(err.code);
      authError.hidden = false;
      submitBtn.textContent = originalLabel;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth);
  });
}


// ---------- 음성으로 새 할 일 추가 (기존 문서와 분리) ----------
// 브라우저 마이크의 음성 인식을 사용합니다. 인식된 내용은
// users/{uid}/chatgptTasks 신규 문서에만 추가합니다.
// 절대로 users/{uid}의 기존 tasks, worklist, notes를 저장/수정하지 않습니다.
let speechSession = null;
let voiceSaving = false;
const SpeechCapture = window.SpeechRecognition || window.webkitSpeechRecognition;

function voiceNotice(message) {
  const status = document.getElementById("voiceStatus");
  if (!status) return;
  status.hidden = false;
  status.textContent = message;
}

async function saveRecognizedTask(spoken, uid) {
  if (voiceSaving) return;
  if (!currentUser || currentUser.uid !== uid) {
    voiceNotice("로그인을 확인해 주세요.");
    return;
  }
  let newTask;
  try {
    newTask = parseSpoken(spoken);
  } catch (error) {
    voiceNotice("인식 내용 확인 필요: " + error.message);
    return;
  }
  if (!newTask.title || !newTask.date) {
    voiceNotice("제목과 날짜를 인식하지 못했습니다. 다시 말해 주세요.");
    return;
  }
  // '3시'처럼 오전/오후가 없는 표현은 잘못된 시간에 저장하지 않습니다.
  if (newTask.time && !/(오전|오후)/.test(spoken) &&
      /\d{1,2}시/.test(spoken) && Number(newTask.time.slice(0, 2)) <= 12) {
    voiceNotice("오전·오후가 구분되지 않아 저장하지 않았습니다. '오늘 오후 3시 약속 추가해 줘'처럼 다시 말씀해 주세요.");
    return;
  }
  newTask.category = selectedCategory;
  voiceSaving = true;
  document.getElementById("voiceAddBtn").disabled = true;
  voiceNotice("인식: " + spoken + " — 저장 중...");
  try {
    if (!currentUser || currentUser.uid !== uid) throw new Error("다시 로그인해 주세요.");
    // 권한 있는 사용자만 이 별도 컬렉션에 create할 수 있습니다.
    await addDoc(collection(db, "users", uid, "chatgptTasks"), {
      ...newTask,
      createdAt: serverTimestamp(),
    });
    voiceNotice("✓ 저장 완료: " + newTask.date + (newTask.time ? " " + newTask.time : "")
      + " · " + newTask.title);
    if (currentDate !== newTask.date) {
      currentDate = newTask.date;
      renderDate();
      render();
    }
  } catch (error) {
    console.error("음성 할 일 저장 실패:", error.code || error.message);
    voiceNotice(error.code === "permission-denied"
      ? "저장 권한이 아직 설정되지 않았습니다. Firebase 보안 규칙을 확인해 주세요."
      : "저장에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.");
  } finally {
    voiceSaving = false;
    document.getElementById("voiceAddBtn").disabled = false;
  }
}

function setupVoiceAdd() {
  const button = document.getElementById("voiceAddBtn");
  if (!button) return;
  if (!SpeechCapture) {
    button.disabled = true;
    voiceNotice("현재 브라우저는 음성 인식을 지원하지 않습니다. Chrome 등을 사용해 주세요.");
    return;
  }

  button.addEventListener("click", () => {
    if (speechSession) {
      speechSession.stop();
      return;
    }
    if (voiceSaving) return;
    if (!currentUser) return voiceNotice("먼저 할일장 계정으로 로그인해 주세요.");

    const uid = currentUser.uid;
    const recognition = new SpeechCapture();
    speechSession = recognition;
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    let handled = false;

    recognition.onresult = async (event) => {
      if (handled) return;
      const spoken = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ").trim();
      if (!spoken) return;
      handled = true;
      await saveRecognizedTask(spoken, uid);
    };
    recognition.onerror = (event) => {
      if (!handled) voiceNotice(event.error === "not-allowed"
        ? "마이크 권한이 차단됐습니다. 브라우저 설정에서 허용해 주세요."
        : "음성을 인식하지 못했습니다. 다시 눌러 말해 주세요.");
    };
    recognition.onend = () => {
      if (speechSession === recognition) speechSession = null;
      button.textContent = "🎙️ 말해서 바로 저장";
    };
    try {
      recognition.start();
      button.textContent = "🎙️ 듣는 중... (다시 눌러 종료)";
      voiceNotice("듣고 있습니다. 예: 내일 오후 3시 사진 보정 추가해 줘.");
    } catch {
      speechSession = null;
      voiceNotice("음성 인식을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  });
}

// Warn before leaving while debounced, in-flight, or blocked edits are unsaved.
window.addEventListener("beforeunload", (event) => {
  if (currentUser && pendingChanges > savedRevision) {
    event.preventDefault();
    event.returnValue = "";
  }
});

// ---------- 초기화 ----------

setupForm();
setupNav();
setupNotes();
setupDateNav();
setupWorklist();
setupAuth();
setupVoiceAdd();

onAuthStateChanged(auth, async (user) => {
  const generation = ++authGeneration;
  clearTimeout(saveTimer);
  isDataReady = false;
  saveBlocked = false;
  loadedSignature = null;
  lastLoadedTime = null;
  pendingChanges = 0;
  savedRevision = 0;

  const overlay = document.getElementById("authOverlay");
  const appRoot = document.getElementById("appRoot");
  const errorArea = document.getElementById("authError");
  appRoot.hidden = true;

  if (stopChatgptTaskSync) {
    stopChatgptTaskSync();
    stopChatgptTaskSync = null;
  }
  if (speechSession) {
    speechSession.abort();
    speechSession = null;
  }

  if (!user) {
    currentUser = null;
    tasks = [];
    worklist = [];
    chatgptTasks = [];
    overlay.hidden = false;
    if (errorArea) errorArea.hidden = true;
    return;
  }

  currentUser = user;
  tasks = [];
  worklist = [];
  chatgptTasks = [];
  document.getElementById("sidebarEmail").textContent = user.email || "";
  overlay.hidden = false;

  let notes;
  try {
    notes = await loadFromFirestore(user.uid);
  } catch (error) {
    // Keep the main UI closed. Do not render a blank editable list.
    if (authGeneration !== generation || currentUser?.uid !== user.uid) return;
    console.error("초기 데이터 읽기 실패. 저장/수정 잠금:", error);
    saveBlocked = true;
    setSyncWarning("기존 데이터를 불러오지 못해 모든 쓰기 작업을 잠갔습니다.");
    if (errorArea) {
      errorArea.textContent =
        "기존 데이터를 안전하게 불러오지 못했습니다. 수정·저장은 차단됐습니다. 인터넷 연결을 확인하고 페이지를 새로고침해 주세요.";
      errorArea.hidden = false;
    }
    return;
  }
  if (authGeneration !== generation || currentUser?.uid !== user.uid) return;

  isDataReady = true;
  if (errorArea) errorArea.hidden = true;
  document.getElementById("notesArea").value = notes;
  setSyncWarning("");

  currentDate = todayStr();
  renderDate();
  render();
  renderWorklist();
  overlay.hidden = true;
  appRoot.hidden = false;
  startDayWatcher();
  subscribeChatgptTasks(user.uid);
});
