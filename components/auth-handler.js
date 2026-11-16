/**
 * @file components/auth-handler.js
 * @description 사용자 OAuth 인증(Google, Kakao, Naver) 및 로그인/게스트 세션 상태 관리 모듈
 */
import { auth } from './firebase-config.js';
import { APP_BASE_URL, ENDPOINTS, OAUTH_CLIENT_IDS } from './app-config.js';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

const AUTH_PROVIDER_STORAGE_KEY = 'CHARQUIZ_AUTH_PROVIDER';
const AUTH_HISTORY_STORAGE_KEY = 'CHARQUIZ_LOGIN_SUCCESS_HISTORY';
const VALID_PROVIDERS = ['google', 'kakao', 'naver'];
let isLoginProcessing = false;

// 브라우저 뒤로가기(bfcache) 복원 시 로그인 처리 중 플래그 해제
window.addEventListener('pageshow', () => {
  isLoginProcessing = false;
});

/**
 * 과거에 한 번이라도 로그인에 성공한 소셜 플랫폼 목록을 조회한다. (로그아웃 후에도 유지됨)
 * @returns {Array<'google'|'kakao'|'naver'>}
 */
export function getLoginSuccessHistory() {
  try {
    const raw = localStorage.getItem(AUTH_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => VALID_PROVIDERS.includes(p));
  } catch (e) {
    return [];
  }
}

/**
 * 로그인에 성공한 소셜 플랫폼을 영구 이력에 기록한다.
 * @param {'google'|'kakao'|'naver'|null} provider
 */
export function recordLoginSuccess(provider) {
  if (!VALID_PROVIDERS.includes(provider)) return;
  try {
    const history = getLoginSuccessHistory();
    if (!history.includes(provider)) {
      history.push(provider);
      localStorage.setItem(AUTH_HISTORY_STORAGE_KEY, JSON.stringify(history));
    }
  } catch (e) {
    console.warn('[Auth] 로그인 성공 이력 저장 실패:', e);
  }
}

/**
 * 현재 로그인된 사용자의 소셜 플랫폼 식별자를 반환한다.
 * @param {object|null} user Firebase User 인스턴스
 * @returns {'google'|'kakao'|'naver'|null}
 */
export function getActiveAuthProvider(user = auth.currentUser) {
  if (!user) return null;

  const savedProvider = localStorage.getItem(AUTH_PROVIDER_STORAGE_KEY);
  if (savedProvider === 'google' || savedProvider === 'kakao' || savedProvider === 'naver') {
    return savedProvider;
  }

  const uid = user.uid || '';
  if (uid.startsWith('kakao:')) return 'kakao';
  if (uid.startsWith('naver:')) return 'naver';

  if (Array.isArray(user.providerData) && user.providerData.some((p) => p.providerId === 'google.com')) {
    return 'google';
  }

  const email = (user.email || '').toLowerCase();
  if (email.endsWith('@kakao.com')) return 'kakao';
  if (email.endsWith('@naver.com')) return 'naver';

  return 'google';
}

/**
 * 화면 표시용 마스킹 이메일 문자열을 반환한다.
 * 소셜 고유 ID로 자동 생성된 임시 이메일(예: 49443...@kakao.com)인 경우 혼동을 막기 위해 안내 문구를 반환한다.
 * @param {object|null} user Firebase User 인스턴스
 * @returns {string}
 */
export function formatUserEmailForDisplay(user = auth.currentUser) {
  if (!user || !user.email) return '';
  const rawEmail = user.email.trim();
  const parts = rawEmail.split('@');
  if (parts.length !== 2) return rawEmail;

  const [idPart, domainPart] = parts;
  const uid = user.uid || '';

  // 백엔드에서 이메일 미동의 시 생성한 임시 이메일({회원번호}@kakao.com, {id}@naver.com) 판별
  const isSyntheticKakao = domainPart.toLowerCase() === 'kakao.com' &&
    (uid === `kakao:${idPart}` || /^\d{8,}$/.test(idPart));
  const isSyntheticNaver = domainPart.toLowerCase() === 'naver.com' && uid === `naver:${idPart}`;

  if (isSyntheticKakao || isSyntheticNaver) {
    return '소셜 고유 계정 연동됨';
  }

  const keepLen = Math.ceil(idPart.length / 2);
  return `${idPart.substring(0, keepLen)}${'*'.repeat(idPart.length - keepLen)}@${domainPart}`;
}

// 페이지가 켜질 때 주소창에 로그인 코드가 있는지 확인
const urlParams = new URLSearchParams(window.location.search);
const authCode = urlParams.get('code');
const authState = urlParams.get('state');
const loginProvider = localStorage.getItem('login_provider');

