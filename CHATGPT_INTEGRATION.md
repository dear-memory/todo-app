# ChatGPT 음성 연동 — 안전한 적용 계획

## 확인된 현재 상태
- 원본 앱은 Firebase Authentication으로 로그인하며 Firestore `users/{uid}` 문서의 `tasks`, `worklist`, `notes`를 저장합니다.
- 기존 앱은 `setDoc(users/{uid}, {...})` 방식으로 전체 문서를 쓰므로 같은 문서에 외부에서 새 할 일을 추가하면 덮어쓰기 위험이 있습니다.
- 이번 브랜치에서는 **기존 `users/{uid}` 문서와 기존 데이터에는 손대지 않고**, ChatGPT용 `users/{uid}/chatgptTasks/{taskId}` 별도 경로를 화면에 병합했습니다.
- 코드만으로는 Firebase 보안 규칙이나 OAuth 서버를 배포하지 못하며, 실제 저장은 아직 연결되지 않았습니다.

## 저장 API에 필요한 인터페이스
인증된 사용자에 한해 아래 작업을 지원하는 HTTPS MCP 서버를 구성합니다.
- `add_task({title,date,time,category,detail})` — **새 문서만 생성**, 기존 문서 수정 금지.
- `list_tasks({date})` — 사용자가 권한을 가진 ChatGPT 추가 항목만 읽음.
- 날짜는 `YYYY-MM-DD` (Asia/Seoul), 시간은 `HH:mm` 또는 null. 카테고리는 `업무`, `개인`, `운동`, `개인성장`.
- 새 문서: `{title,date,time,category,detail,done:false,createdAt,source:"chatgpt"}`.
- 서버는 로그인된 Firebase UID를 인증 검증 결과로만 획득해야 합니다. 호출자의 UID 입력값을 신뢰해서는 안 됩니다.
- 서버 인증과 계정별 접근 제어는 ChatGPT 앱의 지원되는 OAuth 방식으로 구축합니다. Firebase 관리자 키를 GitHub나 브라우저에 노출하지 않습니다.

## 배포 전 필수 확인
1. Firestore 보안 규칙이 `users/{uid}/chatgptTasks/{taskId}` 읽기/수정/삭제를 **본인 계정만** 허용하는지 검사합니다.
2. 로그인 사용자 전환, 오류, 새 항목 생성/동기화, 날짜별 표시를 별도의 테스트 계정과 기록으로 검증합니다.
3. 기존 기록 개수, 목록, 메모를 배포 전후 비교하고 백업합니다. 기존 항목 삭제/덮어쓰기는 허용하지 않습니다.
4. ChatGPT의 MCP 앱 등록과 음성 모드에서 해당 앱 호출 지원 여부를 실제로 검증합니다. 음성 사용 가능하다고 사전 보장하지 않습니다.
5. 테스트 완료 전에는 이 브랜치를 `main`에 병합하거나 실제 서비스를 배포하지 않습니다.
