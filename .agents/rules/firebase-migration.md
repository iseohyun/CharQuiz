# Firebase: 퀴즈 앱 공용 프로젝트 quizquiz-quiz

CharQuiz는 kana-loop에서 퀴즈 앱 공용 프로젝트 `quizquiz-quiz`로 옮겼다(2026-11). 앱별 프로젝트(charquiz-da846, namequiz-12867)는 쓰지 않기로 했다.

- Firestore 규칙·인덱스·Cloud Functions는 `C:\git\QuizQuiz` 저장소에서만 배포한다. 이 저장소에는 Firebase 배포 파일을 두지 않는다.
- 이 앱은 공용 프로젝트에 등록한 「CharQuiz」 웹 앱의 appId를 쓴다(`components/firebase-config.js`, `firebase-messaging-sw.js`).
- 순위 컬렉션은 앱 이름이 붙은 것(`charquiz_*`)을 쓴다. `users/{uid}`는 다른 퀴즈 앱과 공유한다.
- 이전 로그인 사용자 기록은 `components/legacy-migration.js`가 첫 로그인 때 `legacy_users/{이메일}`에서 이어 받는다.
- 자세한 값과 새 앱 추가 절차는 `C:\git\QuizQuiz\README.md`.
