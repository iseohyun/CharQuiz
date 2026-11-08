/**
 * @file components/engine.js
 * @description 간격 반복(Spaced Repetition) 및 룩업 테이블 기반 퀴즈 출제/승급 알고리즘 엔진
 */

export const ALPHABETS = {
  hira: ["あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの", "はひふへほ", "まみむめも", "や_ゆ_よ", "らりるれろ", "わ___を", "ん", "がぎぐげご", "ざじずぜぞ", "だぢづでど", "ばびぶべぼ", "ぱぴぷぺぽ"],
  kata: ["アイウエオ", "カキクケコ", "サシスセソ", "タチツテト", "ナニヌネノ", "ハヒフヘホ", "マミムメモ", "ヤ_ユ_ヨ", "ラリルレロ", "ワ___ヲ", "ン", "ガギグゲゴ", "ザジズゼゾ", "ダヂヅデド", "バビブベボ", "パピプペポ"],
  hangle: ["가나다라마", "바사아자차", "카타파하", "거너더러머", "버서어저처", "커터퍼허", "고노도로모", "보소오조초", "코토포호", "구누두루무", "부수우주추", "쿠투푸후", "그느드르므", "브스으즈츠", "크트프흐", "기니디리미", "비시이지치", "키티피히"],
  ENGLISH: ["ABCD", "EFGH", "IJKL", "MNOP", "QRST", "UVWX", "YZ"],
  english: ["abcd", "efgh", "ijkl", "mnop", "qrst", "uvwx", "yz"]
};

export const INTERVALS = [1, 10, 30, 120, 1440, 4320, 10080, 21600, 43200]; // 단위: 분

const EARLY_RECALL_LATENCY_THRESHOLD_MS = 1200;
const MAX_RESPONSE_LATENCY_CAP_MS = 5000;
const MIN_REQUIRED_FOR_OPTIONS = 4;

export function getFlattenedDataset(domain) {
  const rows = ALPHABETS[domain] || [];
  const flattened = [];
  let idCounter = 0;
  for (const row of rows) {
    for (const char of row) {
      if (char !== '_') {
        flattened.push({ charId: idCounter++, char });
      }
    }
  }
  return flattened;
}

/**
 * 세션 진입 시 단어 풀 구성 함수
 */
export function initSessionPool(domain, dbData = {}, autoProgress = true, MAX_POOL_SIZE = 10) {
  const now = Date.now();
  const allCharacters = getFlattenedDataset(domain);

  const processedData = allCharacters.map(meta => {
    const saved = dbData[meta.charId] || {};
    return {
      domain,
      charId: meta.charId,
      char: meta.char,
      stage: saved.stage !== undefined ? saved.stage : 0,
      recentLatencies: saved.recentLatencies || [],
      latenciesIdx: saved.latenciesIdx || 0,
      outCnt: saved.outCnt || 0,
      resetOutCnt: saved.resetOutCnt || 0,
      totalSolved: saved.totalSolved || 0,
      lastSessionTime: saved.lastSessionTime || 0,
      sessionStreak: saved.sessionStreak || 0,
      hasHistory: saved.totalSolved > 0,
      isEligibleForPromotion: false,
      hasBeenPromotedThisSession: false
    };
  });

  let pool = [];

  const getAvgLatency = (item) => {
    if (!item.recentLatencies || item.recentLatencies.length === 0) return 0;
    return item.recentLatencies.reduce((a, b) => a + b, 0) / item.recentLatencies.length;
  };

  // [1단계] '복습 주기를 채운' 정식 단어 수급
  const reviewCandidates = processedData.filter(item => {
    if (!item.hasHistory) return false;
    const timeDiffMin = (now - item.lastSessionTime) / (60 * 1000);
    return timeDiffMin >= INTERVALS[item.stage];
  });

  // 정식 복습 주기를 채운 후보군은 승급 가능 자격 flag 부여
  reviewCandidates.forEach(item => {
    item.isEligibleForPromotion = true;
  });

  reviewCandidates.sort((a, b) => {
    if (a.stage !== b.stage) return a.stage - b.stage;
    return getAvgLatency(b) - getAvgLatency(a);
  });
  pool = reviewCandidates.slice(0, MAX_POOL_SIZE);

  // [2단계] 빈자리 수급 (조기 소환이므로 승급 불가(flag = false))
  if (pool.length < MAX_POOL_SIZE) {
    const insufficientCandidates = processedData.filter(item => {
      if (!item.hasHistory || pool.some(p => p.charId === item.charId)) return false;
      const avg = getAvgLatency(item);
      return avg > EARLY_RECALL_LATENCY_THRESHOLD_MS;
    });

    insufficientCandidates.sort((a, b) => getAvgLatency(b) - getAvgLatency(a));
    const remain = MAX_POOL_SIZE - pool.length;
    pool = pool.concat(insufficientCandidates.slice(0, remain));
  }

  // [3단계] 자동진도 옵션 신규 단어 진입
  if (pool.length < MAX_POOL_SIZE && autoProgress) {
    const freshNewCandidates = processedData.filter(item => !item.hasHistory);
    if (freshNewCandidates.length > 0) {
      pool.push(freshNewCandidates[0]);
    }
  }

  // [4단계] 잔여 슬롯 방어선 구축
  if (pool.length < MIN_REQUIRED_FOR_OPTIONS) {
    const backupCandidates = processedData.filter(item => {
      return item.hasHistory && !pool.some(p => p.charId === item.charId);
    });
    backupCandidates.sort((a, b) => getAvgLatency(b) - getAvgLatency(a));
    const remain = MIN_REQUIRED_FOR_OPTIONS - pool.length;
    pool = pool.concat(backupCandidates.slice(0, remain));
  }

  if (pool.length < MIN_REQUIRED_FOR_OPTIONS) {
    const freshNewCandidates = processedData.filter(item => !pool.some(p => p.charId === item.charId));
    const remain = MIN_REQUIRED_FOR_OPTIONS - pool.length;
    pool = pool.concat(freshNewCandidates.slice(0, remain));
  }

  if (pool.length > MAX_POOL_SIZE) {
    pool = pool.slice(0, MAX_POOL_SIZE);
  }

  processedData.forEach(item => {
    if (pool.some(p => p.charId === item.charId)) {
      item.sessionStreak++;
    } else {
      item.sessionStreak = 0;
    }
  });

  return pool;
}

