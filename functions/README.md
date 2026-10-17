# 할일장: ChatGPT 저장 서버 (배포 전 검증용)

**상태:** 개발 브랜치에서만 작성. 실제 Firebase에 미배포. ChatGPT 플러그인(MCP/OAuth)은 미연결.

## 데이터 보존 정책
- 기존 Firestore 문서 `users/{uid}`의 `tasks`, `worklist`, `notes`는 어떤 경우에도 갱신하거나 삭제하지 않습니다.
- 새로운 할 일만 `users/{verifiedFirebaseUid}/chatgptTasks/{newId}`에 **create()** 합니다.
- UID는 요청 본문이 아닌 **검증된 Firebase ID 토큰**에서만 가져옵니다.
- 토큰/개인키/계정 비밀번호를 GitHub에 저장하지 않습니다.
- 다른 Vercel 프로젝트인 `dear-memory-booking`에는 어떠한 변경도 하지 않습니다.

## API (중간 단계)
- Cloud Function: `createChatgptTask` (`asia-northeast3` 리전)
- `POST` with `Content-Type: application/json` and `Authorization: Bearer <Firebase ID token>`.
- JSON example: `{"title":"사진 보정","date":"2026-10-18","time":"15:00","category":"업무","detail":""}`
- 날짜는 Asia/Seoul 현지 기준 달력 날짜로 생성하고, 서버는 날짜 문자열을 해석하지 않습니다.
- 선택적 `Idempotency-Key` 요청 헤더: 동일 키 재시도 시 중복 생성하지 않고 409 반환.
- 기존 항목 수정/삭제/API 읽기 엔드포인트는 제공하지 않습니다.

**중요:** 이 엔드포인트가 있다는 것만으로 ChatGPT가 직접 호출할 수는 없습니다. ChatGPT용 별도의 안전한 OAuth 2.1 + PKCE 인증 흐름과 MCP 서버(또는 계정 지원 범위에 맞는 Actions 인증 연결)를 추가해야 합니다.

## Firebase Cloud Functions 배포 전 반드시
1. Firebase 프로젝트 `mkstroy-3dc7e`에 대한 관리자 권한과 Cloud Functions 지원 요금제 확인. 현재 Firebase 프로젝트에 어떤 함수도 배포하지 않았습니다.
2. 현재 Firestore 보안 규칙을 **먼저 가져와 백업**한 후 아래 규칙을 기존 규칙과 병합하십시오. 절대로 전체 파일을 예시로 덮어쓰지 마세요.
3. 테스트 계정과 별도의 테스트 항목으로 API 검증. 기록 개수, 메모, 작업 목록 등 실제 데이터 변경 여부 이중 확인.
4. 인증, 실패 시 재시도, Firestore 읽기 권한 확인, OAuth/MCP 플러그인 연결 및 Live 음성 모드에서 실제 기록까지 검증.
5. 검증 후에도 사용자 명시 승인 없이 `main`으로 병합하거나 서비스 배포하지 마세요.

### 본인 항목만 읽고 관리하도록 할 보안 규칙 예시

다음은 기존 `service cloud.firestore { match /databases/{database}/documents { ... }}` 내부에 병합할 일부 규칙입니다. 실제 규칙의 전체 내용은 확인되지 않았습니다.

```firestore
match /users/{userId}/chatgptTasks/{taskId} {
  allow read, update, delete: if request.auth != null
                              && request.auth.uid == userId;
  // Client SDK cannot create tasks. Only authenticated Cloud Function (Admin SDK) does.
  allow create: if false;
}
```

### 코드 테스트
```bash
node --check functions/validation.js
node --check functions/index.js
node --test functions/test/validation.test.js
```

**주의:** 이 단계의 API는 Firebase ID 토큰을 받습니다. ChatGPT OAuth 액세스 토큰과 혼용하면 안 됩니다. 실제 MCP 서버는 ChatGPT OAuth 토큰을 별도로 검증하고 해당 사용자에게 안전하게 매핑하도록 구축해야 합니다.
