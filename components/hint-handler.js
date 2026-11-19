/**
 * @file components/hint-handler.js
 * @description 글자 힌트(연상법). 기본 힌트(hint-seeds.js)와 로그인 사용자가 올린 힌트를 합쳐 보여 주고,
 * 사용자 힌트의 등록·수정·삭제, 따봉, 따봉을 받은 사용자 순위(명예의 전당)를 맡는다.
 * NameQuiz/components/hint-handler.js 와 같은 구조이며 컬렉션과 열쇠(글자)만 다르다.
 *
 * Firestore
 *  - char_hints/{charKey}__{uid}          사용자 한 명이 글자 하나에 올린 힌트(한 개만)
 *      { charKey, domain, char, uid, authorName, text, likeCount, rev, createdAt, updatedAt }
 *  - char_hint_likes/{hintId}__{rev}__{uid} 따봉 한 개
 *      { hintId, rev, uid, charKey, createdAt }
 *  rev 는 힌트를 새로 만들 때마다 바뀐다. 지웠다가 다시 올린 힌트에는 예전 따봉이 이어지지 않는다.
 *  규칙은 firestore.rules 의 char_hints, char_hint_likes 에 있다.
 */

import { db, auth } from './firebase-config.js';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getSeedHint } from './hint-seeds.js';

const HINTS_COLLECTION = 'char_hints';
const LIKES_COLLECTION = 'char_hint_likes';
export const HINT_MAX_LENGTH = 80;
const HALL_OF_FAME_SIZE = 20;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function buildCharKey(domain, charText) {
  return `${domain}__${charText}`;
}

function buildHintId(charKey, uid) {
  return `${charKey}__${uid}`;
}

function buildLikeId(hintId, rev, uid) {
  return `${hintId}__${rev}__${uid}`;
}

function createRev() {
  return Math.random().toString(36).slice(2, 10);
}

function getCurrentAuthorName() {
  let name = document.getElementById('profile-name')?.innerText
    || auth.currentUser?.displayName
    || '이름 없음';
  if (name.includes('(')) name = name.split('(')[0].trim();
  return name.slice(0, 30) || '이름 없음';
}

/**
 * 글자의 사용자 힌트 목록. 따봉 많은 순, 같으면 최근에 고친 순.
 * @returns {Promise<Array<{id,uid,authorName,text,likeCount,rev,likedByMe,isMine}>>}
 */
export async function fetchUserHints(domain, charText) {
  const charKey = buildCharKey(domain, charText);
  const uid = auth.currentUser?.uid || null;

  const hintSnap = await getDocs(query(collection(db, HINTS_COLLECTION), where('charKey', '==', charKey)));
  const likedIds = new Set();
  if (uid) {
    try {
      const likeSnap = await getDocs(query(
        collection(db, LIKES_COLLECTION),
        where('uid', '==', uid),
        where('charKey', '==', charKey)
      ));
      likeSnap.forEach((d) => likedIds.add(d.id));
    } catch (error) {
      console.warn('[Hint] 내 따봉 목록을 읽지 못했습니다:', error?.code || error);
    }
  }

  const hints = [];
  hintSnap.forEach((d) => {
    const data = d.data();
    if (!data.text) return;
    hints.push({
      id: d.id,
      uid: data.uid,
      authorName: data.authorName || '이름 없음',
      text: data.text,
      likeCount: Number(data.likeCount) || 0,
      rev: data.rev || '',
      updatedAt: Number(data.updatedAt) || 0,
      likedByMe: likedIds.has(buildLikeId(d.id, data.rev || '', uid)),
      isMine: Boolean(uid && data.uid === uid)
    });
  });

  hints.sort((a, b) => (b.likeCount - a.likeCount) || (b.updatedAt - a.updatedAt));
  return hints;
}