export function generateFourOptions(targetItem, currentPool) {
  let distractors = currentPool.filter(item => item.charId !== targetItem.charId);
  distractors = distractors.sort(() => Math.random() - 0.5).slice(0, 3);
  const options = [targetItem.charId, ...distractors.map(d => d.charId)].sort(() => Math.random() - 0.5);
  return { target: targetItem, options };
}

/**
 * 퀴즈 풀이 결과 : 복습 주기 기반 승급 제어
 */
export function calculateReviewState(item, isCorrect, latency) {
  item.totalSolved++;
  item.lastSessionTime = Date.now();
  item.hasHistory = true;

  // 5초 이상 응답 지연 예외 처리
  if (latency >= MAX_RESPONSE_LATENCY_CAP_MS) {
    latency = MAX_RESPONSE_LATENCY_CAP_MS;
    item.resetOutCnt = 0;

    item.recentLatencies = item.recentLatencies || [];
    if (item.recentLatencies.length < 10) {
      item.recentLatencies.push(latency);
    } else {
      item.recentLatencies[item.latenciesIdx] = latency;
    }
    item.latenciesIdx = (item.latenciesIdx + 1) % 10;

    return item;
  }

  // 오답 처리 분기 : 3 Strikes Out -> 기억소실(Stage 0)
  if (!isCorrect) {
    item.outCnt++;
    item.resetOutCnt = 0;

    if (item.outCnt >= 3) {
      item.stage = 0;
      item.outCnt = 0;
      item.resetOutCnt = 0;
      item.recentLatencies = [];
      item.latenciesIdx = 0;
      item.isEligibleForPromotion = false; // 3out 시 승급 기회 박탈
    }
    return item;
  }

  // 정상 정답 처리 분기
  item.recentLatencies = item.recentLatencies || [];
  if (item.recentLatencies.length < 10) {
    item.recentLatencies.push(latency);
  } else {
    item.recentLatencies[item.latenciesIdx] = latency;
  }
  item.latenciesIdx = (item.latenciesIdx + 1) % 10;

  item.resetOutCnt++;
  if (item.resetOutCnt >= 3) {
    item.outCnt = Math.max(0, item.outCnt - 1);
    item.resetOutCnt = 0;
  }

  // 복습 주기를 채우지 못한 조기 소환 문항은 승급 금지
  if (!item.isEligibleForPromotion) {
    // 최초 신규 진입 문항(stage=0)인 경우에만 1단계 활성화 허용
    if (item.stage === 0 && !item.hasBeenPromotedThisSession) {
      item.stage = 1;
      item.hasBeenPromotedThisSession = true;
    }
    return item;
  }

  // 최근 10회 정답 기반 숙련도(평균 속도) 및 반응속도 판단 검증
  if (item.recentLatencies.length < 10) {
    return item;
  }

  const avgLatency = item.recentLatencies.reduce((a, b) => a + b, 0) / item.recentLatencies.length;
  const margin = avgLatency * 0.2;

  if (latency > avgLatency + margin) {
    // 느린 반응 속도 : 취약 -> 강등
    item.stage = Math.max(0, item.stage - 1);
  } else {
    // 복습 주기를 채웠고 속도도 양호함 -> 정석 승급
    if (!item.hasBeenPromotedThisSession) {
      item.stage = Math.min(8, item.stage + 1);
      item.isEligibleForPromotion = false; // 한 세션 내 추가 승급 방지를 위해 자격 해제
      item.hasBeenPromotedThisSession = true;
    }
  }

  return item;
}
