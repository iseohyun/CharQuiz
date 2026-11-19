/**
 * @file components/sister-apps.js
 * @description QuizQuiz 자매품(퀴즈 앱) 링크. 목록은 Firestore 의 quiz_apps 컬렉션에 두고, 알림함 맨 위에 이 앱을 뺀 나머지를 보여 준다.
 * 새 퀴즈 앱을 내면 앱 코드는 고치지 않고 quiz_apps 에 문서 하나만 더한다(콘솔, 관리자).
 *   quiz_apps/{id} = { id, name, desc, url, icon, order, active }
 * 마지막으로 받은 목록은 기기에 저장해 두고 먼저 그린 뒤 새로 받아 고친다. 한 번도 못 받았으면 아래 기본 목록을 쓴다.
 */

import { db } from './firebase-config.js';
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const CURRENT_APP = 'CharQuiz';
const CACHE_KEY = 'QUIZQUIZ_SISTER_APPS';

const FALLBACK_APPS = [
  { id: 'CharQuiz', name: '글자 퀴즈', desc: '히라가나·가타카나·한글·영문을 소리로', url: 'https://iseohyun.github.io/CharQuiz/', order: 1, active: true },
  { id: 'NameQuiz', name: '캐릭터 퀴즈', desc: '산리오·티니핑 캐릭터 이름 맞히기', url: 'https://iseohyun.github.io/NameQuiz/', order: 2, active: true },
  { id: 'CountryQuiz', name: '나라 퀴즈', desc: '세계지도로 익히는 나라·수도·국기 퀴즈', url: 'https://iseohyun.github.io/CountryQuiz/', order: 3, active: true }
];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function readCache() {
  try {
    const list = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function writeCache(list) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list));
  } catch {
    /* 무시 */
  }
}

/** 보여 줄 앱: 켜져 있고(active), 이 앱이 아니며, https 주소인 것. order 순 */
function othersOf(list) {
  return list
    .filter((app) => app && app.active !== false && app.id !== CURRENT_APP && /^https:\/\//.test(app.url || ''))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function renderList(slot, list) {
  const others = othersOf(list);
  slot.hidden = others.length === 0;
  slot.innerHTML = others.length ? `
    <span class="sister-apps-title">QuizQuiz 자매품</span>
    <div class="sister-apps-list">
      ${others.map((app) => `
        <a class="sister-app" href="${escapeHtml(app.url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(app.icon || app.url + 'icon-192.png')}" alt="" width="36" height="36" loading="lazy">
          <span class="sister-app-text"><strong>${escapeHtml(app.name)}</strong><small>${escapeHtml(app.desc || '')}</small></span>
          <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
        </a>`).join('')}
    </div>` : '';
}

/** 알림함에 넣을 자리. 그린 뒤 hydrateSisterApps(알림함) 로 채운다 */
export function renderSisterAppsHtml() {
  return '<div class="sister-apps" data-sister-apps></div>';
}

/** 저장해 둔 목록으로 먼저 그리고, Firestore 에서 새로 받아 다시 그린다 */
export async function hydrateSisterApps(root) {
  const slot = root.querySelector('[data-sister-apps]');
  if (!slot) return;
  renderList(slot, readCache() || FALLBACK_APPS);
  try {
    const snap = await getDocs(collection(db, 'quiz_apps'));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!list.length) return;
    writeCache(list);
    if (slot.isConnected) renderList(slot, list);
  } catch (error) {
    console.warn('[SisterApps] 자매품 목록을 받지 못해 저장해 둔 목록을 씁니다:', error?.code || error);
  }
}
