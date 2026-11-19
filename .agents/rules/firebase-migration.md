# Firebase 프로젝트 옮기기: kana-loop → charquiz-da846

CharQuiz는 NameQuiz와 함께 쓰던 kana-loop에서 CharQuiz 전용 프로젝트로 옮기는 중이다. 아직 코드는 kana-loop를 가리킨다.

## 새 프로젝트 값 (모두 브라우저에 공개되는 식별자)

| 항목 | 값 |
| :--- | :--- |
| 프로젝트 ID | charquiz-da846 |
| 프로젝트 번호 · 발신자 ID | 807401962372 |
| 웹 앱 appId | 1:807401962372:web:a6cbf7f2de73b85ee4bbd1 |
| apiKey | AIzaSyAIoVs8k_Q2HOp03V6qp1DHsEXJ3QLczvw |
| authDomain | charquiz-da846.firebaseapp.com |
| storageBucket | charquiz-da846.firebasestorage.app |
| 웹 푸시 VAPID 공개키 | BAilxJyxC0T8cPaXKc1bEbHNqIKU0PYT3pxtzbzgw4Mj6TqUZM88U18_oKT57aZy9n_nW_D2JlCD3J4-I_UhM10 |
| Firestore 위치 | asia-northeast3 (서울), 테스트 모드로 시작함 |
| DB 이름 | 「CharQuiz」로 적어 받음. `(default)`인지 이름 붙은 DB인지 확인 필요 |

## 바꿀 곳

- `components/firebase-config.js`, `firebase-messaging-sw.js`: firebaseConfig
- `components/app-config.js`: `FCM_VAPID_KEY`, 함수 배포 뒤 `ENDPOINTS` 세 주소
- `.firebaserc`: default 프로젝트
- `firestore.rules`: NameQuiz 몫(name_hints, name_hint_likes) 빼고 배포, 복합 인덱스 다시 만들기
- 이름 붙은 DB면 `getFirestore(app, 'CharQuiz')`와 `firebase.json`의 database

## 콘솔에서 할 일

Blaze 요금제, Authentication(Google, 승인 도메인 `iseohyun.github.io`), Cloud Tasks API와 `asia-northeast3`의 `notification-queue`,
Functions 서비스 계정에 「서비스 계정 토큰 생성자」, 로그인 뒤 `admins/{uid}` 문서.

## 남은 결정

- kana-loop의 기존 CharQuiz 진도·순위를 옮길지
- kana-loop 규칙·함수 배포를 NameQuiz 저장소로 넘기는 일
