# ChatGPT/음성 할일장 연동 — Spark 무료 요금제

**현재:** 별도 서버와 음성 웹페이지의 코드만 개발 브랜치에 준비했습니다. Firebase 및 Vercel 실배포 없음. 실제 Firestore 데이터/규칙 수정 없음.

1. Firebase 원래 사용자 문서 `users/{uid}`의 `tasks`, `worklist`, `notes`는 보존.
2. 신규 저장 대상만 `users/{uid}/chatgptTasks/{id}` 별도 하위 컬렉션.
3. Flask/Cloud Functions/Blaze가 아니라 별도 Vercel Node 서버 `bridge/api/tasks.js`에서 Firebase ID 토큰을 검증하고 Firestore REST createDocument 실행.
4. 브라우저 음성 페이지: `bridge/index.html`, `bridge/voice.js`, `bridge/parser.mjs`. 별도 배포가 필요.
5. 제안 보안 규칙: `bridge/firestore.rules.proposed`. 기존 `users` 및 `bookings` 접근 정책은 그대로 유지하도록 준비. **실제 Firebase에 적용하지 않았습니다.**
6. 코드 시험: GitHub Actions에서 Firebase 모의 응답 기반 단위 테스트. 실사용 테스트 및 데이터 백업은 미완료.
7. ChatGPT 맞춤 플러그인 쓰기/음성 호출은 계정·모드별 제한이 있어 아직 등록/작동을 보장하지 않습니다.

배포 단계와 Firebase 규칙 검증, 유료/상업용 사용 적합성 등의 자세한 내용은 `bridge/README.md`를 참조하세요.