export async function saveMyHint(domain, charText, rawText) {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  const text = String(rawText || '').trim().slice(0, HINT_MAX_LENGTH);
  if (!text) throw new Error('힌트 내용을 입력해 주세요.');

  const charKey = buildCharKey(domain, charText);
  const hintRef = doc(db, HINTS_COLLECTION, buildHintId(charKey, user.uid));
  const now = Date.now();
  const existing = (await fetchUserHints(domain, charText)).find((h) => h.isMine);

  if (existing) {
    await updateDoc(hintRef, { text, authorName: getCurrentAuthorName(), updatedAt: now });
  } else {
    await setDoc(hintRef, {
      charKey,
      domain,
      char: charText,
      uid: user.uid,
      authorName: getCurrentAuthorName(),
      text,
      likeCount: 0,
      rev: createRev(),
      createdAt: now,
      updatedAt: now
    });
  }
}

export async function deleteMyHint(domain, charText) {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다.');
  const charKey = buildCharKey(domain, charText);
  await deleteDoc(doc(db, HINTS_COLLECTION, buildHintId(charKey, user.uid)));
}

/**
 * 따봉을 누르거나 취소한다. 따봉 문서와 힌트의 likeCount 를 한 번에 바꾼다.
 */
export async function toggleHintLike(hint, charKey) {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인하면 따봉을 누를 수 있어요.');
  if (hint.uid === user.uid) throw new Error('내 힌트에는 따봉을 누를 수 없어요.');

  const hintRef = doc(db, HINTS_COLLECTION, hint.id);
  const likeRef = doc(db, LIKES_COLLECTION, buildLikeId(hint.id, hint.rev, user.uid));
  const batch = writeBatch(db);
  if (hint.likedByMe) {
    batch.delete(likeRef);
    batch.update(hintRef, { likeCount: increment(-1) });
  } else {
    batch.set(likeRef, { hintId: hint.id, rev: hint.rev, uid: user.uid, charKey, createdAt: Date.now() });
    batch.update(hintRef, { likeCount: increment(1) });
  }
  await batch.commit();
}

/**
 * 명예의 전당: 사용자별로 받은 따봉 합계.
 * @returns {Promise<Array<{uid, name, totalLikes, hintCount}>>}
 */
export async function getHintHallOfFame() {
  const snap = await getDocs(query(
    collection(db, HINTS_COLLECTION),
    where('likeCount', '>', 0),
    orderBy('likeCount', 'desc'),
    limit(500)
  ));
  const byUser = new Map();
  snap.forEach((d) => {
    const data = d.data();
    const entry = byUser.get(data.uid) || { uid: data.uid, name: data.authorName || '이름 없음', totalLikes: 0, hintCount: 0, latest: 0 };
    entry.totalLikes += Number(data.likeCount) || 0;
    entry.hintCount += 1;
    if ((Number(data.updatedAt) || 0) > entry.latest) {
      entry.latest = Number(data.updatedAt) || 0;
      entry.name = data.authorName || entry.name;
    }
    byUser.set(data.uid, entry);
  });
  return [...byUser.values()]
    .sort((a, b) => (b.totalLikes - a.totalLikes) || (b.hintCount - a.hintCount))
    .slice(0, HALL_OF_FAME_SIZE);
}

/* ==========================================================================
   화면
   ========================================================================== */

/**
 * 힌트 목록 창. 맨 위에 내 힌트(없으면 올리기 칸), 그 아래 다른 힌트를 따봉 많은 순으로.
 * 기본 힌트는 따봉 0개로 치고, 따봉이 같으면 사용자 힌트보다 앞에 둔다.
 * @param {{onChange?: Function, onClose?: Function}} options
 */
