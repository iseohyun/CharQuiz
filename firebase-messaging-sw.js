/**
 * @file firebase-messaging-sw.js
 * @description 백그라운드 푸시 알림 수신 상시 상주형 서비스 워커
 */

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// 격리 스레드 구동을 위한 독자 초기화 설정
firebase.initializeApp({
  apiKey: "AIzaSyAfMHh3VuyqT6YJ5gK7rNGuHzEgWR8Fsuc",
  authDomain: "quizquiz-quiz.firebaseapp.com",
  projectId: "quizquiz-quiz",
  storageBucket: "quizquiz-quiz.firebasestorage.app",
  messagingSenderId: "47580752278",
  appId: "1:47580752278:web:8d823880e319c0fc1615b7"
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
  // 앱이 열려 있을 때 쓰는 components/notification-handler.js 의 showReviewNotification 과 모양을 맞춘다
  const notificationOptions = {
    body: payload?.notification?.body || payload?.data?.body || '지금이 복습하기 가장 좋은 타이밍입니다!',
    icon: new URL('icon-192.png', self.registration.scope).href,
    tag: 'review-reminder',
    renotify: true
  };

  return Promise.all([
    self.registration.showNotification(notificationTitle, notificationOptions),
    saveToInbox(notificationTitle, notificationOptions.body)
  ]);
});

// 알림함: components/notification-inbox.js 와 같은 DB·저장소·필드를 쓴다
const INBOX_DB = 'charquiz-inbox';
const INBOX_STORE = 'items';
const INBOX_MAX_ITEMS = 50;

function saveToInbox(title, body) {
  return new Promise((resolve) => {
    const req = indexedDB.open(INBOX_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(INBOX_STORE)) {
        req.result.createObjectStore(INBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const dbi = req.result;
      const tx = dbi.transaction(INBOX_STORE, 'readwrite');
      const store = tx.objectStore(INBOX_STORE);
      store.add({ title: String(title || ''), body: String(body || ''), receivedAt: Date.now(), read: false });
      const all = store.getAll();
      all.onsuccess = () => {
        (all.result || [])
          .sort((a, b) => b.receivedAt - a.receivedAt)
          .slice(INBOX_MAX_ITEMS)
          .forEach((old) => store.delete(old.id));
      };
      tx.oncomplete = async () => {
        dbi.close();
        const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        windowClients.forEach((client) => client.postMessage({ type: 'charquiz-inbox-updated' }));
        resolve();
      };
      tx.onerror = () => { dbi.close(); resolve(); };
    };
  });
}

// 알림 클릭 시 이미 열린 CharQuiz 창이 있으면 알림함을 열게 하고 포커스, 없으면 서비스 워커 scope(= 앱 기준 URL)를
// 알림함을 여는 표시(?inbox=1)와 함께 새로 연다. scope 를 쓰므로 서비스 경로가 바뀌어도 수정할 필요가 없다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.registration.scope;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = windowClients.find((client) => client.url.startsWith(targetUrl));
    if (existingClient) {
      existingClient.postMessage({ type: 'charquiz-open-inbox' });
      return existingClient.focus();
    }
    return self.clients.openWindow(`${targetUrl}?inbox=1`);
  })());
});
