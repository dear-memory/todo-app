import { firebaseConfig } from "../app-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDocFromServer, collection, getDocsFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);
const $ = (id) => document.getElementById(id);
let busy = false;
let loginUser = null;
let preparedUrl = null;
let preparedJson = "";

function clearPreparedBackup() {
  if (preparedUrl) URL.revokeObjectURL(preparedUrl);
  preparedUrl = null;
  preparedJson = "";
  $("downloadReady").hidden = true;
  $("directSave").removeAttribute("href");
  $("backupJson").value = "";
  $("backupJson").hidden = true;
}

function status(text) {
  $("notice").textContent = text;
}

onAuthStateChanged(auth, (user) => {
  if (loginUser?.uid !== user?.uid) clearPreparedBackup();
  loginUser = user;
  $("login").hidden = Boolean(user);
  $("backup").hidden = !user;
  $("account").textContent = user?.email || "";
  if (user) status("백업 준비 완료. 다운로드 버튼을 누르면 기존 기록을 읽어서 파일로 저장합니다.");
});

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, $("email").value, $("password").value);
    $("password").value = "";
  } catch (error) {
    status("로그인할 수 없습니다. 기존 할일장의 이메일과 비밀번호를 확인하세요.");
  }
});
$("logout").addEventListener("click", () => signOut(auth));

$("copyJson").addEventListener("click", async () => {
  if (!preparedJson) return status("먼저 백업 파일 생성 버튼을 눌러 주세요.");
  try {
    await navigator.clipboard.writeText(preparedJson);
    status("백업 JSON을 클립보드에 복사했습니다. 메모장에 붙여넣은 뒤 .json 파일로 저장하세요.");
  } catch {
    // Some embedded browsers block clipboard writes. Offer manual text selection.
    const area = $("backupJson");
    area.hidden = false;
    area.value = preparedJson;
    area.focus();
    area.select();
    status("자동 복사가 차단됐습니다. 선택된 내용을 Ctrl+C로 복사해 메모장에 붙여넣고 .json 파일로 저장하세요.");
  }
});

function safeJson(obj) {
  return JSON.stringify(obj, null, 2);
}
async function subcollection(uid, subpath) {
  const result = await getDocsFromServer(collection(db, "users", uid, subpath));
  return result.docs.map((snap) => ({ id: snap.id, data: snap.data() }));
}

$("download").addEventListener("click", async () => {
  if (busy || !loginUser) return;
  busy = true;
  $("download").disabled = true;
  clearPreparedBackup();
  const uid = loginUser.uid;
  try {
    status("기존 사용자 문서를 읽고 있습니다...");
    const userSnap = await getDocFromServer(doc(db, "users", uid));
    if (!userSnap.exists()) {
      throw new Error("기존 사용자 문서가 보이지 않습니다. 이 상태에서는 백업 완료로 처리하지 않습니다.");
    }
    const userData = userSnap.data();
    if (!Array.isArray(userData.tasks ?? []) || !Array.isArray(userData.worklist ?? [])) {
      throw new Error("기존 목록 형식이 예상과 다릅니다. 데이터 확인이 필요합니다.");
    }
    status("하위 컬렉션까지 모두 읽고 있습니다...");
    const bookings = await subcollection(uid, "bookings");
    // New voice tasks are not readable before their separate rules are added.
    // That must not block backing up existing tasks, worklist, notes and bookings.
    let chatgptTasks = [];
    let optionalWarning = null;
    try {
      chatgptTasks = await subcollection(uid, "chatgptTasks");
    } catch (error) {
      if (error.code !== "permission-denied") throw error;
      optionalWarning = "새 음성 할 일은 아직 접근 권한이 없어 이번 백업에 포함되지 않았습니다.";
    }

    // All data stays in this browser and is saved as a local download.
    const backup = {
      format: "haliljang-firestore-readonly-backup-v1",
      projectId: firebaseConfig.projectId,
      uid,
      exportedAt: new Date().toISOString(),
      userDocument: userData,
      subcollections: { bookings, chatgptTasks },
      warnings: optionalWarning ? [optionalWarning] : [],
    };
    const contents = safeJson(backup);
    const bytes = new TextEncoder().encode(contents);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (!loginUser || loginUser.uid !== uid) throw new Error("백업 중 로그인 계정이 바뀌었습니다. 다시 로그인한 뒤 실행해 주세요.");
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const fileName = "haliljang-backup-" + new Date().toISOString().slice(0, 10)
      + "-" + uid.slice(0, 6) + ".json";
    preparedUrl = URL.createObjectURL(blob);
    preparedJson = contents;
    $("directSave").href = preparedUrl;
    $("directSave").download = fileName;
    $("downloadReady").hidden = false;

    status(
      "백업 데이터 읽기 완료 — 아래 'JSON 백업 파일 직접 다운로드' 링크를 눌러 저장하세요: " + fileName +
      "\n기존 할 일: " + (userData.tasks?.length ?? 0) + "개" +
      " / 작업 목록: " + (userData.worklist?.length ?? 0) + "개" +
      " / 메모: " + (userData.notes?.length ?? 0) + "글자" +
      " / 예약: " + bookings.length + "개" +
      " / 음성 할 일: " + chatgptTasks.length + "개" +
      (optionalWarning ? "\n참고: " + optionalWarning : "") +
      "\nSHA-256: " + checksum +
      "\n다운로드 링크를 누른 후 실제 파일이 생성됐는지 확인하세요. 파일이 없으면 아직 백업 완료가 아닙니다."
    );
  } catch (error) {
    console.error("읽기 전용 백업 실패:", error.code || error.message);
    status("백업 완료되지 않음: " + (error.message || "접근/연결 오류") +
      "\n원본 데이터는 변경하지 않았습니다.");
  } finally {
    busy = false;
    $("download").disabled = false;
  }
});