if (authCode) {
  // 로그인 꼬리표를 발견했다면 즉시 로그인 처리 진행
  (async () => {
    const resolvedProvider = loginProvider === 'kakao' ? 'kakao' : 'naver';
    try {
      // 새로고침 시 1회용 코드 재사용(401 에러) 방지를 위해 즉시 주소창에서 꼬리표 지우기
      window.history.replaceState({}, document.title, window.location.pathname);

      const requestBody = { code: authCode, redirectUri: APP_BASE_URL };
      if (authState) requestBody.state = authState;

      const endpoint = resolvedProvider === 'kakao' ? ENDPOINTS.kakaoLogin : ENDPOINTS.naverLogin;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.firebaseToken) {
        localStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, resolvedProvider);
        recordLoginSuccess(resolvedProvider);
        await signInWithCustomToken(auth, data.firebaseToken);
        if (auth.currentUser) {
          await auth.currentUser.reload();
          await auth.currentUser.getIdToken(true);
        }
        if (data.emailNeedsAgreement) {
          localStorage.setItem('kakao_needs_email_scope', '1');
        } else {
          localStorage.removeItem('kakao_needs_email_scope');
        }
      } else {
        const providerName = resolvedProvider === 'kakao' ? '카카오' : '네이버';
        const errorDetail = data.error || data;
        console.error(`${resolvedProvider} 로그인 연동 오류 상세:`, JSON.stringify(errorDetail, null, 2));
        alert(`${providerName} 로그인 서버 통신 거절됨!\nF12 콘솔 창에서 상세 에러 코드를 확인하세요.`);
      }
    } catch (error) {
      console.error("리다이렉트 로그인 처리 실패:", error);
      alert("로그인 처리 중 통신 오류가 발생했습니다.");
    } finally {
      localStorage.removeItem('login_provider');
    }
  })();
}

/**
 * 인증 상태 변경 감시자 초기화
 */
export const initAuthObserver = (callback) => {
  onAuthStateChanged(auth, callback);
};

/**
 * 구글 계정을 이용한 팝업/리다이렉트 로그인 처리
 */
export const googleLogin = async (onSuccess) => {
  if (isLoginProcessing) return;
  isLoginProcessing = true;

  const ua = navigator.userAgent.toLowerCase();
  const isKakao = ua.indexOf('kakao') > -1;
  const isInstagram = ua.indexOf('instagram') > -1;
  const isLine = ua.indexOf('line') > -1;

  if (isKakao || isInstagram || isLine) {
    const currentUrl = window.location.href;

    if (ua.indexOf('android') > -1) {
      const urlNoProtocol = currentUrl.replace(/https?:\/\//, '');
      location.href = `intent://${urlNoProtocol}#Intent;scheme=https;package=com.android.chrome;end`;
      isLoginProcessing = false;
      return;
    } else if (isKakao) {
      location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(currentUrl);
      isLoginProcessing = false;
      return;
    } else {
      alert("보안을 위해 인앱 브라우저에서는 구글 로그인이 차단됩니다.\n\n우측 상단 버튼을 눌러 'Safari로 열기' 또는 '기본 브라우저로 열기'를 선택해 주세요.");
      isLoginProcessing = false;
      return;
    }
  }

  try {
    if (!auth || !auth.app || !auth.app.options || !auth.app.options.apiKey) {
      console.error("오류: 파이어베이스 auth 인스턴스 초기화 데이터 유실됨:", auth);
      alert("로그인 모듈 초기화 실패. 콘솔 창을 확인하세요.");
      return;
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    provider.addScope('https://www.googleapis.com/auth/userinfo.email');

    localStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, 'google');
    await signInWithPopup(auth, provider);
    recordLoginSuccess('google');

    if (onSuccess) onSuccess();
  } catch (error) {
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      localStorage.setItem(AUTH_PROVIDER_STORAGE_KEY, 'google');
      const provider = new GoogleAuthProvider();
      signInWithRedirect(auth, provider);
    } else {
      if (!auth.currentUser) localStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
      console.error(`[Login Error]`, error.code, error.message);
    }
  } finally {
    isLoginProcessing = false;
  }
};

/**
 * 카카오 로그인
 */
export const kakaoLogin = async () => {
  if (isLoginProcessing) return;
  isLoginProcessing = true;

  localStorage.setItem('login_provider', 'kakao');

  const redirectUri = APP_BASE_URL;
  const clientId = OAUTH_CLIENT_IDS.kakao;
  const scopeParam = localStorage.getItem('kakao_needs_email_scope') === '1' ? '&scope=account_email' : '';

  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}${scopeParam}`;
  window.location.href = kakaoAuthUrl;
};

/**
 * 네이버 로그인 구현
 */
export const naverLogin = async () => {
  if (isLoginProcessing) return;
  isLoginProcessing = true;

  localStorage.setItem('login_provider', 'naver');

  const redirectUri = APP_BASE_URL;
  const clientId = OAUTH_CLIENT_IDS.naver;
  const state = Math.random().toString(36).slice(2, 13);

  const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  window.location.href = naverAuthUrl;
};

/**
 * 로그아웃 및 게스트 모드 전환
 */
export const logoutUser = async (onSuccess) => {
  if (confirm("로그아웃 하시겠습니까? 게스트 모드로 전환됩니다.")) {
    try {
      localStorage.removeItem(AUTH_PROVIDER_STORAGE_KEY);
      await signOut(auth);
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) overlay.remove();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  }
};
