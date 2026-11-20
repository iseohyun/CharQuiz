/**
 * @file components/db-handler.js
 * @description Local-First(localStorage 0ms 캐시) 및 Firestore 양방향 병합/지연 배치 동기화를 총괄하는 데이터베이스 핸들러 모듈
 */

import { db, auth } from './firebase-config.js';
import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  setDoc,
  increment,
  limit,
  orderBy,
  query,
  where,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { ALPHABETS } from './engine.js';
import { migrateLegacyStorage } from './storage-migration.js';
import { claimLegacyData } from './legacy-migration.js';
import { toLocalDateKey, getRecentLocalDateKeys } from './date-utils.js';

// 내부 상주 변수 및 도메인별 다차원 메모리 캐시 구조화
let currentUserUid = null;
let progressCache = {};
let progressMeta = {};

// 주간 학습 통계 서버 조회 결과 캐시 (사용자별, 10분 유효)

// Firestore/localStorage 에 저장할 진도 필드 목록 (세션 중에만 쓰는 플래그는 저장하지 않음)
const PERSISTED_PROGRESS_FIELDS = [
  'domain', 'charId', 'stage', 'recentLatencies', 'latenciesIdx',
  'outCnt', 'resetOutCnt', 'totalSolved', 'lastSessionTime', 'sessionStreak', 'updatedAt'
];

/**
 * 세션용 아이템에서 영속 필드만 골라 저장용 스키마를 만든다.
 * isEligibleForPromotion, hasBeenPromotedThisSession, hasHistory, isUnlocked, char 같은
 * 세션 전용 값이 DB에 남아 다른 모드(기록 모드 등)에 섞이는 것을 막는다.
 * @param {object} item
 * @returns {object}
 */
export const toPersistedSchema = (item) => {
  const schema = {};
  PERSISTED_PROGRESS_FIELDS.forEach((field) => {
    if (item[field] !== undefined) schema[field] = item[field];
  });
  return schema;
};

/**
 * 게스트용 고유 기기 ID 생성 및 반환
 */
const _getOrCreateGuestId = () => {
  let guestId = localStorage.getItem('GUEST_ID');
  if (!guestId) {
    guestId = 'GUEST_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('GUEST_ID', guestId);
  }
  return guestId;
};

/**
 * 로컬 localStorage 스토리지에 캐시 및 타임스탬프 동기화 보존
 */
const _saveLocalProgressCache = () => {
  if (!currentUserUid) return;
  try {
    const cacheKey = `CHARQUIZ_PROGRESS_CACHE_${currentUserUid}`;
    const metaKey = `CHARQUIZ_PROGRESS_META_${currentUserUid}`;
    localStorage.setItem(cacheKey, JSON.stringify(progressCache));
    localStorage.setItem(metaKey, JSON.stringify(progressMeta));
  } catch (e) {
    console.warn("[LocalFirst] localStorage 동기화 저장 실패:", e);
  }
};

/**
 * 로컬 localStorage 스토리지에서 캐시 및 타임스탬프 복원
 */
const _loadLocalProgressCache = () => {
  if (!currentUserUid) return false;
  try {
    const cacheKey = `CHARQUIZ_PROGRESS_CACHE_${currentUserUid}`;
    const metaKey = `CHARQUIZ_PROGRESS_META_${currentUserUid}`;
    const cachedData = localStorage.getItem(cacheKey);
    const cachedMeta = localStorage.getItem(metaKey);

    if (cachedData) {
      progressCache = JSON.parse(cachedData);
      progressMeta = cachedMeta ? JSON.parse(cachedMeta) : {};
      return true;
    }
  } catch (e) {
    console.warn("[LocalFirst] localStorage 복원 실패:", e);
  }
  return false;
};

/**
 * 사용자 UID 설정 및 도메인 전역 캐시 갱신 초기화
 */
export const initUser = async (uid) => {
  // 이름 변경(KanaLoop → CharQuiz) 전 로컬 데이터를 1회 복구 (이미 했으면 즉시 반환)
  migrateLegacyStorage();

  if (uid) {
    currentUserUid = uid;
    // 이전 프로젝트(kana-loop)에서 옮겨 둔 기록이 있으면 먼저 이어 받는다
    await claimLegacyData();
  } else {
    currentUserUid = _getOrCreateGuestId();
  }
  await refreshProgressCache();
};

/**
 * DB/로컬에서 지원하는 모든 도메인의 학습 내역을 통합 수집하여 메모리 캐시 갱신 (서버 데이터 100% 수급 & 지능형 병합)
 */
