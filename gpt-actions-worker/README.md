# ChatGPT 기본 마이크 → 기존 할일장 (무료 연결 준비)

**상태: 코드 개발 중 · 실제 서버 미배포 · 실제 Firebase 규칙/데이터 미변경.**

## 선택한 방식 (Google Calendar 중계보다 직접 연결 권장)

ChatGPT 개인용 맞춤 GPT의 **Actions** → Cloudflare Workers **Free** → Firebase Auth 제한된 전용 계정 → Firestore 별도 `users/{ownerUid}/chatgptTasks/{newDocId}`.

이 기능은 **ChatGPT 채팅 입력창 마이크로 받아쓰기한 텍스트를 보내는 경우**를 위한 것입니다. ChatGPT *실시간 Voice 모드*는 맞춤 GPT Actions 실행을 지원하지 않습니다.

- ChatGPT 개인용 Plus에서 맞춤 GPT + Actions를 사용할 수 있으면 기존 구독 외 **추가 서버 월요금이 필요하지 않습니다** (Cloudflare 무료 요금제 내에서).
- Firebase Spark 무료 요금제 유지.
- 기존 할일장 `users/{uid}` 문서의 `tasks`, `worklist`, `notes`를 수정/읽기/삭제하지 않음.
- `bookings` 컬렉션을 수정/읽기/삭제하지 않음.
- BOT 계정은 보안 규칙으로 **새 chatgptTasks 문서 create 권한만** 부여, 기존 항목 읽기·수정·삭제 금지.
- 별도 Firebase 관리자 서비스 계정/비밀키는 사용하지 않음.
- API Key는 ChatGPT GPT Actions 설정의 비밀 필드에만, Firebase 봇 비밀번호는 Cloudflare Secrets에만 입력. **GitHub/ChatGPT 대화에 절대 붙여넣지 않음.**
- 맞춤 GPT의 공유 범위를 반드시 **Only me(나만)**로 설정.

## 1. Firebase 전용 로그인 계정 만들기 (관리자 UI에서)

기존 본인 계정/로그인 비밀번호를 **절대로** 새 서버에 넣지 마세요.

