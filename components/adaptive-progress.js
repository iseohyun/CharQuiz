/**
 * @file components/adaptive-progress.js
 * @description 목표 정답률에 맞춰 학습 모드의 새 문항 수를 정한다(정답률 조절 자동 진도).
 *
 * - 학습 모드에서 푼 최근 30문제의 정답률을 사람(계정·게스트)마다 적어 둔다. 5초 넘게 걸려 맞힌 답은 틀린 것으로 센다.
 *   로그인했으면 계정 문서에도 올려 다른 기기와 같은 기록을 쓴다(db-handler.js 의 save/loadAccountStudyAccuracy).
 * - 목표 정답률(기본 85%)보다 많이 높으면 풀이 차 있어도 새 문항을 넣고, 낮으면 새 문항 없이 복습만 한다.
 *   (학습 효과가 가장 큰 정답률이 85% 안팎이라는 연구 결과(Wilson 외, 2019 「85% 규칙」)를 따른다.)
 */

export const TARGET_ACCURACY_STEPS = [70, 75, 80, 85, 90, 95];
export const DEFAULT_TARGET_ACCURACY = 85;

const STORAGE_BASE = 'charquiz_study_accuracy_log'; // 지난 판(기기 하나에 하나)의 열쇠이기도 하다
let ownerKey = null; // 계정 uid 또는 게스트 ID (setAccuracyOwner)
const WINDOW_SIZE = 30; // 최근 몇 문제로 정답률을 볼지
const MIN_SAMPLE = 10; // 이보다 적게 풀었으면 판단하지 않고 예전처럼 새 문항 1개
const SLOW_ANSWER_MS = 5000; // 이보다 늦게 맞히면 틀린 것으로 센다

/** 설정값을 단계 안으로 맞춘다 */
export function normalizeTargetAccuracy(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_TARGET_ACCURACY;
  return Math.min(95, Math.max(70, Math.round(n / 5) * 5));
}

const storageKey = () => (ownerKey ? `${STORAGE_BASE}_${ownerKey}` : STORAGE_BASE);

/** 기록을 { log, updatedAt } 꼴로 고른다(이상한 값은 버린다) */
function cleanState(raw) {
  const log = Array.isArray(raw?.log) ? raw.log.filter((v) => v === 0 || v === 1).slice(-WINDOW_SIZE) : [];
  return { log, updatedAt: Number(raw?.updatedAt) || 0 };
}

function writeState(state) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(cleanState(state)));
  } catch {
    /* 저장 공간이 막혀 있으면 이번 판만 판단에서 빠진다 */
  }
}

/** 지금 사람의 정답률 기록 { log, updatedAt } */
export function getAccuracyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    return cleanState(Array.isArray(raw) ? { log: raw } : raw);
  } catch {
    return cleanState(null);
  }
}

const readLog = () => getAccuracyState().log;

/**
 * 기록 주인을 정한다(로그인·로그아웃 때). 사람마다 따로 적어 두고, 지난 판에서 기기에 하나로 적던 기록은 처음 주인에게 넘긴다.
 * @param {string|null} key 계정 uid 또는 게스트 ID
 */
export function setAccuracyOwner(key) {
  ownerKey = key || null;
  if (!ownerKey) return;
  try {
    const legacy = localStorage.getItem(STORAGE_BASE);
    if (legacy === null) return;
    if (getAccuracyState().log.length === 0) {
      const arr = JSON.parse(legacy);
      if (Array.isArray(arr) && arr.length) writeState({ log: arr, updatedAt: 1 });
    }
    localStorage.removeItem(STORAGE_BASE);
  } catch {
    /* 옮기지 못하면 새로 쌓는다 */
  }
}

/**
 * 계정에 저장된 기록과 맞춘다. 더 최근 쪽을 쓴다.
 * @param {{ log: number[], updatedAt: number }|null} remote 계정 기록(없으면 null)
 * @returns {'pulled'|'push'|'same'} push 면 이 기기 기록이 더 새로워 계정에 올려야 한다
 */
export function mergeAccountAccuracy(remote) {
  const local = getAccuracyState();
  const server = remote ? cleanState(remote) : null;
  if (server && server.updatedAt > local.updatedAt) {
    writeState(server);
    return 'pulled';
  }
  if (local.log.length > 0 && local.updatedAt > (server?.updatedAt || 0)) return 'push';
  return 'same';
}

/** 학습 모드 한 문제 결과를 적는다(늦게 맞힌 답은 틀린 것으로) */
export function recordStudyAnswer(isCorrect, latency) {
  const log = readLog();
  log.push(isCorrect && latency < SLOW_ANSWER_MS ? 1 : 0);
  writeState({ log, updatedAt: Date.now() });
}

/** @returns {{ accuracy: number|null, count: number }} accuracy 는 0~100 (덜 풀었으면 null) */
export function getRecentStudyAccuracy() {
  const log = readLog();
  if (log.length < MIN_SAMPLE) return { accuracy: null, count: log.length };
  return { accuracy: Math.round((log.reduce((a, b) => a + b, 0) / log.length) * 100), count: log.length };
}

/**
 * 이번 학습 판에 넣을 새 문항 계획.
 * - 목표 +10%p 이상: 새 문항 2개를 풀이 차 있어도 넣는다
 * - 목표 +5%p 이상: 새 문항 1개를 풀이 차 있어도 넣는다
 * - 목표 -5%p 이하: 새 문항 없이 복습만
 * - 그 사이, 또는 아직 10문제를 안 풀었으면: 예전처럼 빈자리가 있을 때 1개
 * @returns {{ newCount: number, force: boolean }} initSessionPool 의 autoProgress 자리에 그대로 넘긴다
 */
export function planNewItems(autoProgress, targetAccuracy) {
  if (!autoProgress) return { newCount: 0, force: false };
  const { accuracy } = getRecentStudyAccuracy();
  if (accuracy === null) return { newCount: 1, force: false };
  const target = normalizeTargetAccuracy(targetAccuracy);
  if (accuracy >= target + 10) return { newCount: 2, force: true };
  if (accuracy >= target + 5) return { newCount: 1, force: true };
  if (accuracy <= target - 5) return { newCount: 0, force: false };
  return { newCount: 1, force: false };
}