export async function openHintListModal(domain, charText, { onChange, onClose } = {}) {
  document.querySelector('.hint-list-overlay')?.remove();
  const charKey = buildCharKey(domain, charText);
  const overlay = document.createElement('div');
  overlay.className = 'hint-list-overlay';
  overlay.innerHTML = `
    <div class="hint-list-card" role="dialog" aria-label="${escapeHtml(charText)} 힌트 목록">
      <div class="hint-list-header">
        <h4>💡 ${escapeHtml(charText)} 힌트</h4>
        <button type="button" class="hint-list-close" aria-label="닫기">&times;</button>
      </div>
      <div class="hint-list-scroll">
        <div class="hint-my-box"></div>
        <ul class="hint-list"><li class="hint-list-empty">불러오는 중…</li></ul>
      </div>
    </div>
  `;
  const close = () => {
    overlay.remove();
    onClose?.();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.hint-list-close')) close();
  });
  document.body.appendChild(overlay);

  const myBox = overlay.querySelector('.hint-my-box');
  const listEl = overlay.querySelector('.hint-list');
  let editing = false;

  const likeButtonHtml = (h, key) => {
    const likeDisabled = !auth.currentUser || h.isMine;
    const likeTitle = !auth.currentUser ? '로그인하면 따봉을 누를 수 있어요' : (h.likedByMe ? '따봉 취소' : '따봉');
    return `<button type="button" class="hint-like-btn${h.likedByMe ? ' liked' : ''}" data-key="${key}"
      ${likeDisabled ? 'disabled' : ''} title="${likeTitle}" aria-label="${likeTitle}">👍 ${h.likeCount}</button>`;
  };

  const bindDelete = (box) => {
    box.querySelector('.hint-my-delete')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!confirm('내 힌트를 삭제할까요? 받은 따봉도 함께 사라집니다.')) return;
      btn.disabled = true;
      try {
        await deleteMyHint(domain, charText);
        editing = false;
        await render();
        onChange?.();
      } catch (error) {
        console.error('[Hint] 힌트 삭제 실패:', error);
        alert('힌트를 삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        btn.disabled = false;
      }
    });
  };

  const renderMyHintCard = (box, mine) => {
    box.innerHTML = `
      <div class="hint-item is-mine">
        <p class="hint-item-text">${escapeHtml(mine.text)}</p>
        <div class="hint-item-foot">
          <span class="hint-meta">내 힌트 · 👍 ${mine.likeCount}</span>
          <span class="hint-my-inline-actions">
            <button type="button" class="hint-my-edit">수정</button>
            <button type="button" class="hint-my-delete">삭제</button>
          </span>
        </div>
      </div>
    `;
    box.querySelector('.hint-my-edit')?.addEventListener('click', () => {
      editing = true;
      renderMyHintEditor(box, mine);
      box.querySelector('.hint-my-input')?.focus();
    });
    bindDelete(box);
  };

  const renderMyHintEditor = (box, mine) => {
    if (!auth.currentUser) {
      box.innerHTML = '<p class="hint-login-note">로그인하면 나만의 힌트를 하나 올릴 수 있어요.</p>';
      return;
    }
    box.innerHTML = `
      <label class="hint-my-label" for="hint-my-input">${mine ? '내 힌트 고치기' : '내 힌트 올리기'} (글자마다 하나)</label>
      <textarea id="hint-my-input" class="hint-my-input" maxlength="${HINT_MAX_LENGTH}" rows="2"
        placeholder="예) あ는 안테나에 오리가 매달린 모양">${escapeHtml(mine?.text || '')}</textarea>
      <div class="hint-my-actions">
        <span class="hint-my-count"></span>
        ${mine ? '<button type="button" class="hint-my-cancel">취소</button>' : ''}
        <button type="button" class="hint-my-save">${mine ? '저장' : '올리기'}</button>
      </div>
    `;
    const input = box.querySelector('.hint-my-input');
    const counter = box.querySelector('.hint-my-count');
    const updateCount = () => { counter.textContent = `${input.value.length} / ${HINT_MAX_LENGTH}`; };
    input.addEventListener('input', updateCount);
    input.addEventListener('keydown', (e) => e.stopPropagation());
    updateCount();

    box.querySelector('.hint-my-cancel')?.addEventListener('click', () => {
      editing = false;
      renderMyHintCard(box, mine);
    });
    box.querySelector('.hint-my-save')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await saveMyHint(domain, charText, input.value);
        editing = false;
        await render();
        onChange?.();
      } catch (error) {
        console.error('[Hint] 힌트 저장 실패:', error);
        alert(error?.message === '힌트 내용을 입력해 주세요.' ? error.message : '힌트를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
        btn.disabled = false;
      }
    });
  };

  async function render() {
    let hints = [];
    let loadFailed = false;
    try {
      hints = await fetchUserHints(domain, charText);
    } catch (error) {
      console.error('[Hint] 힌트 목록을 읽지 못했습니다:', error);
      loadFailed = true;
    }
    if (!overlay.isConnected) return;

    const mine = hints.find((h) => h.isMine) || null;
    if (loadFailed) {
      myBox.innerHTML = '<p class="hint-login-note">사용자 힌트를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>';
    } else if (mine && !editing) {
      renderMyHintCard(myBox, mine);
    } else {
      renderMyHintEditor(myBox, mine);
    }

    const seedText = getSeedHint(domain, charText);
    const entries = hints.filter((h) => !h.isMine).map((h) => ({ hint: h, likes: h.likeCount, seed: false }));
    if (seedText) entries.push({ hint: null, likes: 0, seed: true });
    entries.sort((a, b) => (b.likes - a.likes)
      || (Number(b.seed) - Number(a.seed))
      || ((b.hint?.updatedAt || 0) - (a.hint?.updatedAt || 0)));

    const rows = entries.map((entry, idx) => {
      if (entry.seed) {
        return `
          <li class="hint-item is-seed">
            <p class="hint-item-text">${escapeHtml(seedText)}</p>
            <div class="hint-item-foot"><span class="hint-meta">기본 힌트</span></div>
          </li>`;
      }
      const h = entry.hint;
      return `
        <li class="hint-item">
          <p class="hint-item-text">${escapeHtml(h.text)}</p>
          <div class="hint-item-foot">
            <span class="hint-meta">${escapeHtml(h.authorName)}</span>
            ${likeButtonHtml(h, idx)}
          </div>
        </li>`;
    });
    listEl.innerHTML = rows.length ? rows.join('') : '<li class="hint-list-empty">아직 다른 힌트가 없어요.</li>';

    listEl.querySelectorAll('.hint-like-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const hint = entries[Number(btn.dataset.key)]?.hint;
        if (!hint) return;
        btn.disabled = true;
        try {
          await toggleHintLike(hint, charKey);
          await render();
          onChange?.();
        } catch (error) {
          console.error('[Hint] 따봉 실패:', error);
          alert(error?.message?.startsWith('로그인') || error?.message?.startsWith('내 힌트') ? error.message : '따봉을 반영하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
          btn.disabled = false;
        }
      });
    });
  }

  await render();
}

