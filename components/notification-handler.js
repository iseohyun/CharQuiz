/**
 * @file components/notification-handler.js
 * @description PWA 백그라운드 푸시 알림 권한 획득 및 백엔드(Cloud Run) 연동 예약 발송 모듈
 *
 * 권한 요청은 반드시 사용자가 누른 버튼 안에서만 한다(requestNotificationPermission).
 * 홈 화면에 설치한 아이폰 앱은 사용자 동작 없이 권한을 물을 수 없고, 안드로이드 Chrome도
 * 페이지를 열자마자 묻는 요청은 조용히 막는다. 앱을 열 때는 이미 허용된 경우에만
 * 토큰을 조용히 받아 둔다(initNotificationToken).
 */

import { messaging } from './firebase-config.js';
import { ENDPOINTS, FCM_VAPID_KEY } from './app-config.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

let fcmToken = null;

// 백엔드 Cloud Run 엔드포인트 (app-config.js 에서 관리)
const CLOUD_RUN_BASE_URL = ENDPOINTS.scheduleNotification;

function isPushSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

function isIosBrowserTab() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return isIos && !isStandalone;
}

/**
 * 현재 알림 상태
 * @returns {'granted'|'default'|'denied'|'ios-install-required'|'unsupported'}
 */
export function getNotificationState() {
  if (!isPushSupported()) {
    return isIosBrowserTab() ? 'ios-install-required' : 'unsupported';
  }
  return Notification.permission;
}

/**
 * 권한이 이미 허용된 상태에서 서비스 워커를 등록하고 FCM 토큰을 받는다. 권한을 묻지 않는다.
 */
async function acquireToken() {
  if (!isPushSupported() || Notification.permission !== 'granted') return null;
  try {
    await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './' });
    const readyRegistration = await navigator.serviceWorker.ready;
    fcmToken = await getToken(messaging, {
      serviceWorkerRegistration: readyRegistration,
      vapidKey: FCM_VAPID_KEY
    });
    console.log('[Notify] FCM 토큰 준비 완료');
    return fcmToken;
  } catch (error) {
    console.error('[Notify] 푸시 알림 토큰 획득 실패:', error);
    return null;
  }
}

/**
 * 앱 시작 시 호출. 이미 허용된 경우에만 토큰을 조용히 받아 둔다.
 */
export async function initNotificationToken() {
  if (getNotificationState() === 'granted') {
    await acquireToken();
  }
}

/**
 * 사용자가 누른 버튼의 클릭 처리기 안에서만 부른다.
 * Notification.requestPermission() 앞에 await 를 두면 아이폰에서 사용자 동작으로 인정되지 않으므로
 * 가장 먼저 호출한다.
 * @returns {Promise<string|null>} 받은 토큰, 실패하면 null
 */
export async function requestNotificationPermission() {
  if (!isPushSupported()) return null;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('[Notify] 사용자가 알림 권한을 허용하지 않았습니다:', permission);
    return null;
  }
  return acquireToken();
}

/**
 * 특정 분(minute) 뒤에 유저 스마트폰/PC로 복습 알림 예약 발송 요청.
 * 권한이 없으면 묻지 않고 건너뛴다(사용자 동작 밖에서 불리기 때문).
 * @param {string} domain - 'hira', 'kata' 등 현재 복습 카테고리
 * @param {number} delayMinutes - 몇 분 뒤에 알림을 보낼지 (예: 10, 30, 120)
 */
export async function scheduleReviewNotification(domain, delayMinutes) {
  if (!fcmToken) {
    await acquireToken();
    if (!fcmToken) {
      console.log('[Notify] 알림이 꺼져 있어 복습 알림을 예약하지 않습니다.');
      return;
    }
  }

  const categoryName = domain === 'hira' ? '히라가나' : domain === 'kata' ? '가타카나' : '가나';

  // 백엔드 Cloud Tasks에서 인식 가능한 ISO 표준 타임스탬프 문자열 생성
  const delayMs = delayMinutes * 60 * 1000;
  const targetDate = new Date(Date.now() + delayMs);
  const targetTimeIso = targetDate.toISOString();

  const displayTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  try {
    const response = await fetch(CLOUD_RUN_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        title: '🧠 뇌과학 복습 타이머 가동!',
        body: `지금이 '${categoryName}'을 망각하기 직전 최고의 타이밍입니다. 들어와서 고정하세요.`,
        scheduleTime: targetTimeIso
      })
    });

    if (response.ok) {
      console.log(`[알림 예약] ${delayMinutes}분 뒤 복습 푸시 큐 등록 완료 (예정 시각: ${displayTime})`);
    } else {
      console.error('서버 에러 응답:', await response.text());
    }
  } catch (error) {
    console.error('푸시 알림 예약 서버 통신 실패:', error);
  }
}