export const refreshProgressCache = async () => {
  if (!currentUserUid) return;

  const domains = Object.keys(ALPHABETS);

  // 1. 브라우저 localStorage 캐시 0ms 즉시 복원
  const hasLocalCache = _loadLocalProgressCache();
  if (!hasLocalCache) {
    progressCache = {};
    progressMeta = {};
    domains.forEach(d => {
      progressCache[d] = {};
      progressMeta[d] = 0;
    });
  }

  // 2. 서버 DB의 전체 도메인 데이터를 1회 읽어와 로컬 데이터와 양방향 지능형 병합 (Smart Bidirectional Merge)
  try {
    let updatedDomainCount = 0;

    await Promise.all(domains.map(async (domain) => {
      const charsRef = collection(db, 'users', currentUserUid, 'progress', domain, 'chars');
      const snapshot = await getDocs(charsRef);

      if (!progressCache[domain]) progressCache[domain] = {};

      if (!snapshot.empty) {
        updatedDomainCount++;
        snapshot.forEach(docSnap => {
          const serverCharData = docSnap.data();
          const localCharData = progressCache[domain][docSnap.id];

          const serverTime = serverCharData.lastSessionTime || serverCharData.updatedAt || 0;
          const localTime = localCharData ? (localCharData.lastSessionTime || localCharData.updatedAt || 0) : -1;

          if (!localCharData || serverTime >= localTime) {
            progressCache[domain][docSnap.id] = serverCharData;
          }
        });
      }

      progressMeta[domain] = Date.now();
    }));

    // 3. 병합 완료된 양방향 진도 데이터를 localStorage에 정밀 동기화
    _saveLocalProgressCache();
    console.log(`[LocalFirst] 서버 DB 데이터 양방향 동기화 및 병합 완료 (${updatedDomainCount}개 도메인 서버 수급 완료). ID:`, currentUserUid);
  } catch (err) {
    console.warn("[LocalFirst] 서버 동기화 생략 (로컬 캐시 모드로 안전 구동):", err.message);
  }
};

/**
 * 특정 도메인의 전체 진도 캐시 반환 (engine.js 진입점 연동 전용)
 */
export const getAllProgress = async (domain) => {
  if (!progressCache[domain]) progressCache[domain] = {};
  return progressCache[domain];
};

/**
 * 정산 완료된 단일 단어 스키마 상태를 로컬 캐시 및 localStorage에 0ms 실시간 반영
 */
export const updateProgress = async (domain, charId, updatedItem) => {
  if (!currentUserUid) return;

  const key = charId.toString();
  if (!progressCache[domain]) progressCache[domain] = {};

  updatedItem.updatedAt = Date.now();
  progressCache[domain][key] = updatedItem;
  progressMeta[domain] = Date.now();

  _saveLocalProgressCache();
};

/**
 * 특정 단일 문자의 진도를 Stage=1로 강제 활성화 (게스트 및 로그인 유저 Local-First 공통 지원)
 */
export const activateSingleCharInDb = async (domain, charId) => {
  if (!currentUserUid) return null;

  const key = charId.toString();
  const now = Date.now();
  const initialSchema = {
    domain,
    charId: parseInt(charId, 10),
    stage: 1,
    recentLatencies: [2500],
    latenciesIdx: 1,
    outCnt: 0,
    resetOutCnt: 0,
    totalSolved: 1,
    lastSessionTime: now,
    updatedAt: now,
    sessionStreak: 0
  };

  if (!progressCache[domain]) progressCache[domain] = {};
  progressCache[domain][key] = initialSchema;
  progressMeta[domain] = now;
  _saveLocalProgressCache();

  try {
    const docRef = doc(db, 'users', currentUserUid, 'progress', domain, 'chars', key);
    await setDoc(docRef, initialSchema);
  } catch (err) {
    console.warn("[LocalFirst] 단일 문자 해금 서버 저장 생략 (로컬 반영 완료):", err.message);
  }

  return progressCache[domain];
};

/**
 * 특정 단일 문자의 진도 기록을 완전 초기화 (게스트 및 로그인 유저 Local-First 공통 지원)
 */
export const resetSingleCharInDb = async (domain, charId) => {
  if (!currentUserUid) return null;

  const key = charId.toString();
  if (progressCache[domain]) {
    delete progressCache[domain][key];
  }
  progressMeta[domain] = Date.now();
  _saveLocalProgressCache();

  try {
    const docRef = doc(db, 'users', currentUserUid, 'progress', domain, 'chars', key);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn("[LocalFirst] 단일 문자 초기화 서버 반영 생략 (로컬 반영 완료):", err.message);
  }

  return progressCache[domain] || {};
};

