import { firebaseConfig } from "../app-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, collection, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);
const $ = (id) => document.getElementById(id);
let busy = false;
let loginUser = null;

function status(text) {
  $("notice").textContent = text;
}

onAuthStateChanged(auth, (user) => {
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

function safeJson(obj) {
  return JSON.stringify(obj, null, 2);
}
async function subcollection(uid, subpath) {
  const result = await getDocs(collection(db, "users", uid, subpath));
  return result.docs.map((snap) => ({ id: snap.id, data: snap.data() }));
}

$("download").addEventListener("click", async () => {
  if (busy || !loginUser) return;
  busy = true;
  $("download").disabled = true;
  const uid = loginUser.uid;
  try {
    status("기존 사용자 문서를 읽고 있습니다...");
    const userSnap = await getDoc(doc(db, "users", uid));
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
    const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
    const fileName = "haliljang-backup-" + new Date().toISOString().slice(0, 10)
      + "-" + uid.slice(0, 6) + ".json";
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    status(
      "백업 파일 다운로드 요청 완료: " + fileName +
      "\n기존 할 일: " + (userData.tasks?.length ?? 0) + "개" +
      " / 작업 목록: " + (userData.worklist?.length ?? 0) + "개" +
      " / 메모: " + (userData.notes?.length ?? 0) + "글자" +
      " / 예약: " + bookings.length + "개" +
      " / 음성 할 일: " + chatgptTasks.length + "개" +
      (optionalWarning ? "\n참고: " + optionalWarning : "") +
      "\nSHA-256: " + checksum +
      "\n다운로드 폴더에 파일이 실제 생성됐는지 확인하고 별도 공간에도 복사해 주세요."
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
