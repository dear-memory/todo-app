import { firebaseConfig } from "./app-config.js";
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
  getDoc,
  setDoc,
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
let expandedIds = new Set();
let selectedCategory = "업무";
let saveTimer = null;

// ---------- Firestore 동기화 ----------

function scheduleSave() {
  if (!currentUser) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToFirestore, 400);
}

async function saveToFirestore() {
  if (!currentUser) return;
  const notesArea = document.getElementById("notesArea");
  const syncNote = document.getElementById("syncNote");
  try {
    await setDoc(doc(db, "users", currentUser.uid), {
      tasks,
      worklist,
      notes: notesArea ? notesArea.value : "",
      updatedAt: Date.now(),
    });
    if (syncNote) syncNote.hidden = true;
  } catch (e) {
    console.error("저장 실패:", e);
    if (syncNote) {
      syncNote.textContent = "저장 서버 연결이 막혀 있어요. 광고 차단 확장 프로그램을 꺼주세요.";
      syncNote.hidden = false;
    }
  }
}

async function loadFromFirestore(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    const data = snap.data();
    tasks = data.tasks || [];
    worklist = data.worklist || [];
    return data.notes || "";
  }
  return "";
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
      scheduleSave();
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
  scheduleSave();
  render();
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  scheduleSave();
  render();
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

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      authError.textContent = authErrorMessage(err.code);
      authError.hidden = false;
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    signOut(auth);
  });
}

// ---------- 초기화 ----------

setupForm();
setupNav();
setupNotes();
setupDateNav();
setupWorklist();
setupAuth();

onAuthStateChanged(auth, async (user) => {
  const overlay = document.getElementById("authOverlay");
  const appRoot = document.getElementById("appRoot");

  if (user) {
    currentUser = user;
    document.getElementById("sidebarEmail").textContent = user.email;

    let notes = "";
    let syncWarning = "";
    try {
      notes = await loadFromFirestore(user.uid);
    } catch (e) {
      console.error("데이터 불러오기 실패:", e);
      syncWarning =
        "저장 서버 연결이 막혀 있어요. 광고 차단 확장 프로그램을 꺼주세요.";
    }
    document.getElementById("notesArea").value = notes;

    const syncNote = document.getElementById("syncNote");
    if (syncNote) {
      syncNote.textContent = syncWarning;
      syncNote.hidden = !syncWarning;
    }

    currentDate = todayStr();
    renderDate();
    render();
    renderWorklist();

    overlay.hidden = true;
    appRoot.hidden = false;
  } else {
    currentUser = null;
    tasks = [];
    worklist = [];
    overlay.hidden = false;
    appRoot.hidden = true;
  }
});
