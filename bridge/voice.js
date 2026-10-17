import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { parseSpoken, seoulToday } from "./parser.mjs";

const firebaseConfig = {
  apiKey: "AIzaSyBfgL7gC-uQeeH2bBB4q2JRTnk2ooRTZF8",
  authDomain: "mkstroy-3dc7e.firebaseapp.com",
  projectId: "mkstroy-3dc7e",
  appId: "1:1041941827601:web:4004c163fdd00586afa1b0",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const el = (id) => document.getElementById(id);
let loggedInUser = null;
let busy = false;
let requestKey = null;
let recognition = null;
let stopTaskWatcher = null;

function notice(message) { el("notice").textContent = message; }
function setBusy(value) {
  busy = value;
  el("saveBtn").disabled = value;
  el("micBtn").disabled = value;
}
function applyTranscript() {
  try {
    const result = parseSpoken(el("transcript").value);
    el("taskTitle").value = result.title;
    el("taskDate").value = result.date;
    el("taskTime").value = result.time || "";
    return true;
  } catch (error) {
    notice(error.message);
    return false;
  }
}
function newRequest() { requestKey = null; }

el("taskDate").value = seoulToday();
el("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, el("email").value, el("password").value);
    el("password").value = "";
  } catch {
    notice("로그인하지 못했습니다. 할일장 이메일과 비밀번호를 확인해 주세요.");
  }
});
el("logoutBtn").addEventListener("click", () => signOut(auth));
onAuthStateChanged(auth, (user) => {
  if (stopTaskWatcher) {
    stopTaskWatcher();
    stopTaskWatcher = null;
  }
  loggedInUser = user;
  el("loginSection").classList.toggle("hidden", Boolean(user));
  el("voiceSection").classList.toggle("hidden", !user);
  el("loggedInAs").textContent = user?.email || "";
  el("recentTasks").replaceChildren();
  if (user) {
    notice("음성으로 할 일을 말해 주세요. 기존 기록은 그대로 유지됩니다.");
    stopTaskWatcher = onSnapshot(
      collection(db, "users", user.uid, "chatgptTasks"),
      (snapshot) => {
        if (loggedInUser?.uid !== user.uid) return;
        const entries = snapshot.docs.map((item) => item.data())
          .sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 30);
        const list = el("recentTasks");
        list.replaceChildren();
        if (entries.length === 0) {
          const empty = document.createElement("li");
          empty.textContent = "아직 새로 추가된 할 일이 없습니다.";
          list.appendChild(empty);
        }
        for (const task of entries) {
          const li = document.createElement("li");
          li.textContent = (task.date || "날짜 없음") + " " + (task.time || "") + " · " + (task.title || "");
          li.style.marginBottom = "7px";
          list.appendChild(li);
        }
      },
      () => {
        const li = document.createElement("li");
        li.textContent = "목록 접근 권한을 확인해 주세요.";
        el("recentTasks").replaceChildren(li);
      }
    );
  }
});

el("transcript").addEventListener("input", () => { newRequest(); applyTranscript(); });
["taskTitle", "taskDate", "taskTime", "category"].forEach((id) => {
  el(id).addEventListener("change", newRequest);
});
el("saveBtn").addEventListener("click", saveTask);

async function saveTask() {
  if (busy) return;
  if (!loggedInUser) return notice("로그인이 필요합니다.");
  const task = {
    title: el("taskTitle").value.trim(),
    date: el("taskDate").value,
    time: el("taskTime").value || null,
    category: el("category").value,
    detail: "",
  };
  if (!task.title || !task.date) return notice("할 일 제목과 날짜를 확인해 주세요.");
  if (!requestKey) requestKey = crypto.randomUUID();
  setBusy(true);
  notice("새 할 일을 안전하게 저장하고 있습니다...");
  try {
    const token = await loggedInUser.getIdToken();
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "Idempotency-Key": requestKey,
      },
      body: JSON.stringify(task),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      if (result.error === "firestore_rule_denied") throw new Error("Firestore에 할 일 추가 권한이 없습니다. 규칙을 확인해 주세요.");
      if (result.error === "invalid_firebase_session" || result.error === "session_expired")
        throw new Error("로그인 인증이 만료되었습니다. 다시 로그인해 주세요.");
      throw new Error(result.message || "저장되지 않았습니다. 잠시 뒤 다시 시도해 주세요.");
    }
    notice((result.alreadySaved ? "이미 저장된 할 일입니다: " : "새 할 일을 저장했습니다: ")
      + task.date + (task.time ? " " + task.time : "") + " · " + task.title);
    requestKey = null;
  } catch (error) {
    notice(error.message || "저장에 실패했습니다. 연결을 확인해 주세요.");
  } finally {
    setBusy(false);
  }
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  el("micBtn").disabled = true;
  el("micBtn").textContent = "이 브라우저는 음성 인식을 지원하지 않습니다";
} else {
  el("micBtn").addEventListener("click", () => {
    if (recognition) {
      recognition.stop();
      return;
    }
    recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    let handled = false;
    recognition.onresult = async (event) => {
      if (handled) return;
      const transcript = Array.from(event.results)
        .filter((v) => v.isFinal)
        .map((v) => v[0].transcript).join(" ").trim();
      if (!transcript) return;
      handled = true;
      el("transcript").value = transcript;
      newRequest();
      if (applyTranscript()) {
        notice("인식: " + transcript);
        if (el("autosave").checked) await saveTask();
      }
    };
    recognition.onerror = () => notice("음성 인식을 완료하지 못했습니다. 마이크 권한과 연결을 확인해 주세요.");
    recognition.onend = () => {
      recognition = null;
      el("micBtn").textContent = "🎙️ 누르고 말하기";
    };
    recognition.start();
    el("micBtn").textContent = "🎙️ 듣는 중... 다시 누르면 종료";
    notice("할 일을 말씀해 주세요.");
  });
}