/**
 * 현재 도메인의 미해금 문자를 모두 Stage 1로 일괄 해금 (게스트 및 로그인 유저 Local-First 공통 지원)
 */
export const unlockAllCharactersInDb = async (domain) => {
  if (!currentUserUid) return null;

  let rawDataset = ALPHABETS[domain] || [];
  if (typeof rawDataset === 'string') rawDataset = [rawDataset];

  if (!progressCache[domain]) progressCache[domain] = {};
  const now = Date.now();
  const batch = writeBatch(db);
  let globalIdx = 0;

  rawDataset.forEach((rowStr) => {
    for (let i = 0; i < rowStr.length; i++) {
      if (rowStr[i] === '_') continue;

      const cId = globalIdx.toString();
      if (progressCache[domain][cId] && progressCache[domain][cId].stage > 0) {
        globalIdx++;
        continue;
      }

      const schema = {
        domain,
        charId: globalIdx,
        stage: 1,
        recentLatencies: [2500],
        latenciesIdx: 1,
        outCnt: 0,
        resetOutCnt: 0,
        totalSolved: 1,
        lastSessionTime: now,
        updatedAt: now,
        sessionStreak: 0
      };

      progressCache[domain][cId] = schema;
      const docRef = doc(db, 'users', currentUserUid, 'progress', domain, 'chars', cId);
      batch.set(docRef, schema);
      globalIdx++;
    }
  });

  progressMeta[domain] = now;
  _saveLocalProgressCache();

  try {
    await batch.commit();
  } catch (err) {
    console.warn("[LocalFirst] 일괄 해금 서버 저장 생략 (로컬 반영 완료):", err.message);
  }

  return progressCache[domain];
};

/**
 * 현재 도메인의 모든 진도 기록을 전면 초기화 (게스트 및 로그인 유저 Local-First 공통 지원)
 */
export const resetAllProgressInDb = async (domain) => {
  if (!currentUserUid) return {};

  progressCache[domain] = {};
  progressMeta[domain] = Date.now();
  _saveLocalProgressCache();

  try {
    const colRef = collection(db, 'users', currentUserUid, 'progress', domain, 'chars');
    const snapshot = await getDocs(colRef);
    if (!snapshot.empty) {
      const batch = writeBatch(db);
      snapshot.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }
  } catch (err) {
    console.warn("[LocalFirst] 전체 초기화 서버 반영 생략 (로컬 반영 완료):", err.message);
  }

  return progressCache[domain];
};

/**
 * 세션 완료 시 세션 풀 단어들의 상태를 로컬 정산하고, 서버에 지연 배치 1회 전송 (Lazy Batch Sync)
 */
export const saveSessionPoolState = async (domain, sessionPool) => {
  if (!currentUserUid || !sessionPool || sessionPool.length === 0) return;

  const now = Date.now();
  if (!progressCache[domain]) progressCache[domain] = {};
  progressMeta[domain] = now;

  // 세션 전용 플래그를 제거한 저장용 스키마 목록
  const persistedItems = sessionPool.map((item) => toPersistedSchema({ ...item, updatedAt: now }));

  // 1. 로컬 메모리 & localStorage 0ms 실시간 반영
  persistedItems.forEach(item => {
    progressCache[domain][item.charId.toString()] = item;
  });
  _saveLocalProgressCache();

  // 2. 비동기 지연 배치 Write 1회로 서버에 전송 (Lazy Batch Sync)
  try {
    const batch = writeBatch(db);

    persistedItems.forEach(item => {
      const key = item.charId.toString();
      const docRef = doc(db, 'users', currentUserUid, 'progress', domain, 'chars', key);
      batch.set(docRef, item);
    });

    const userDocRef = doc(db, 'users', currentUserUid);
    batch.set(userDocRef, { progressMeta: { [domain]: now } }, { merge: true });

    await batch.commit();
    console.log(`[LocalFirst] 세션 배치 동기화 1회 완료 (${sessionPool.length}개 단어 DB 저장)`);
  } catch (err) {
    console.warn("[LocalFirst] 비동기 세션 배치 DB 저장 실패 (로컬 스토리지 보존):", err.message);
  }
};

/**
 * 세션 타임오버 시 일일 학습 시간 누계 업데이트 기록 (로컬 퍼스트)
 */
