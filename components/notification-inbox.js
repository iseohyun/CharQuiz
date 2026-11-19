/**
 * @file components/notification-inbox.js
 * @description 알림함. 받은 복습 알림을 기기의 IndexedDB 에 쌓아 두고 설정 화면의 알림함 아이콘에서 목록으로 보여 준다.
 *
 * 알림은 두 곳에서 들어온다.
 *  - 앱이 뒤에 있을 때: firebase-messaging-sw.js 가 같은 DB 에 적고 열린 창에 'charquiz-inbox-updated' 를 보낸다.
 *  - 앱이 앞에 있을 때: notification-handler.js 가 알림을 띄우면서 addInboxItem 을 부른다.
 * DB 이름·저장소·필드는 서비스 워커와 같아야 한다.
 * 읽지 않은 수가 바뀌면 window 에 'charquiz-inbox-changed'(detail.unread)를 보낸다(설정 톱니의 new 점이 듣는다).
 */
import { renderSisterAppsHtml } from './sister-apps.js';
import { renderInstallRowHtml } from './install-prompt.js';

const DB_NAME = 'charquiz-inbox';
const STORE = 'items';
const MAX_ITEMS = 50;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function openInboxDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB 미지원'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const dbi = req.result;
      if (!dbi.objectStoreNames.contains(STORE)) {
        dbi.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function runTx(mode, work) {
  return openInboxDb().then((dbi) => new Promise((resolve, reject) => {
    const tx = dbi.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    Promise.resolve(work(store)).then((r) => { result = r; });
    tx.oncomplete = () => { dbi.close(); resolve(result); };
    tx.onerror = () => { dbi.close(); reject(tx.error); };
  }));
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** 새 알림을 적는다. 오래된 것은 MAX_ITEMS 개만 남기고 지운다. */
export async function addInboxItem({ title, body }) {
  try {
    await runTx('readwrite', async (store) => {
      store.add({ title: String(title || ''), body: String(body || ''), receivedAt: Date.now(), read: false });
      const items = await getAll(store);
      items.sort((a, b) => b.receivedAt - a.receivedAt).slice(MAX_ITEMS).forEach((old) => store.delete(old.id));
    });
  } catch (error) {
    console.warn('[Inbox] 알림을 알림함에 적지 못했습니다:', error);
  }
  updateInboxBadge();
}

/** 최근 것이 위로 오는 알림 목록. */
export async function listInboxItems() {
  try {
    const items = await runTx('readonly', (store) => getAll(store));
    return items.sort((a, b) => b.receivedAt - a.receivedAt);
  } catch (error) {
    console.warn('[Inbox] 알림함을 읽지 못했습니다:', error);
    return [];
  }
}

async function markAllRead() {
  try {
    await runTx('readwrite', async (store) => {
      const items = await getAll(store);
      items.filter((it) => !it.read).forEach((it) => store.put({ ...it, read: true }));
    });
  } catch (error) {
    console.warn('[Inbox] 읽음 표시 실패:', error);
  }
}

async function clearInbox() {
  try {
    await runTx('readwrite', (store) => store.clear());
  } catch (error) {
    console.warn('[Inbox] 알림함 비우기 실패:', error);
  }
}

/** 읽지 않은 알림 수를 모든 .inbox-unread-badge 에 적고 'charquiz-inbox-changed' 를 보낸다. */
export async function updateInboxBadge() {
  const unread = (await listInboxItems()).filter((it) => !it.read).length;
  document.querySelectorAll('.inbox-unread-badge').forEach((badge) => {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.hidden = unread === 0;
  });
  window.dispatchEvent(new CustomEvent('charquiz-inbox-changed', { detail: { unread } }));
  return unread;
}

function formatReceivedAt(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return sameDay ? `오늘 ${time}` : `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/**
 * 알림함 창을 연다. 열면 모두 읽음으로 바뀐다.
 * @param {{onStartStudy?: Function}} options
 */
export async function openInboxModal({ onStartStudy } = {}) {
  document.querySelector('.inbox-overlay')?.remove();
  const items = await listInboxItems();

  const overlay = document.createElement('div');
  overlay.className = 'inbox-overlay';
  const rows = items.map((it) => `
    <li class="inbox-item${it.read ? '' : ' unread'}">
      <div class="inbox-item-head">
        <strong class="inbox-item-title">${escapeHtml(it.title)}</strong>
        <span class="inbox-item-time">${escapeHtml(formatReceivedAt(it.receivedAt))}</span>
      </div>
      <p class="inbox-item-body">${escapeHtml(it.body)}</p>
    </li>
  `).join('');

  overlay.innerHTML = `
    <div class="inbox-card" role="dialog" aria-label="알림함">
      <div class="inbox-header">
        <h4>🔔 알림함</h4>
        <button type="button" class="inbox-close" aria-label="닫기">&times;</button>
      </div>
      ${renderInstallRowHtml()}
      ${renderSisterAppsHtml()}
      <ul class="inbox-list">${rows || '<li class="inbox-empty">받은 알림이 없어요. 학습을 마치면 복습할 때를 알려 드려요.</li>'}</ul>
      <div class="inbox-actions">
        ${items.length ? '<button type="button" class="inbox-clear">모두 지우기</button>' : ''}
        <button type="button" class="inbox-study">지금 복습하기</button>
      </div>
    </div>
  `;
  overlay.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (e.target === overlay || e.target.closest('.inbox-close')) {
      overlay.remove();
    } else if (e.target.closest('.inbox-clear')) {
      if (!confirm('알림함을 모두 비울까요?')) return;
      await clearInbox();
      overlay.remove();
      await updateInboxBadge();
      openInboxModal({ onStartStudy });
    } else if (e.target.closest('.inbox-study')) {
      overlay.remove();
      onStartStudy?.();
    }
  });
  document.body.appendChild(overlay);

  await markAllRead();
  updateInboxBadge();
}

/**
 * 알림함 연결. 서비스 워커의 알림 소식, 알림을 눌러 연 경우(?inbox=1), 화면 복귀 때 배지 갱신.
 */
export function initNotificationInbox({ onStartStudy } = {}) {
  updateInboxBadge();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      const type = event.data?.type;
      if (type === 'charquiz-inbox-updated') updateInboxBadge();
      if (type === 'charquiz-open-inbox') openInboxModal({ onStartStudy });
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') updateInboxBadge();
  });

  const params = new URLSearchParams(location.search);
  if (params.get('inbox') === '1') {
    params.delete('inbox');
    const rest = params.toString();
    history.replaceState(null, '', `${location.pathname}${rest ? `?${rest}` : ''}${location.hash}`);
    openInboxModal({ onStartStudy });
  }
}
