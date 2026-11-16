/**
 * @file components/app-config.js
 * @description 배포 위치에 따라 달라지는 값(기준 URL)과 외부 연동 상수(Cloud Run 엔드포인트, OAuth 클라이언트 ID, FCM VAPID 키)를
 * 한곳에서 관리하는 설정 모듈. 서비스 경로가 바뀌어도 이 파일만 확인하면 되도록 유지한다.
 *
 * 참고: 아래 값은 모두 브라우저에 노출되는 "공개" 식별자다(비밀키 아님).
 * 보호는 각 콘솔의 도메인/리다이렉트 URI/리퍼러 제한으로 한다.
 */

/**
 * 현재 페이지가 서비스되는 디렉터리의 절대 URL (쿼리스트링/해시 제외, 끝에 '/' 포함).
 * - 운영: https://iseohyun.com/CharQuiz/
 * - 로컬(Live Server): http://127.0.0.1:5500/
 * OAuth redirect_uri 로 그대로 쓰이므로, 각 개발자 콘솔에 이 값과 "글자 하나까지" 같은 주소를 등록해야 한다.
 */
export const APP_BASE_URL = new URL('./', window.location.href).href;

/** Cloud Run(Cloud Functions 2세대) 백엔드 엔드포인트 */
export const ENDPOINTS = Object.freeze({
  naverLogin: 'https://naverlogin-kw55rtsoba-uc.a.run.app',
  kakaoLogin: 'https://kakaologin-kw55rtsoba-uc.a.run.app',
  scheduleNotification: 'https://schedulenotification-kw55rtsoba-uc.a.run.app'
});

/** 소셜 로그인 OAuth 클라이언트 ID (Kakao: REST API 키, Naver: Client ID) */
export const OAUTH_CLIENT_IDS = Object.freeze({
  kakao: 'af28f94aa8260ab663fd27dffea1ee77',
  naver: 'hemXaBshyStfBhmNg05m'
});

/** Firebase Cloud Messaging 웹 푸시 VAPID 공개키 */
export const FCM_VAPID_KEY = 'BCsz-FURaLXuyEgWJ5opmzZ2bk8oBACk7pGXouwVF71PlrK-XA-z95QuGNBPqHCi9ppaUD66UGQ79bf2ozcqjpg';
