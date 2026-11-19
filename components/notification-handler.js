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
import { getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";
import { addInboxItem } from './notification-inbox.js';

let fcmToken = null;
let foregroundListenerBound = false;

const LAST_REMINDER_KEY = 'CHARQUIZ_LAST_REMINDER';
const SCHEDULE_TIMEOUT_MS = 15000;

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
    bindForegroundMessages();
    return fcmToken;
  } catch (error) {
    console.error('[Notify] 푸시 알림 토큰 획득 실패:', error);
    return null;
  }
}

/**
 * 앱이 화면에 떠 있으면 Firebase는 알림을 띄우지 않고 메시지를 이 화면으로 넘긴다.
 * 받는 곳이 없으면 메시지가 버려지므로, 여기서 받아 서비스 워커와 같은 모양의 알림으로 띄운다.
 */
function bindForegroundMessages() {
  if (foregroundListenerBound) return;
  foregroundListenerBound = true;
  onMessage(messaging, (payload) => {
    showReviewNotification(payload).catch((error) => {
      console.error('[Notify] 앱 화면에서 알림 표시 실패:', error);
    });
  });
}

/**
 * firebase-messaging-sw.js 의 onBackgroundMessage 와 같은 제목·본문·아이콘·tag 로 알림을 띄운다.
 * @param {{notification?: {title?: string, body?: string}, data?: {title?: string, body?: string}}} payload
 */
async function showReviewNotification(payload) {
  const registration = await navigator.serviceWorker.ready;
  const title = payload?.notification?.title || payload?.data?.title || '🧠 CharQuiz 복습 알림';
  const body = payload?.notification?.body || payload?.data?.body || '지금이 복습하기 가장 좋은 타이밍입니다!';
  addInboxItem({ title, body });
  await registration.showNotification(title, {
    body,
    icon: new URL('icon-192.png', registration.scope).href,
    tag: 'review-reminder',
    renotify: true
  });
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
      if (getNotificationState() === 'granted') {
        // 권한은 켜져 있는데 토큰을 못 받았다 = 구글 알림 서버에 닿지 못했다
        recordReminderResult({ ok: false, reason: 'token' });
      } else {
        console.log('[Notify] 알림이 꺼져 있어 복습 알림을 예약하지 않습니다.');
      }
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
      // 연결이 멈춘 채로 끝나지 않는 일을 막는다
      signal: AbortSignal.timeout(SCHEDULE_TIMEOUT_MS),
      body: JSON.stringify({
        token: fcmToken,
        title: '🧠 뇌과학 복습 타이머 가동!',
        body: `지금이 '${categoryName}'을 망각하기 직전 최고의 타이밍입니다. 들어와서 고정하세요.`,
        scheduleTime: targetTimeIso
      })
    });

    if (response.ok) {
      console.log(`[알림 예약] ${delayMinutes}분 뒤 복습 푸시 큐 등록 완료 (예정 시각: ${displayTime})`);
      recordReminderResult({ ok: true, dueAt: targetDate.getTime() });
    } else {
      console.error('[Notify] 예약 서버 에러 응답:', response.status, await response.text());
      recordReminderResult({ ok: false, reason: 'server' });
    }
  } catch (error) {
    console.error('[Notify] 푸시 알림 예약 서버 통신 실패:', error);
    recordReminderResult({ ok: false, reason: 'network' });
  }
}

/**
 * 마지막 예약 결과를 남긴다. 설정 화면에서 보여 주어, 예약이 조용히 실패해도 알 수 있게 한다.
 * @param {{ok: boolean, dueAt?: number, reason?: 'token'|'server'|'network'}} result
 */
function recordReminderResult(result) {
  if (!result.ok) console.warn('[Notify] 복습 알림 예약 실패:', result.reason);
  try {
    localStorage.setItem(LAST_REMINDER_KEY, JSON.stringify({ ...result, at: Date.now() }));
  } catch (_) { /* 저장소를 못 쓰는 환경에서는 기록만 생략 */ }
}

/**
 * 마지막 복습 알림 예약 결과. 기록이 없으면 null.
 * @returns {{ok: boolean, at: number, dueAt?: number, reason?: string}|null}
 */
export function getLastReminderResult() {
  try {
    return JSON.parse(localStorage.getItem(LAST_REMINDER_KEY) || 'null');
  } catch (_) {
    return null;
  }
}
