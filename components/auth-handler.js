/**
 * @file components/auth-handler.js
 * @description 사용자 OAuth 인증(Google, Kakao, Naver) 및 로그인/게스트 세션 상태 관리 모듈
 */
import { auth } from './firebase-config.js';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";

let isLoginProcessing = false;

// 페이지가 켜질 때 주소창에 로그인 코드가 있는지 확인
const urlParams = new URLSearchParams(window.location.search);
const authCode = urlParams.get('code');
const loginProvider = localStorage.getItem('login_provider');

if (authCode) {
  // 로그인 꼬리표를 발견했다면 즉시 로그인 처리 진행!
  (async () => {
    try {
      // 새로고침 시 1회용 코드 재사용(401 에러) 방지를 위해 즉시 주소창에서 꼬리표 지우기
      window.history.replaceState({}, document.title, window.location.pathname);

      let endpoint = 'https://naverlogin-kw55rtsoba-uc.a.run.app';
      let requestBody = { code: authCode };

      // 카카오 로그인일 경우 요청 주소와 파라미터 변경
      if (loginProvider === 'kakao') {
        endpoint = 'https://kakaologin-kw55rtsoba-uc.a.run.app';

        let redirectUri = "https://iseohyun.com/small-project/CharQuiz/";
        if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
          redirectUri = "http://127.0.0.1:5500/small-project/CharQuiz/";
        }
        requestBody.redirectUri = redirectUri;
      }

      // 내 서버로 코드 보내서 파이어베이스 커스텀 토큰 받아오기
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.firebaseToken) {
        // 파이어베이스 로그인 완료
        await signInWithCustomToken(auth, data.firebaseToken);
      } else {
        const providerName = loginProvider === 'kakao' ? '카카오' : '네이버';
        const errorDetail = data.error || data;
        console.error(`${loginProvider} 로그인 연동 오류 상세:`, JSON.stringify(errorDetail, null, 2));
        alert(`${providerName} 로그인 서버 통신 거절됨!\nF12 콘솔 창에서 상세 KOE 에러 코드를 확인하세요.`);
      }
    } catch (error) {
      console.error("리다이렉트 로그인 처리 실패:", error);
      alert("로그인 처리 중 통신 오류가 발생했습니다.");
    } finally {
      // 로그인 시도 종료 후 출처 기록 지우기
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

  // 인앱 브라우저 감지 및 외부 브라우저 강제 유도 (구글 로그인 정책 대응)
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

    await signInWithPopup(auth, provider);

    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();

    if (onSuccess) onSuccess();

  } catch (error) {
    // 팝업이 차단된 일반 모바일 브라우저(사파리 등) 대응을 위한 리다이렉트 방식 전환
    if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
      const provider = new GoogleAuthProvider();
      signInWithRedirect(auth, provider);
    } else {
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

  // 실서버 주소를 기본으로 하되, 로컬 테스트 환경일 경우 로컬 주소 사용
  let redirectUri = "https://iseohyun.com/small-project/CharQuiz/";
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    redirectUri = "http://127.0.0.1:5500/small-project/CharQuiz/";
  }

  const clientId = "af28f94aa8260ab663fd27dffea1ee77";

  // 카카오 로그인창으로 이동
  const kakaoAuthUrl = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;

  window.location.href = kakaoAuthUrl;
};

/**
 * 네이버 로그인 구현
 */
export const naverLogin = async () => {
  if (isLoginProcessing) return;
  isLoginProcessing = true;

  // 리다이렉트 반환 시 출처를 네이버로 식별
  localStorage.setItem('login_provider', 'naver');

  // 실서버 주소를 기본으로 하되, 로컬 테스트 환경일 경우 로컬 주소 사용
  let redirectUri = "https://iseohyun.com/small-project/CharQuiz/";
  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    redirectUri = "http://127.0.0.1:5500/small-project/CharQuiz/";
  }

  const clientId = "hemXaBshyStfBhmNg05m";
  const state = Math.random().toString(36).substr(2, 11);

  // 네이버 로그인창으로 이동
  const naverAuthUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  window.location.href = naverAuthUrl;
};

/**
 * 로그아웃 및 게스트 모드 전환
 */
export const logoutUser = async (onSuccess) => {
  if (confirm("로그아웃 하시겠습니까? 게스트 모드로 전환됩니다.")) {
    try {
      await signOut(auth);
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("로그아웃 중 오류 발생:", error);
    }
  }
};