1. [Firebase 콘솔](https://console.firebase.google.com/project/mkstroy-3dc7e/authentication/users) → Authentication → Users → Add user.
2. 전용 이메일 주소(본인 통제가 가능한 별도 주소 또는 별칭)와 강력한 임의 비밀번호로 **새 Firebase Auth 사용자**를 만듭니다. 기존 본인 계정은 유지.
3. 새 계정의 `UID`를 복사합니다. 아래에서 이를 `BOT_UID`라고 부릅니다.
4. 기존 할일장에 로그인하는 원래 사용자 계정의 `UID`도 확인합니다. `OWNER_UID`라 부릅니다.
5. 이메일, 비밀번호, 두 UID를 채팅이나 GitHub에 올리지 말고 본인만 갖고 계세요.

## 2. Firestore 규칙에 봇의 '추가만' 허용

[Firestore 규칙](https://console.firebase.google.com/project/mkstroy-3dc7e/firestore/databases/-default-/security/rules)을 먼저 파일로 백업합니다.

현재 규칙은 기존 `users`, `bookings`, `chatgptTasks` 블록 모두 유지합니다.
이미 있는 `match /users/{uid}/chatgptTasks/{taskId}` **안쪽**에 아래 `allow create` 절만 추가하세요.
**보여드린 예시를 기존 규칙 전체로 덮어쓰면 안 됩니다.**

```js
allow create: if request.auth != null
  && request.auth.uid == "BOT_UID"
  && uid == "OWNER_UID"
  && request.resource.data.keys().hasOnly([
    'title','date','time','category','detail','done','source','createdAt'
  ])
  && request.resource.data.keys().hasAll([
    'title','date','time','category','detail','done','source','createdAt'
  ])
  && request.resource.data.title is string
  && request.resource.data.title.size() > 0
  && request.resource.data.title.size() <= 160
  && request.resource.data.date is string
  && request.resource.data.date.size() == 10
  && (request.resource.data.time == null ||
      (request.resource.data.time is string &&
       request.resource.data.time.size() == 5))
  && request.resource.data.category in ['업무','개인','운동','개인성장']
  && request.resource.data.detail is string
  && request.resource.data.detail.size() <= 2000
  && request.resource.data.done == false
  && request.resource.data.source == 'chatgpt'
  && request.resource.data.createdAt is timestamp;
```

**BOT_UID와 OWNER_UID는 실제 Firebase Auth UID로 직접 교체**합니다. 이메일로 교체하지 마세요.

주의: 기존 사용자에게 허용된 `allow read, write: if request.auth.uid == uid`는 변경하지 않습니다. 이 **새 규칙은 봇이 신규 할 일을 추가하는 경우에만 적용**되며, 봇이 원래 할일장 데이터나 기존 새 할 일을 열거나 수정하도록 허용하지 않습니다.

## 3. Cloudflare Workers Free 서버 만들기

1. [Cloudflare Workers & Pages](https://dash.cloudflare.com/)에서 Free 플랜 계정을 사용합니다.
2. 새 Worker 생성. 이름 예: `haliljang-chatgpt-free`.
3. Worker의 코드를 `gpt-actions-worker/src/index.mjs` 내용으로 교체하고 Deploy.
4. 해당 Worker의 **Settings → Variables and Secrets** 메뉴에서 다음 항목을 **Secret**으로 추가합니다:
   - `GPT_ACTION_KEY`: 길고 무작위인 비밀 API 키(최소 32자 권장)
   - `FIREBASE_BOT_EMAIL`: 1단계 Firebase 봇 계정 이메일
   - `FIREBASE_BOT_PASSWORD`: Firebase 봇 계정 비밀번호
   - `FIREBASE_BOT_UID`: 새 봇 계정 UID
   - `FIREBASE_TARGET_UID`: 기존 할일장 사용자 UID
5. Worker 서버 주소(`https://....workers.dev`)를 기록합니다. 이 주소는 공개해도 되지만 위 5개 비밀값은 절대로 공개하지 마세요.

작업 중 도움을 요청할 때에는 **서버 주소와 오류 문구만** 보내고, 비밀번호/API 키를 채팅에 올리지 마세요.

## 4. ChatGPT 개인용 맞춤 GPT의 Actions 설정

1. [ChatGPT GPT 만들기](https://chatgpt.com/gpts/editor)에서 비공개(Only me) GPT를 만듭니다.
2. 이름: `할일장`.
3. Actions → Create new action.
4. Authentication: **API key / Bearer** 선택. Cloudflare Secret과 동일한 `GPT_ACTION_KEY`를 Actions 보안 설정에 입력.
5. `gpt-actions-worker/openapi.yaml` 내용을 schema로 붙여넣습니다.
6. `servers[0].url`을 자신의 실제 `https://...workers.dev` 주소로 교체합니다.
7. 아래 GPT instruction을 Instructions란에 붙여넣습니다.
8. 공유 범위: **Only me**.
9. Preview에서 예: `오늘 오후 3시 테스트 약속을 할일장에 저장해 줘`를 실행하고, 서버 응답 `saved:true`인지 확인.
10. 기존 할일장 사이트의 동일 날짜에 새 항목이 표시되는지 확인.

**GPT Instructions:**
```text
너는 내 기존 할일장에 새로운 할 일을 추가하는 전용 도우미다.
사용자가 "저장해줘", "추가해줘", "등록해줘"라고 명확히 요청한 경우에만 createHaliljangTask를 호출한다.
시간과 날짜는 Asia/Seoul(KST)을 기준으로 해석한다.
"오늘", "내일", "모레"는 해당 시점의 한국 날짜로 해석하고 반드시 YYYY-MM-DD로 보낸다.
"오후 3시"는 "15:00", "오전 9시 반"은 "09:30"으로 변환한다.
오전/오후 구분이 모호해서 정확한 시간을 알아낼 수 없으면 저장하기 전에 한 번만 확인한다.
사용자가 카테고리를 말하지 않으면 "개인"으로 분류한다.
detail은 사용자가 명시한 추가 설명만 넣고, 없는 경우 빈 문자열로 둔다.
같은 요청을 재시도할 때는 기존 requestId를 재사용하고, 새로운 요청일 때는 새 UUID를 사용한다.
저장 API가 saved:true를 반환한 경우에만 "저장 완료"라고 말하고 날짜·시간·제목을 보여준다.
saved:true가 아니면 "저장 실패/미확인"이라고 정확히 안내한다.
기존 할 일 조회/수정/삭제/전체 덮어쓰기는 하지 않는다.
```

## 필수 주의
- GPT Actions는 **기본 마이크 받아쓰기 후 채팅 메시지로 보내는 경우**에 사용할 수 있지만, ChatGPT **실시간 Voice 모드에서는 Actions 사용 불가**.
- ChatGPT 개인 계정에서 맞춤 GPT Actions 인터페이스가 제공되지 않는 경우에는 이 경로를 사용할 수 없습니다.
- 맞춤 GPT 기능은 제품 정책에 따라 변경/종료될 수 있습니다.
- Firebase 전용 봇 계정은 절대 본인의 원래 계정과 혼용하지 마세요.
- Worker의 API가 다른 사람이 호출하면 내 할일장에 새 항목을 추가할 수 있으므로, API 키와 비공개 GPT 접근 범위를 보호하세요.
- 실제 데이터에는 테스트 항목을 **한 개**만 추가하고, 백업 당시 할 일 53개·메모 389글자·예약 16개가 유지되는지 확인.
- 이 저장 서버는 기존 항목을 읽거나 삭제할 수 없으므로 저장 결과 외 목록·메모가 노출되지 않습니다.

## 로컬 테스트
```sh
node --check gpt-actions-worker/src/index.mjs
node --test gpt-actions-worker/test/index.test.mjs
```
모의 Firebase 응답으로만 테스트하며 실제 원본 데이터를 변경하지 않습니다.
