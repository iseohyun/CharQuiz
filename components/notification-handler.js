/**
 * @file components/notification-handler.js
 * @description PWA 백그라운드 푸시 알림 권한 획득 및 백엔드(Cloud Run) 연동 예약 발송 모듈
 */

import { messaging } from './firebase-config.js';
import { getToken } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

let fcmToken = null;

// 백엔드 Cloud Run 엔드포인트 베이스 URL
const CLOUD_RUN_BASE_URL = "https://schedulenotification-kw55rtsoba-uc.a.run.app";

/**
 * 브라우저 푸시 알림 권한 요청 및 FCM 토큰 수급
 */
export async function requestNotificationPermission() {
  try {
    if (!('Notification' in window)) {
      console.log('이 브라우저는 알림을 지원하지 않습니다.');
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('사용자가 알림 권한을 거부했습니다.');
      return null;
    }

    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.register('./firebase-messaging-sw.js', { scope: './' });
      const readyRegistration = await navigator.serviceWorker.ready;
      console.log('서비스 워커 준비 완료:', readyRegistration);

      fcmToken = await getToken(messaging, {
        serviceWorkerRegistration: readyRegistration,
        vapidKey: 'BCsz-FURaLXuyEgWJ5opmzZ2bk8oBACk7pGXouwVF71PlrK-XA-z95QuGNBPqHCi9ppaUD66UGQ79bf2ozcqjpg'
      });
      console.log('FCM Token 갱신 완료:', fcmToken);
      return fcmToken;
    }
  } catch (error) {
    console.error('푸시 알림 토큰 획득 실패:', error);
  }
  return null;
}

/**
 * 특정 분(minute) 뒤에 유저 스마트폰/PC로 복습 알림 예약 발송 요청
 * @param {string} domain - 'hira', 'kata' 등 현재 복습 카테고리
 * @param {number} delayMinutes - 몇 분 뒤에 알림을 보낼지 (예: 10, 30, 120)
 */
export async function scheduleReviewNotification(domain, delayMinutes) {
  if (!fcmToken) {
    await requestNotificationPermission();
    if (!fcmToken) return;
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
