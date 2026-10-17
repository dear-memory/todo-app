# 할일장 음성 저장 — Firebase Spark 유지

**상태: 개발 브랜치만 준비됨 / 미배포 / 실제 할 일 작성 테스트 없음**

## 기능과 데이터 보존

- 원래 앱의 Firestore `users/{uid}` 문서(`tasks`, `worklist`, `notes`)는 읽거나 변경하지 않습니다.
- 사용자가 기존 Firebase 계정으로 로그인한 뒤 새 음성 할 일만 `users/{uid}/chatgptTasks/{id}`에 추가합니다.
- 백엔드: Vercel Node 함수 `POST /api/tasks` (프로젝트 `bridge/`를 별도 Vercel 프로젝트 루트로 지정)
- 비밀 Firebase 서비스 계정 키가 필요하지 않습니다. 공개 Firebase API key + 로그인 사용자 ID 토큰만 사용합니다.
- 서버는 ID 토큰을 `accounts:lookup`로 확인하고, 확인한 UID만 Firestore 경로에 넣습니다.
- Firestore 공식 REST API에 Firebase ID 토큰을 전달하여 **Firestore Security Rules를 적용**받습니다.
- Firestore `createDocument`만 호출합니다. 이전 데이터 갱신과 삭제 API는 존재하지 않습니다.
- Firestore 원본 사용자 문서의 덮어쓰기 코드 `setDoc`는 새 서버 코드에서 사용하지 않습니다.
- 요청 재시도에는 `Idempotency-Key`를 사용해 중복 저장을 피합니다.
- 음성 페이지는 브라우저 SpeechRecognition 지원 시 음성 한 문장 인식 직후 자동 저장(선택 가능) 또는 수동 저장을 제공합니다.
- 음성 미지원 브라우저에서는 직접 문장을 입력할 수 있습니다.
- `오늘`, `내일`, `모레`, `글피`, `n월 n일`, `오전/오후 n시 [반]`을 기본 지원하며, 중요한 날짜는 저장 전에 화면에서 확인해야 합니다.

## Spark 무료 요금제와 별도 서버

Firebase Cloud Functions / Blaze 업그레이드는 필요하지 않습니다.

요청 흐름:
1. 사용자가 새 음성 페이지에 원래 할일장 Firebase 계정으로 로그인
2. Firebase ID 토큰을 새 서버 `/api/tasks`로 전달
3. 서버가 Firebase Auth로 토큰 검증
4. 서버가 UID별 **별도 Firestore 컬렉션**에 REST createDocument 요청
5. Firestore 보안 규칙 검증 후 신규 문서만 저장
6. 운영 앱에 별도 컬렉션 표시 코드를 병합한 뒤 UI에도 항목 표시

**결정할 내용:** 별도 서버의 제공업체 및 요금제. Vercel Hobby 무료는 개인·비상업 용도로 제한됩니다. 사업 업무용이라면 허용되는 유료 플랜 또는 다른 사업용 서버 상품이 필요할 수 있습니다. 이 작업에서는 Vercel 배포 권한 403 오류가 있었으므로 서버 배포를 보류했습니다.

## 운영 적용 전 단계 (필수)

1. 기존 Firestore 규칙 백업(현재 규칙을 전체 복사하여 안전한 곳에 보관).
2. `bridge/firestore.rules.proposed`를 현재 **실제 규칙과 비교**. 기존 users/bookings 규칙을 반드시 유지하고, 새 chatgptTasks match만 추가한 뒤 **사용자가 규칙 게시를 승인**.
3. Vercel 연결 계정/작업공간에 적절한 배포 권한 확보. 현재 `mkstory-lab` 범위 접근에 403 오류가 발생해 별도 서버 미배포.
4. 별도 Vercel 프로젝트를 생성한다면 GitHub 저장소 `dear-memory/todo-app`, **Root Directory `bridge`**로 설정. 기존 `dear-memory-booking` 프로젝트는 그대로 둡니다. 현재 브랜치에서 안전한 미리보기 배포를 먼저 하세요.
5. Firebase Authentication에 사용자 로그인 방법이 활성화됐는지 확인. 기존 앱은 이메일·비밀번호 로그인 사용.
6. 테스트 사용자로 로그인 후, 본인 테스트 할 일 하나만 저장하고 Firestore `users/{testUid}/chatgptTasks`에 생성됐는지 확인.
7. 현재 앱의 기존 데이터와 기존 Firestore 규칙은 수정하지 않고, 별도 항목 표시 기능을 준비·검증합니다.
8. 전체 검증이 완료될 때까지 개발 PR을 `main`에 병합하지 않습니다.

## ChatGPT 연결 지원 한계

- ChatGPT에서 개인 계정의 맞춤 MCP 쓰기 작업 및 Live 음성 앱 호출은 별도 지원 제한이 있습니다. 개발 브랜치가 있다고 해서 ChatGPT에 할일장이 자동 등록되는 것은 **아닙니다**.
- 현재 구현된 기능은 **외부 브라우저 음성 입력 페이지 → 별도 서버 → Firebase** 경로입니다. 서비스 배포 전에는 기능 테스트를 완료했다고 볼 수 없습니다.
- 지원되는 계정·앱 환경이 확인되면, 별도의 OAuth/MCP 커넥터 개발을 그때 진행해야 합니다.
- Firebase 로그인 인증 토큰을 GPT 프롬프트나 공개 문서에 붙여 넣어서는 안 됩니다.

## 오프라인 코드 검사

```bash
node --check bridge/api/tasks.js
node --check bridge/lib/validation.js
node --check bridge/parser.mjs
node --check bridge/voice.js
node --test bridge/test/*.test.cjs
```

테스트는 모두 가짜 Firebase 응답을 사용하며 실제 데이터베이스에는 접근하지 않습니다.