export const updateDailyStudyTime = async (seconds, domain) => {
  if (!currentUserUid || !domain) return;

  const today = toLocalDateKey();
  const storageKey = `CHARQUIZ_STUDY_STATS_${currentUserUid}`;

  // 1. 로컬 localStorage 0ms 실시간 누계 기록
  try {
    const rawStats = localStorage.getItem(storageKey);
    const statsObj = rawStats ? JSON.parse(rawStats) : {};
    if (!statsObj[today]) statsObj[today] = {};
    statsObj[today][domain] = (statsObj[today][domain] || 0) + seconds;
    localStorage.setItem(storageKey, JSON.stringify(statsObj));
  } catch (e) {
    console.warn("[LocalFirst] 일일 학습시간 로컬 저장 실패:", e);
  }

  // 2. 비동기 백그라운드 서버 저장
  try {
    const docRef = doc(db, 'users', currentUserUid, 'study_stats', today);
    const updates = {};
    updates[domain] = increment(seconds);
    updates.lastUpdated = Date.now();
    await setDoc(docRef, updates, { merge: true });
  } catch (err) {
    console.warn("[LocalFirst] 일일 학습시간 DB 백그라운드 저장 생략 (로컬 스토리지 보존):", err.message);
  }
};

/**
 * 타임오버 시 당일 최고 숙련도 반응속도 중간값 등의 요약 통계 저장
 */
export const updateDailyStats = async (avgAll, avgR10, avgR5) => {
  if (!currentUserUid) return;

  const today = toLocalDateKey();
  const docRef = doc(db, 'users', currentUserUid, 'daily_summary', today);

  await setDoc(docRef, {
    avgAll,
    avgRecent10: avgR10,
    avgRecent5: avgR5,
    timestamp: Date.now()
  }, { merge: true });
};

/* ==========================================================================
   순위 (20문제 · 30초 타임어택)
   - 사람·도메인마다 문서 하나(`uid_domain`)에 본인 최고 기록 1개만 둔다.
   - 20문제: 정답률 높은 순, 같으면 빨리 끝낸 순. 문제 수가 정확히 20개인 판만 받는다.
   - 30초: 정답률 높은 순, 같으면 맞힌 수 많은 순(마구 눌러 맞힌 수만 많은 기록이 위로 오지 않게).
   ========================================================================== */
export const SPEEDRUN_RANKING_QUESTION_COUNT = 20;

const compareSpeedrun = (a, b) =>
  ((b.accuracy || 0) - (a.accuracy || 0)) || ((a.elapsedTime || 0) - (b.elapsedTime || 0)) || ((a.updatedAt || 0) - (b.updatedAt || 0));
const compareTimeAttack = (a, b) =>
  ((b.accuracy || 0) - (a.accuracy || 0)) || ((b.correctCount || 0) - (a.correctCount || 0)) || ((a.updatedAt || 0) - (b.updatedAt || 0));

