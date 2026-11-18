# WebApp Common GUI 동기화 기록

> 원본: https://iseohyun.com/#/column/ai/webapp-common-gui/rules/changes.md
> 이 파일은 `common-gui-sync` 절차가 고친다. 「확인한 판」 뒤에 나온 항목만 다음에 묻는다.

- 확인한 판: v0.5.4 (2026-11-18, 기록을 처음 만든 날의 기준값)
- 화면 틀: 쓰지 않음 (자체 모드 카드·모달 화면. 화면 틀에 딸린 항목은 「해당 없음」이 기본)

| 항목 ID | 판 | 결정 | 날짜 | 메모 |
| :--- | :--- | :--- | :--- | :--- |
| install | v0.5.6 | 적용 | 2026-11-18 | 판을 거치지 않고 먼저 가져옴. 매니페스트·아이콘 3종 |
| update-notice | v0.5.6 | 적용 | 2026-11-18 | 판을 거치지 않고 먼저 가져옴. `components/update-checker.js` |
| push | v0.5.7 | 적용 | 2026-11-18 | 이 앱에서 만든 규칙. `components/notification-handler.js`, `firebase-messaging-sw.js`, `functions/index.js` |
