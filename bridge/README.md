# 할일장 음성 입력 — Firebase Spark 무료 유지

**현재 상태:** GitHub 개발 브랜치에서만 구현. 기존 운영 웹페이지/Firestore 데이터/보안 규칙은 변경하지 않았습니다.

## 원하는 동작
1. 기존 할일장 앱에 로그인합니다.
2. 오른쪽의 **🎙️ 말해서 바로 저장** 버튼을 누릅니다.
3. 예: "오늘 오후 3시에 강남에서 약속 저장해 줘."
4. 한국어 음성 인식(Web Speech API)이 문장을 텍스트로 바꾸고, 날짜·시간·제목을 추출합니다.
5. Firebase 클라이언트 SDK로 로그인 사용자 `users/{uid}/chatgptTasks`에 **새 문서만 addDoc()** 합니다.
6. 저장 성공 메시지가 뜨고 해당 날짜 목록에 새 할 일이 표시됩니다.

**기존 업무·메모 데이터 보호:** 원래 `users/{uid}` 문서의 `tasks`, `worklist`, `notes` 내용은 음성 저장 루틴에서 변경하지 않습니다. 기존 데이터 문서의 데이터를 읽고 덮어쓰지 않는, 별도의 하위 컬렉션을 사용합니다. 기존 예약 앱의 `bookings` 컬렉션도 건드리지 않습니다.

### 날짜·시간 정확성
- `오늘`, `내일`, `모레`, `글피`, `n월 n일`, `YYYY년 n월 n일`을 지원합니다.
- 시간이 필요한 경우 **"오전" 또는 "오후"를 포함**해 말씀해 주세요. "3시에 약속"처럼 오전/오후를 구분하지 못하면 저장하지 않고 재입력을 안내합니다.
- 브라우저가 `SpeechRecognition`/ `webkitSpeechRecognition`을 지원해야 합니다. 마이크 사용 권한 필요. Chrome 등 지원 브라우저를 사용합니다.
- 모바일 기기·브라우저별로 실제 마이크 동작은 배포 후 확인해야 합니다.

## Firebase 규칙 — 운영 적용 전 필수

현재 Firebase 프로젝트: `mkstroy-3dc7e`; Spark 유지. Firebase Cloud Functions·Vercel·관리자 비밀키 필요 없음.

스크린샷에 표시된 기존 규칙:
- `users/{userId}`는 로그인한 해당 사용자만 읽기·쓰기
- `users/{uid}/bookings/{fileId}`는 로그인한 해당 사용자만 읽기·쓰기

**안전한 변경 방법:**
1. Firebase → Firestore Database → 규칙 탭에서 기존 규칙을 먼저 별도 텍스트 파일로 복사·백업.
2. 기존 두 `match` 블록은 그대로 두고 `match /users/{uid}/chatgptTasks/{taskId}` 블록만 최상위 `match /databases/{database}/documents` 안에 추가.
3. 추가 초안은 `bridge/firestore.rules.proposed` 확인. **전체 파일을 무조건 덮어쓰지 마세요.** 실제 규칙과 대조한 후 게시.
4. GitHub PR의 기존 `main` 병합/운영 배포 전 테스트 계정으로 새 음성 항목 생성, 기존 업무·메모 개수/내용 불변 확인.
5. 실제 확인·승인 전까지 기존 규칙과 `main`을 건드리지 않습니다.

## 오프라인 코드 테스트
```sh
node --check script.js
node --check bridge/parser.mjs
node --test bridge/test/parser.test.cjs
```
테스트는 실제 Firebase에 접근하지 않습니다.

## 배포
현재 운영 앱이 GitHub Pages에서 호스팅되면 기능 검증 후 본 개발 브랜치를 `main`으로 병합하는 것으로 새 버튼을 배포할 수 있습니다. 먼저 Firebase 신규 컬렉션 보안 규칙과 기존 데이터 백업을 확인해야 합니다.

**ChatGPT 내장 마이크와의 차이:** 이 버튼은 **할일장 앱 내부 마이크**입니다. ChatGPT 일반 채팅창의 마이크로 말한 내용이 할일장에 자동 저장되는 것은 아닙니다. ChatGPT 내부 저장은 별도 커넥터의 쓰기 기능을 요구합니다.
