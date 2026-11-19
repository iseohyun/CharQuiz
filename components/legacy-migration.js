/**
 * @file components/legacy-migration.js
 * @description 이전 Firebase 프로젝트(kana-loop)의 로그인 사용자 기록을 이어 받는다.
 *
 * 프로젝트를 옮기면 같은 계정이어도 사용자 ID 가 새로 생긴다. 그래서 옮길 때 로그인 사용자의 기록을
 * legacy_users/{이메일} 한 문서에 모아 두었고, 같은 이메일로 처음 로그인하면 여기서 자기 기록으로 옮긴 뒤 그 문서를 지운다.
 *   legacy_users/{email} = { email, oldUid, user: {사용자 문서 필드}, progress: {도메인: {글자ID: 진도}}, subs: {하위 컬렉션: {문서ID: 필드}} }
 * 게스트 기록은 같은 경로로 옮겨 두었으므로 할 일이 없다. 규칙은 firestore.rules 의 legacy_users 에 있다.
 */

import { db, auth } from './firebase-config.js';
import { deleteDoc, doc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const BATCH_LIMIT = 450;
// 지금 앱이 쓰고 규칙이 허락하는 하위 컬렉션만 옮긴다. 예전 CharQuiz 의 sessions 같은 것을 함께 쓰면
// 규칙에 막혀 묶음 전체가 실패하고 아무것도 옮겨지지 않는다.
const ALLOWED_SUBS = ['study_stats', 'daily_summary'];

/**
 * 로그인한 사용자에게 옮겨 둔 이전 기록이 있으면 자기 기록으로 옮긴다. 없거나 실패하면 조용히 넘어간다.
 * @returns {Promise<boolean>} 옮겼으면 true
 */
export async function claimLegacyData() {
  const user = auth.currentUser;
  const email = user?.email?.toLowerCase();
  if (!user || !email) return false;

  const legacyRef = doc(db, 'legacy_users', email);
  let snap;
  try {
    snap = await getDoc(legacyRef);
  } catch (error) {
    console.warn('[Legacy] 이전 기록 확인 실패:', error?.code || error);
    return false;
  }
  if (!snap.exists()) return false;

  const { user: userFields = {}, progress = {}, subs = {} } = snap.data();
  const uid = user.uid;
  const writes = [];
  if (Object.keys(userFields).length) writes.push([doc(db, 'users', uid), userFields, { merge: true }]);
  for (const [domain, chars] of Object.entries(progress)) {
    for (const [charId, data] of Object.entries(chars || {})) {
      writes.push([doc(db, 'users', uid, 'progress', domain, 'chars', charId), data]);
    }
  }
  for (const [sub, docs] of Object.entries(subs).filter(([name]) => ALLOWED_SUBS.includes(name))) {
    for (const [docId, data] of Object.entries(docs || {})) {
      writes.push([doc(db, 'users', uid, sub, docId), data, { merge: true }]);
    }
  }

  try {
    for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      writes.slice(i, i + BATCH_LIMIT).forEach(([ref, data, options]) => batch.set(ref, data, options || {}));
      await batch.commit();
    }
    await deleteDoc(legacyRef);
    console.log(`[Legacy] 이전 기록 ${writes.length}건을 이어 받았습니다.`);
    return true;
  } catch (error) {
    console.warn('[Legacy] 이전 기록 옮기기 실패(다음 로그인 때 다시 시도):', error?.code || error);
    return false;
  }
}
