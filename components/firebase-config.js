/**
 * @file components/firebase-config.js
 * @description Firebase App, Auth, Firestore, Cloud Messaging 인스턴스 초기화 및 내보내기 모듈
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfMHh3VuyqT6YJ5gK7rNGuHzEgWR8Fsuc",
  authDomain: "quizquiz-quiz.firebaseapp.com",
  projectId: "quizquiz-quiz",
  storageBucket: "quizquiz-quiz.firebasestorage.app",
  messagingSenderId: "47580752278",
  appId: "1:47580752278:web:8d823880e319c0fc1615b7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);
