/**
 * @file firebase-messaging-sw.js
 * @description 백그라운드 푸시 알림 수신 상시 상주형 서비스 워커
 */

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 격리 스레드 구동을 위한 독자 초기화 설정
firebase.initializeApp({
  apiKey: "AIzaSyAm1BiqPabnh0X-FLxctRUAoRWbd9OrdlI",
  authDomain: "kana-loop.firebaseapp.com",
  projectId: "kana-loop",
  storageBucket: "kana-loop.firebasestorage.app",
  messagingSenderId: "566732000404",
  appId: "1:566732000404:web:07c9fefe1727f863bd3881"
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const messaging = firebase.messaging();

// 백그라운드 알림 수신 리스너
messaging.onBackgroundMessage((payload) => {
  console.log('[Service Worker] 백그라운드 푸시 수신:', payload);

  const notificationTitle = payload?.notification?.title || payload?.data?.title || '🧠 CharQuiz 복습 알림';
  const notificationOptions = {
    body: payload?.notification?.body || payload?.data?.body || '지금이 복습하기 가장 좋은 타이밍입니다!',
    tag: 'review-reminder',
    renotify: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
