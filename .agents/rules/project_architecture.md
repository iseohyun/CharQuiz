# Project Architecture Rules (CharQuiz)

## 1. CSS 스타일링 아키텍처
- **단일 중앙 집중형 CSS (`common.css`)**:
  - 애플리케이션의 주요 레이아웃, 디자인 토큰(`:root`), 모드 카드, 게임 화면(학습/기록/관전 모드), 모달 스타일은 모두 루트의 `common.css`에서 중앙 집중형으로 관리한다.
  - `view/*.html` 조각 파일 내부에 `common.css`와 충돌하는 인라인 `<style>` 재정의를 지양한다.

## 2. 이원화 버전 관리 및 캐시 버스팅 (Cache-Busting)
- **정식 시맨틱 버전 (`window.APP_VERSION`)**: 사용자 승인 시 갱신되는 정식 릴리즈 버전 태그 (예: `v1.0.5`).
- **일자 기반 캐시 버스팅 태그 (`window.CACHE_BUST`)**: 코드/스타일 수정 시 `YYYYMMDDvN` 포맷(예: `20261116v1`)으로 자동 갱신하여 `common.css`, `main.js`, `components/*.js`, `view/*.html` 원격 fetch 시 브라우저 강제 새로고침 없이도 최신 리소스가 즉시 반영되도록 유지한다.
- **ES 모듈 캐시 버스팅 (import map)**: `index.html`의 `componentModules` 목록에 있는 모듈만 `?v=CACHE_BUST`로 로드된다.
  - `components/`에 모듈을 **추가·삭제·이름 변경하면 반드시 이 목록도 함께 수정**한다. 빠뜨리면 그 모듈만 캐시 버스팅이 적용되지 않는다.

## 3. 배포 위치 및 외부 연동 설정
- **서비스 위치**: GitHub Pages 프로젝트 사이트 → `https://iseohyun.com/CharQuiz/` (부모 사용자 사이트 `iseohyun/html`의 CNAME `iseohyun.com`을 상속). 로컬은 Live Server `http://127.0.0.1:5500/`.
- **경로·도메인을 코드에 하드코딩하지 않는다.** 배포 위치에 따라 달라지는 값은 `components/app-config.js`의 `APP_BASE_URL`(런타임 계산)을 사용한다.
- **외부 연동 상수**(Cloud Run 엔드포인트, OAuth 클라이언트 ID, FCM VAPID 키)는 `components/app-config.js` 한곳에서 관리한다.
- 서비스 경로가 바뀌면 코드 수정 없이 각 콘솔(Kakao/Naver 리다이렉트 URI, Firebase 승인 도메인, API 키 리퍼러)만 갱신하면 된다.

## 4. 로컬 저장소(localStorage) 키 규칙
- 접두어는 `CHARQUIZ_`를 사용한다. 키 이름을 바꿀 때는 **반드시 `components/storage-migration.js`에 옛 키 → 새 키 마이그레이션을 추가**한다 (사용자 데이터 유실 방지).
- 날짜 키는 `components/date-utils.js`의 `toLocalDateKey()`(로컬 날짜 기준)를 사용한다. `toISOString()`(UTC)로 날짜 키를 만들지 않는다.
- Firestore/localStorage에 진도를 저장할 때는 `toPersistedSchema()`로 영속 필드만 저장한다 (세션 전용 플래그 저장 금지).
