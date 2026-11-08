/**
 * @file components/firebase-config.js
 * @description Firebase App, Auth, Firestore, Cloud Messaging 인스턴스 초기화 및 내보내기 모듈
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAm1BiqPabnh0X-FLxctRUAoRWbd9OrdlI",
  authDomain: "kana-loop.firebaseapp.com",
  projectId: "kana-loop",
  storageBucket: "kana-loop.firebasestorage.app",
  messagingSenderId: "566732000404",
  appId: "1:566732000404:web:07c9fefe1727f863bd3881",
  measurementId: "G-QJRHXDT7E4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);
