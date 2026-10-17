# 할일장 음성 인식 후 자동 저장 — 개발 브랜치

사용자 요청: 기존 할일장 데이터·메모 삭제/수정 없이, 말하면 새로운 할 일이 바로 저장되도록 개선.

## 현재 구현
- 기존 할일장 `index.html`의 사이드 패널에 **🎙️ 말해서 바로 저장** 버튼 추가
- `script.js`에서 브라우저 Web Speech API로 한국어 한 문장 인식 및 `bridge/parser.mjs`로 날짜·시간·제목 추출
- `addDoc(collection(db, "users", uid, "chatgptTasks"), {...})`로 새 Firestore 문서만 추가. 저장 성공 확인 후 완료 안내
- `users/{uid}`의 기존 `tasks`, `worklist`, `notes`는 음성 추가 기능에서 전혀 변경하지 않음. 예약 `bookings`도 건드리지 않음
- 로그인 UID가 바뀌면 음성 세션 종료, 신규 항목 표시용 onSnapshot 구독 정리
- 오전/오후 모호 표현은 오인식 저장 방지를 위해 재입력 안내
- GitHub Actions 음성 파서·구문 자동검사

## 아직 하지 않은 작업
- Firebase 실서비스 규칙 게시(`chatgptTasks` 하위 컬렉션용 안전한 규칙 **추가 필요**)
- 운영 앱 `main`으로 병합 또는 배포. 기존 서비스 영향 방지 목적으로 개발 브랜치에만 존재
- 실제 마이크/로그인/Firebase 신규 문서 저장에 대한 end-to-end 검증
- ChatGPT 내장 마이크 음성으로 직접 저장하는 별도 커넥터 개발

## 참고
- 실제 현재 Firestore Rules 스크린샷을 바탕으로 작성한 초안: `bridge/firestore.rules.proposed`
- 적용 전에 기존 규칙을 반드시 백업하며 기존 `users`, `bookings` match 수정 금지
- 상세 안전 적용 절차: `bridge/README.md`
- Firebase Spark 무료 요금제 유지, Vercel 서버 없이 Firebase 웹 SDK 사용

**주의:** ChatGPT 채팅의 기본 마이크와 할일장 안의 마이크는 별도입니다. 이번 개발은 **할일장 웹앱 내부 마이크**를 구현한 것입니다.
