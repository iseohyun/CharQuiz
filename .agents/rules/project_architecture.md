# Project Architecture Rules (CharQuiz)

## 1. CSS 스타일링 아키텍처
- **단일 중앙 집중형 CSS (`common.css`)**:
  - 애플리케이션의 주요 레이아웃, 디자인 토큰(`:root`), 모드 카드, 게임 화면(학습/기록/관전 모드), 모달 스타일은 모두 루트의 `common.css`에서 중앙 집중형으로 관리한다.
  - `view/*.html` 조각 파일 내부에 `common.css`와 충돌하는 인라인 `<style>` 재정의를 지양한다.

## 2. 이원화 버전 관리 및 캐시 버스팅 (Cache-Busting)
- **정식 시맨틱 버전 (`window.APP_VERSION`)**: 사용자 승인 시 갱신되는 정식 릴리즈 버전 태그 (예: `v1.0.5`).
- **일자 기반 캐시 버스팅 태그 (`window.CACHE_BUST`)**: 코드/스타일 수정 시 `YYYYMMDDvN` 포맷(예: `20261109v1`)으로 자동 갱신하여 `common.css`, `main.js`, `view/*.html` 원격 fetch 시 브라우저 강제 새로고침 없이도 최신 리소스가 즉시 반영되도록 유지한다.