/**
 * 리더보드의 「힌트 따봉」 탭. 사용자별 받은 따봉 합계 순위.
 */
export async function renderHintHallOfFame() {
  const listContainer = document.getElementById('leaderboard-list');
  const headerContainer = document.getElementById('leaderboard-header');
  if (!listContainer) return;

  if (headerContainer) {
    headerContainer.innerHTML = `
      <tr>
        <th>순위</th>
        <th>아이디</th>
        <th>받은 따봉</th>
        <th>따봉 받은 힌트</th>
      </tr>`;
  }
  listContainer.innerHTML = '<tr><td colspan="4" class="leaderboard-empty">데이터를 불러오는 중입니다...</td></tr>';

  let entries = [];
  try {
    entries = await getHintHallOfFame();
  } catch (error) {
    console.error('[Hint] 명예의 전당을 읽지 못했습니다:', error);
    listContainer.innerHTML = '<tr><td colspan="4" class="leaderboard-empty">순위를 불러오지 못했어요.</td></tr>';
    return;
  }
  if (!entries.length) {
    listContainer.innerHTML = '<tr><td colspan="4" class="leaderboard-empty">아직 따봉을 받은 힌트가 없어요. 첫 주인공이 되어 보세요!</td></tr>';
    return;
  }
  const myUid = auth.currentUser?.uid;
  listContainer.innerHTML = entries.map((entry, index) => {
    const rank = index + 1;
    return `
      <tr class="${entry.uid === myUid ? 'highlight-row' : ''}">
        <td class="${rank <= 3 ? 'rank-top' : 'rank-normal'}">${rank}</td>
        <td class="lb-name">${escapeHtml(entry.name)}</td>
        <td class="lb-correct">👍 ${entry.totalLikes}</td>
        <td>${entry.hintCount}개</td>
      </tr>`;
  }).join('');
}