/** 좋은 순으로 늘어놓고 사람·도메인마다 첫 기록만 남긴다(옛 문서가 남아 있어도 한 줄만 보이게) */
const keepBestPerPlayer = (rows, compare) => {
  const seen = new Set();
  return [...rows].sort(compare).filter((r) => {
    const key = `${r.uid}_${r.domain}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/** 본인 최고 기록보다 좋을 때만 `uid_domain` 문서를 고쳐 쓴다. @returns {Promise<string|null>} 고쳐 썼으면 문서 ID */
const saveIfPersonalBest = async (collectionName, record, compare) => {
  const docId = `${currentUserUid}_${record.domain}`;
  const ref = doc(db, collectionName, docId);
  const snap = await getDoc(ref);
  if (snap.exists() && compare(record, snap.data()) >= 0) return null;
  await setDoc(ref, record);
  return docId;
};

const pad2 = (n) => n.toString().padStart(2, '0');
const formatRankingRow = (data) => {
  const e = data.elapsedTime || 0;
  const elapsedStr = data.durationSec ? '00:30' : `${pad2(Math.floor(e / 60))}:${pad2(e % 60)}`;
  const d = new Date(data.updatedAt);
  return {
    ...data,
    score: `${data.accuracy}% (${elapsedStr})`,
    elapsedStr,
    updatedAt: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  };
};

const resolveDisplayName = (customName) =>
  customName || document.getElementById('profile-name')?.innerText || '게스트';

/**
 * 20문제 타임어택 기록. 20문제가 아닌 판은 받지 않고, 본인 최고 기록보다 좋을 때만 고쳐 쓴다.
 * @returns {Promise<string|null>} 새 최고 기록이면 문서 ID
 */
export const submitSpeedrunRanking = async (domain, charCount, elapsedTime, accuracy, customName = null) => {
  if (!currentUserUid || charCount !== SPEEDRUN_RANKING_QUESTION_COUNT) return null;
  return saveIfPersonalBest('charquiz_speedrun_rankings', {
    uid: currentUserUid,
    name: resolveDisplayName(customName),
    domain,
    charCount,
    elapsedTime,
    accuracy,
    updatedAt: Date.now()
  }, compareSpeedrun);
};

/**
 * 20문제 순위 (사람·도메인마다 최고 기록 1개)
 */
export const getGlobalRankings = async (limitCount = 10, targetDomain = 'all') => {
  const rankingsRef = collection(db, 'charquiz_speedrun_rankings');
  const q = targetDomain === 'all'
    ? query(rankingsRef, orderBy('accuracy', 'desc'), orderBy('elapsedTime', 'asc'), limit(300))
    : query(rankingsRef, where('domain', '==', targetDomain), orderBy('accuracy', 'desc'), orderBy('elapsedTime', 'asc'), limit(300));

  try {
    const snapshot = await getDocs(q);
    const rows = snapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      .filter((r) => r.charCount === SPEEDRUN_RANKING_QUESTION_COUNT);
    return keepBestPerPlayer(rows, compareSpeedrun).slice(0, limitCount).map(formatRankingRow);
  } catch (error) {
    if (error.message && error.message.includes('index')) {
      console.error("🔥 [DB Error] Firebase 복합 인덱스가 누락되었습니다! 다음 링크를 클릭하여 생성하세요:\n", error.message);
    }
    throw error;
  }
};

/**
 * 사용자 커스텀 기획 환경설정 제어 아카이브 저장 (로컬 퍼스트 & 지능형 백그라운드 싱크)
 */
export const saveUserConfig = async (config) => {
  if (!currentUserUid) return;

  try {
    localStorage.setItem(`CHARQUIZ_CONFIG_${currentUserUid}`, JSON.stringify(config));
  } catch (e) {
    console.warn("[LocalFirst] Config 로컬 저장 실패:", e);
  }

  try {
    const docRef = doc(db, 'users', currentUserUid);
    await setDoc(docRef, { config, configUpdatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn("[LocalFirst] Config DB 백그라운드 저장 실패 (로컬 스토리지 보존):", e.message);
  }
};

export const getUserConfig = async () => {
  if (!currentUserUid) return null;

  try {
    const cachedConfig = localStorage.getItem(`CHARQUIZ_CONFIG_${currentUserUid}`);
    if (cachedConfig) {
      return JSON.parse(cachedConfig);
    }
  } catch (e) {
    console.warn("[LocalFirst] Config 로컬 복원 실패:", e);
  }

  try {
    const docRef = doc(db, 'users', currentUserUid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().config) {
      const config = docSnap.data().config;
      localStorage.setItem(`CHARQUIZ_CONFIG_${currentUserUid}`, JSON.stringify(config));
      return config;
    }
  } catch (e) {
    console.warn("[LocalFirst] Config 서버 수급 실패:", e.message);
  }

  return null;
};

/**
 * 현재 로그인된 사용자 UID 또는 게스트 ID 조회 헬퍼
 */
export const getCurrentUserUid = () => currentUserUid;

/**
 * 이 기기에 저장된 게스트 ID 조회 (없으면 null, 새로 만들지 않음)
 */
export const getStoredGuestId = () => localStorage.getItem('GUEST_ID');

/**
 * 로그인 직후, 같은 기기에서 게스트로 학습한 진도 중 계정에 없거나 계정보다 최신인 기록을 찾는다.
 * 마지막으로 병합 여부를 물어본 시각 이후에 학습한 게스트 기록만 대상으로 하므로 같은 질문을 반복하지 않는다.
 * @returns {{ guestId: string, flagKey: string, items: Array<{domain: string, key: string, data: object}> } | null}
 */
export const findGuestProgressToMerge = () => {
  const guestId = getStoredGuestId();
  if (!guestId || !currentUserUid || currentUserUid === guestId) return null;

  const flagKey = `CHARQUIZ_GUEST_MERGE_HANDLED_${guestId}_${currentUserUid}`;
  const lastHandledAt = Number(localStorage.getItem(flagKey)) || 0;

  let guestCache = {};
  try {
    guestCache = JSON.parse(localStorage.getItem(`CHARQUIZ_PROGRESS_CACHE_${guestId}`) || '{}');
  } catch (e) {
    console.warn("[GuestMerge] 게스트 진도 캐시를 읽지 못했습니다:", e);
    return null;
  }

  const items = [];
  Object.entries(guestCache).forEach(([domain, chars]) => {
    if (!ALPHABETS[domain] || !chars || typeof chars !== 'object') return;
    Object.entries(chars).forEach(([key, guestData]) => {
      if (!guestData || !(guestData.stage > 0 || guestData.totalSolved > 0)) return;
      const accountData = progressCache[domain] ? progressCache[domain][key] : null;
      const guestTime = guestData.lastSessionTime || 0;
      const accountTime = accountData ? (accountData.lastSessionTime || 0) : -1;
      if (guestTime > lastHandledAt && guestTime > accountTime) {
        items.push({ domain, key, data: toPersistedSchema({ ...guestData, domain }) });
      }
    });
  });

  return { guestId, flagKey, items };
};

/**
 * 병합 여부를 물어봤다는 표시를 남겨 같은 질문을 반복하지 않게 한다.
 * @param {string} flagKey findGuestProgressToMerge() 가 반환한 flagKey
 */
export const markGuestMergeHandled = (flagKey) => {
  try {
    localStorage.setItem(flagKey, String(Date.now()));
  } catch (e) {
    console.warn("[GuestMerge] 병합 처리 표시 저장 실패:", e);
  }
};

/**
 * 게스트 진도를 현재 로그인 계정으로 병합한다 (로컬 즉시 반영 + 도메인별 배치 저장).
 * @param {Array<{domain: string, key: string, data: object}>} items
 * @returns {Promise<number>} 병합한 문자 수
 */
export const mergeGuestProgress = async (items) => {
  if (!currentUserUid || !items || items.length === 0) return 0;

  const now = Date.now();
  const itemsByDomain = {};
  items.forEach(({ domain, key, data }) => {
    if (!progressCache[domain]) progressCache[domain] = {};
    const merged = { ...data, updatedAt: now };
    progressCache[domain][key] = merged;
    progressMeta[domain] = now;
    (itemsByDomain[domain] = itemsByDomain[domain] || []).push({ key, merged });
  });
  _saveLocalProgressCache();

  try {
    await Promise.all(Object.entries(itemsByDomain).map(async ([domain, domainItems]) => {
      const batch = writeBatch(db);
      domainItems.forEach(({ key, merged }) => {
        batch.set(doc(db, 'users', currentUserUid, 'progress', domain, 'chars', key), merged);
      });
      batch.set(doc(db, 'users', currentUserUid), { progressMeta: { [domain]: now } }, { merge: true });
      await batch.commit();
    }));
  } catch (err) {
    console.warn("[GuestMerge] 서버 저장 실패 (이 기기에는 반영됨, 다른 기기에는 보이지 않을 수 있음):", err.message);
  }

  return items.length;
};

/**
 * 30초 타임어택 기록. 기록 모드 30초와, 학습 시간을 30초로 두고 끝까지 한 학습 모드가 함께 쓴다.
 * 본인 최고 기록(정답률 → 맞힌 수)보다 좋을 때만 고쳐 쓴다.
 * @returns {Promise<string|null>} 새 최고 기록이면 문서 ID
 */
export const submitTimeAttackRanking = async (domain, correctCount, solvedCount, accuracy, customName = null) => {
  if (!currentUserUid || !(solvedCount > 0)) return null;
  return saveIfPersonalBest('charquiz_timeattack_rankings', {
    uid: currentUserUid,
    name: resolveDisplayName(customName),
    domain,
    correctCount,
    solvedCount,
    accuracy,
    durationSec: 30,
    updatedAt: Date.now()
  }, compareTimeAttack);
};

/**
 * 30초 타임어택 순위. 정답률 높은 순, 같으면 맞힌 수 많은 순. 사람·도메인마다 최고 기록 1개.
 * 복합 인덱스 없이 쓰도록 정답률 순으로 넉넉히 읽고 도메인은 화면에서 거른다.
 */
export const getTimeAttackRankings = async (limitCount = 10, targetDomain = 'all') => {
  const snapshot = await getDocs(query(collection(db, 'charquiz_timeattack_rankings'), orderBy('accuracy', 'desc'), limit(500)));
  const rows = snapshot.docs
    .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
    .filter((data) => targetDomain === 'all' || data.domain === targetDomain);
  return keepBestPerPlayer(rows, compareTimeAttack).slice(0, limitCount).map(formatRankingRow);
};

/* ==========================================================================
   콤보 기록 (학습 모드)
   - 날마다 최대 콤보: users/{uid}/study_stats/{날짜}.charquizMaxCombo (그날 가장 길게 이어진 정답 수)
   - 역대 최대 콤보: users/{uid}.charquizCombo = { current, best, bestAt }
     current 는 학습 판·날짜가 바뀌어도 이어지는 연속 정답 수(틀리면 0), best 는 그 최댓값.
   - 로컬 우선: CHARQUIZ_COMBO_{uid} 에 { current, best, bestAt, daily: {날짜: 최대} } 를 먼저 적는다.
   ========================================================================== */
const comboStorageKey = () => `CHARQUIZ_COMBO_${currentUserUid}`;

function readLocalCombo() {
  try {
    return JSON.parse(localStorage.getItem(comboStorageKey()) || 'null') || { current: 0, best: 0, bestAt: null, daily: {} };
  } catch {
    return { current: 0, best: 0, bestAt: null, daily: {} };
  }
}

function writeLocalCombo(value) {
  try {
    localStorage.setItem(comboStorageKey(), JSON.stringify(value));
  } catch {
    /* 무시 */
  }
}

/**
 * 이어지는 콤보 상태(역대 최대 포함). 서버와 로컬 중 큰 best 를 쓰고, current 는 더 최근에 적힌 쪽을 쓴다.
 * @returns {Promise<{current: number, best: number, bestAt: string|null}>}
 */
export const loadComboState = async () => {
  if (!currentUserUid) return { current: 0, best: 0, bestAt: null };
  const local = readLocalCombo();
  let server = null;
  try {
    const snap = await getDoc(doc(db, 'users', currentUserUid));
    server = snap.exists() ? snap.data().charquizCombo || null : null;
  } catch (err) {
    console.warn('[Combo] 서버 콤보 기록을 읽지 못했습니다:', err.message);
  }
  if (!server) return { current: local.current || 0, best: local.best || 0, bestAt: local.bestAt || null };
  const useServerCurrent = (server.updatedAt || 0) > (local.updatedAt || 0);
  const bestFromServer = (server.best || 0) >= (local.best || 0);
  return {
    current: useServerCurrent ? server.current || 0 : local.current || 0,
    best: Math.max(server.best || 0, local.best || 0),
    bestAt: bestFromServer ? server.bestAt || null : local.bestAt || null
  };
};

/**
 * 학습 한 판이 끝났을 때 콤보 기록을 남긴다.
 * @param {number} sessionMaxCombo 이번 판에서 가장 길게 이어진 정답 수
 * @param {{current: number, best: number, bestAt: string|null}} state 이어지는 콤보 상태
 */
export const saveComboStats = async (sessionMaxCombo, state) => {
  if (!currentUserUid) return;
  const today = toLocalDateKey();
  const now = Date.now();
  const local = readLocalCombo();
  local.daily = local.daily || {};
  local.daily[today] = Math.max(local.daily[today] || 0, sessionMaxCombo);
  Object.assign(local, { current: state.current, best: state.best, bestAt: state.bestAt, updatedAt: now });
  writeLocalCombo(local);

  try {
    await setDoc(doc(db, 'users', currentUserUid), {
      charquizCombo: { current: state.current, best: state.best, bestAt: state.bestAt, updatedAt: now }
    }, { merge: true });
    if (sessionMaxCombo > 0) {
      const statsRef = doc(db, 'users', currentUserUid, 'study_stats', today);
      const snap = await getDoc(statsRef);
      const prev = snap.exists() ? Number(snap.data().charquizMaxCombo) || 0 : 0;
      if (sessionMaxCombo > prev) await setDoc(statsRef, { charquizMaxCombo: sessionMaxCombo, lastUpdated: now }, { merge: true });
    }
  } catch (err) {
    console.warn('[Combo] 콤보 기록 서버 저장 생략(로컬 보존):', err.message);
  }
};

/**
 * 기간별 최대 콤보.
 * @param {'week'|'month'|'year'} range 주 = 최근 7일, 월 = 최근 30일(날마다), 년 = 최근 12달(달마다 최대)
 * @returns {Promise<Array<{key: string, label: string, value: number}>>}
 */
export const getComboHistory = async (range = 'week') => {
  if (!currentUserUid) return [];
  const dayCount = range === 'year' ? 366 : range === 'month' ? 30 : 7;
  const days = getRecentLocalDateKeys(dayCount);
  const daily = { ...(readLocalCombo().daily || {}) };

  try {
    const snap = await getDocs(query(
      collection(db, 'users', currentUserUid, 'study_stats'),
      where(documentId(), '>=', days[0])
    ));
    snap.forEach((d) => {
      const v = Number(d.data().charquizMaxCombo) || 0;
      if (v > (daily[d.id] || 0)) daily[d.id] = v;
    });
  } catch (err) {
    console.warn('[Combo] 서버 콤보 이력을 읽지 못했습니다(로컬 값만 사용):', err.message);
  }

  if (range !== 'year') {
    return days.map((key) => ({ key, label: key.slice(5).replace('-', '/'), value: daily[key] || 0 }));
  }
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return months.map((key) => ({
    key,
    label: `${Number(key.slice(5))}월`,
    value: Math.max(0, ...Object.entries(daily).filter(([d]) => d.startsWith(key)).map(([, v]) => v))
  }));
};

/**
 * 이 기기에서 게스트로 쌓은 콤보 기록을 로그인한 계정에 합친다. 역대 최대와 날마다 최대는 큰 쪽을 남긴다.
 * 이어지는 콤보(current)는 계정 쪽을 그대로 둔다.
 * @returns {Promise<boolean>} 합친 것이 있으면 true
 */
export const mergeGuestCombo = async () => {
  const guestId = getStoredGuestId();
  if (!guestId || !currentUserUid || currentUserUid === guestId) return false;
  let guest;
  try {
    guest = JSON.parse(localStorage.getItem(`CHARQUIZ_COMBO_${guestId}`) || 'null');
  } catch {
    guest = null;
  }
  if (!guest || !(guest.best > 0)) return false;

  const account = await loadComboState();
  const local = readLocalCombo();
  local.daily = local.daily || {};
  const raisedDays = [];
  Object.entries(guest.daily || {}).forEach(([day, value]) => {
    if (value > (local.daily[day] || 0)) {
      local.daily[day] = value;
      raisedDays.push([day, value]);
    }
  });
  const bestFromGuest = guest.best > (account.best || 0);
  if (!bestFromGuest && raisedDays.length === 0) return false;
  const state = {
    current: account.current || 0,
    best: bestFromGuest ? guest.best : account.best || 0,
    bestAt: bestFromGuest ? guest.bestAt : account.bestAt || null
  };
  Object.assign(local, state, { updatedAt: Date.now() });
  writeLocalCombo(local);

  try {
    await setDoc(doc(db, 'users', currentUserUid), { charquizCombo: { ...state, updatedAt: Date.now() } }, { merge: true });
    await Promise.all(raisedDays.map(async ([day, value]) => {
      const ref = doc(db, 'users', currentUserUid, 'study_stats', day);
      const snap = await getDoc(ref);
      if (value > (snap.exists() ? Number(snap.data().charquizMaxCombo) || 0 : 0)) {
        await setDoc(ref, { charquizMaxCombo: value, lastUpdated: Date.now() }, { merge: true });
      }
    }));
  } catch (err) {
    console.warn('[GuestMerge] 콤보 기록 서버 저장 생략(로컬 반영):', err.message);
  }
  return true;
};

/* ==========================================================================
   학습 정답률 기록 (목표 정답률 자동 진도, components/adaptive-progress.js)
   계정 문서(users/{uid})의 `charquizStudyAccuracy` 필드에 { log: [0|1...], updatedAt } 로 둔다.
   설정(config)은 기기에 저장본이 있으면 서버를 읽지 않으므로, 기기끼리 맞추려고 따로 둔다.
   ========================================================================== */
const STUDY_ACCURACY_FIELD = 'charquizStudyAccuracy';

/** 지금 기록 주인(계정 uid 또는 게스트 ID) */
export const getCurrentUserKey = () => currentUserUid;

const isSignedInOwner = () => Boolean(currentUserUid && auth.currentUser && auth.currentUser.uid === currentUserUid);

/** 계정에 저장된 정답률 기록을 읽는다(게스트·실패면 null) */
export const loadAccountStudyAccuracy = async () => {
  if (!isSignedInOwner()) return null;
  try {
    const snap = await getDoc(doc(db, 'users', currentUserUid));
    return snap.exists() ? (snap.data()[STUDY_ACCURACY_FIELD] || null) : null;
  } catch (e) {
    console.warn('[LocalFirst] 정답률 기록 불러오기 실패:', e.message);
    return null;
  }
};

/** 정답률 기록을 계정에 올린다(게스트면 하지 않음) */
export const saveAccountStudyAccuracy = async (state) => {
  if (!isSignedInOwner() || !state || !Array.isArray(state.log)) return;
  try {
    await setDoc(doc(db, 'users', currentUserUid), { [STUDY_ACCURACY_FIELD]: { log: state.log, updatedAt: state.updatedAt || Date.now() } }, { merge: true });
  } catch (e) {
    console.warn('[LocalFirst] 정답률 기록 저장 실패:', e.message);
  }
};
