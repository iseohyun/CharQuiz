/**
 * @file main.js
 * @description CharQuiz 애플리케이션의 메인 엔트리 포인트.
 * 세션 워크플로우(학습/기록/관전 모드), 타이머 루프, 원격 모달 마운트 및 전역 단축키 이벤트를 총괄 제어합니다.
 */

import {
  userConfig,
  resetUserConfig,
  TIME_STEPS,
  SPEECH_STEPS
} from './components/store.js';
import {
  initAudioEngine,
  playSoundTest,
  playTargetVoice,
  preloadSessionVoices,
  stopAllVoices
} from './components/audio-manager.js';
import { auth } from './components/firebase-config.js';
import {
  initUser,
  getAllProgress,
  activateSingleCharInDb,
  resetSingleCharInDb,
  unlockAllCharactersInDb,
  resetAllProgressInDb,
  saveSessionPoolState,
  updateDailyStudyTime,
  updateDailyStats,
  getUserConfig,
  saveUserConfig,
  getWeeklyStats,
  submitSpeedrunRanking,
  getGlobalRankings,
  getStudyRankings,
  submitStudyRanking,
  toPersistedSchema,
  findGuestProgressToMerge,
  markGuestMergeHandled,
  mergeGuestProgress
} from './components/db-handler.js';
import {
  generateKeybindingsHtml,
  bindKeybindingSettingsEvents,
  updateVisualBadges,
  registerGlobalKeybindings
} from './components/keybind-manager.js';
import { bindSuggestionEvents } from './components/suggestion-handler.js';
import {
  initSessionPool,
  generateFourOptions,
  calculateReviewState,
  isDueForReview,
  ALPHABETS,
  INTERVALS
} from './components/engine.js';
import {
  renderStudyStatsChart,
  renderResponseTimeChart,
  renderProgressTable,
  getStageColor,
  toggleAnalysisMode,
  renderLeaderboardUI
} from './components/ui-modal-handler.js';
import {
  initNotificationToken,
  getNotificationState,
  requestNotificationPermission,
  scheduleReviewNotification
} from './components/notification-handler.js';
import {
  initAuthObserver,
  getActiveAuthProvider,
  getLoginSuccessHistory,
  recordLoginSuccess,
  formatUserEmailForDisplay,
  googleLogin,
  kakaoLogin,
  naverLogin,
  logoutUser
} from './components/auth-handler.js';

window.playSoundTest = playSoundTest;
window.toggleAnalysisMode = toggleAnalysisMode;

// AI 자율 자가 교정 오디오 TC 시스템 (Self-Checking TC Engine) 단일 정의
window.runAutonomousAudioTC = async function (charList = ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ"]) {
  console.log(`%c[Autonomous Audio TC 🚀] 가나 문항 실제 오디오 스피커 파동 진폭(Decibel > 0dB) 100% 자율 자가 검증 시작!`, 'color: #3b82f6; font-weight: bold; font-size: 15px;');
  let passCount = 0;
  let failCount = 0;
  const testResults = [];

  for (let i = 0; i < charList.length; i++) {
    const charStr = charList[i];
    const result = playTargetVoice(charStr);

    if (result && result.pass) {
      passCount++;
      testResults.push({ char: charStr, status: 'PASS', decibel: result.decibel });
    } else {
      failCount++;
      testResults.push({ char: charStr, status: 'FAIL', decibel: 0 });
    }

    await new Promise(r => setTimeout(r, 150));
  }

  console.log(`%c[Autonomous Audio TC Report 📊] 검증 결과: PASS ${passCount}개 / FAIL ${failCount}개 (총 ${charList.length}문항)`, passCount === charList.length ? 'color: #10b981; font-weight: bold; font-size: 14px;' : 'color: #ef4444; font-weight: bold; font-size: 14px;');
  console.table(testResults);
  return { passCount, failCount, total: charList.length };
};

const MIN_CLICK_LATENCY_MS = 150;
const OPTION_KEYBIND_HINTS = ['4 / A', '5 / S', '1 / Z', '2 / X'];

const MAIN_SELECTION_HTML = `
  <div id="mode-selection-layer" class="mode-selection">
    <button class="mode-btn mode-study" onclick="startSessionWorkflow('study')">
      <div class="mode-btn-content">
        <span class="material-symbols-outlined mode-icon">menu_book</span>
        <span class="mode-title">학습 모드</span>
        <span class="mode-desc">반복 오디오 퀴즈로 가나 익히기</span>
      </div>
      <span class="keybind-badge" id="kb-badge-startStudy">Q</span>
    </button>

    <button class="mode-btn mode-record" onclick="startSessionWorkflow('record')">
      <div class="mode-btn-content">
        <span class="material-symbols-outlined mode-icon">timer</span>
        <span class="mode-title">기록 모드</span>
        <span class="mode-desc">타임어택으로 암기 속도 측정</span>
      </div>
      <span class="keybind-badge" id="kb-badge-startRecord">W</span>
    </button>

    <button class="mode-btn mode-spectator" onclick="startSessionWorkflow('spectator')">
      <div class="mode-btn-content">
        <span class="material-symbols-outlined mode-icon">visibility</span>
        <span class="mode-title">관전 모드</span>
        <span class="mode-desc">자동 재생으로 편안하게 복습</span>
      </div>
      <span class="keybind-badge" id="kb-badge-startSpectator">E</span>
    </button>

    <div class="mode-info-card">
      <span class="material-symbols-outlined info-card-icon">auto_awesome</span>
      <div class="info-card-text">
        <strong>CharQuiz</strong>
        <p>단축키(Q, W, E, 1~5)와 퀴즈 루프로 빠르게 가나를 마스터하세요.</p>
      </div>
    </div>
  </div>
`;

let currentMode = 'study'; // 'study', 'record', 'spectator'
let currentPool = [];
let currentQuestion = null;
let sessionHistory = [];
let initialStages = {};
let spectatorIntervalId = null;
let lastSpectatorCharId = null;

let timeLeft = 30;
let timerInterval = null;
let questionStartTime = 0;

let isPaused = false;
let isTimeUp = false;

// 스피드런(기록 모드) 전용 상태 변수
let srElapsedTime = 0;
let srTotalCount = 0;
let srCurrentIndex = 0;
let srCorrectCount = 0;

window.addEventListener('load', initApp);

async function initApp() {
  // 웹 푸시 알림: 이미 허용된 경우에만 토큰을 조용히 받는다. 권한 요청은 설정의 「알림 켜기」 버튼에서만 한다.
  initNotificationToken();

  // 오디오 엔진 초기화
  const audioReady = await initAudioEngine();
  console.log(audioReady ? "[Init] 멀티 보이스 Web Audio 엔진 스탠바이 완결 🚀" : "[Init] 오디오 엔진 초기화 실패");

  // 인증 모듈 상태 변화 관찰(Observer) 가동
  initAuthObserver(async (user) => {
    // 계정이 바뀔 때(로그인/로그아웃) 이전 사용자의 설정이 메모리에 남지 않도록 기본값으로 되돌린다
    resetUserConfig();
    updateHeaderAuthUI(user);
    renderLoginModalState(user);

    if (user) {
      recordLoginSuccess(getActiveAuthProvider(user));
      console.log(`[Observer] 로그인 확인: ${user.displayName}`);
      await initUser(user.uid);
      await offerGuestProgressMerge();
    } else {
      console.log("게스트 임시 세션으로 구동을 시작합니다.");
      await initUser(null);
    }

    // 로그인 사용자와 게스트 모두 저장된 설정을 불러온다 (기존에는 게스트 설정이 새로고침마다 초기화됨)
    applySavedConfig(await getUserConfig());

    window.currentDomain = userConfig.currentDomain;
    updateDomainUI();
    resetToMainModeSelection();

    updateVisualBadges(userConfig);
    updateReviewCountBadge();
    updateTimerProgressBar(userConfig.learningTime, userConfig.learningTime);
  });
}

/**
 * 저장된 설정을 userConfig 에 반영한다. 새로 추가된 단축키 항목은 기본값을 유지한다.
 * @param {object|null} savedConfig
 */
function applySavedConfig(savedConfig) {
  if (!savedConfig) return;
  savedConfig.keybindings = savedConfig.keybindings
    ? Object.assign({}, userConfig.keybindings, savedConfig.keybindings)
    : JSON.parse(JSON.stringify(userConfig.keybindings));
  Object.assign(userConfig, savedConfig);
}

/**
 * 로그인 직후, 같은 기기에서 게스트로 학습한 기록을 계정으로 가져올지 묻는다.
 * 계정 기록이 더 최신인 문자는 건드리지 않는다.
 */
async function offerGuestProgressMerge() {
  const candidate = findGuestProgressToMerge();
  if (!candidate || candidate.items.length === 0) return;

  const shouldMerge = confirm(
    `이 기기에서 게스트로 학습한 기록이 ${candidate.items.length}개 문자 있습니다.\n` +
    `로그인한 계정으로 가져올까요?\n\n(계정 기록이 더 최신인 문자는 그대로 둡니다)`
  );
  markGuestMergeHandled(candidate.flagKey);
  if (!shouldMerge) return;

  const mergedCount = await mergeGuestProgress(candidate.items);
  console.log(`[GuestMerge] 게스트 학습 기록 ${mergedCount}개 문자를 계정으로 가져왔습니다.`);
}

const PROVIDER_META = {
  google: { label: 'Google 계정', short: 'G', className: 'provider-google' },
  kakao: { label: '카카오 계정', short: 'K', className: 'provider-kakao' },
  naver: { label: '네이버 계정', short: 'N', className: 'provider-naver' }
};

/**
 * 상단 헤더 좌측 사용자 프로필 표시(플랫폼 칩 및 이름)를 로그인 상태에 맞춰 갱신한다.
 * @param {object|null} user
 */
function updateHeaderAuthUI(user) {
  const userNameDisplay = document.getElementById('profile-name');
  const iconEl = document.getElementById('header-auth-icon');
  const chipEl = document.getElementById('header-provider-chip');

  if (user) {
    const pureName = (user.displayName || '사용자').split(' ')[0].split('(')[0].trim();
    if (userNameDisplay) userNameDisplay.innerText = pureName;

    const provider = getActiveAuthProvider(user);
    const meta = PROVIDER_META[provider] || PROVIDER_META.google;
    if (iconEl) iconEl.classList.add('hidden');
    if (chipEl) {
      chipEl.className = `header-provider-chip ${meta.className}`;
      chipEl.innerText = meta.short;
      chipEl.title = `${meta.label}으로 로그인됨`;
    }
  } else {
    if (userNameDisplay) userNameDisplay.innerText = '게스트';
    if (iconEl) iconEl.classList.remove('hidden');
    if (chipEl) {
      chipEl.className = 'header-provider-chip hidden';
      chipEl.innerText = '';
    }
  }
}

/**
 * 열려 있는 로그인 모달(view/login.html)의 화면을 로그인 여부에 따라 전환한다.
 * - 비로그인: 소셜 로그인 버튼 3종 노출 (로그아웃 숨김)
 * - 로그인됨: 현재 로그인된 플랫폼/계정 정보 카드 및 로그아웃 버튼 노출
 * @param {object|null} [user=auth.currentUser]
 */
function renderLoginModalState(user = auth.currentUser) {
  const modalRoot = document.getElementById('auth-modal-root');
  if (!modalRoot) return;

  const guestView = document.getElementById('auth-guest-view');
  const userView = document.getElementById('auth-user-view');
  const modalTitleEl = modalRoot.closest('.modal-content')?.querySelector('.modal-title');

  if (!user) {
    if (modalTitleEl) modalTitleEl.innerText = '간편 로그인';
    guestView?.classList.remove('hidden');
    userView?.classList.add('hidden');

    // 과거 로그인 성공 이력 확인:
    // - 한 번도 로그인한 적이 없으면(history.length === 0) 3개 모두 선명하게 활성화
    // - 성공 이력이 있으면 성공한 적 없는 로그인 수단만 음영(.social-unvisited) 처리 (클릭은 가능)
    const history = getLoginSuccessHistory();
    const hasAnyHistory = history.length > 0;
    modalRoot.querySelectorAll('.social-login-btn[data-provider]').forEach((btn) => {
      const provider = btn.dataset.provider;
      const hasSucceededBefore = history.includes(provider);
      btn.classList.toggle('social-unvisited', hasAnyHistory && !hasSucceededBefore);

      let usedBadge = btn.querySelector('.social-used-badge');
      if (hasAnyHistory && hasSucceededBefore) {
        if (!usedBadge) {
          usedBadge = document.createElement('span');
          usedBadge.className = 'social-used-badge';
          usedBadge.innerText = '사용 이력';
          btn.appendChild(usedBadge);
        }
      } else if (usedBadge) {
        usedBadge.remove();
      }
    });
    return;
  }

  if (modalTitleEl) modalTitleEl.innerText = '로그인 계정';
  guestView?.classList.add('hidden');
  userView?.classList.remove('hidden');

  const provider = getActiveAuthProvider(user);
  const meta = PROVIDER_META[provider] || PROVIDER_META.google;

  const badgeEl = document.getElementById('auth-provider-badge');
  if (badgeEl) {
    badgeEl.className = `auth-provider-badge ${meta.className}`;
    badgeEl.innerText = meta.label;
  }

  const nameEl = document.getElementById('auth-user-name');
  if (nameEl) {
    nameEl.innerText = (user.displayName || '사용자').split('(')[0].trim();
  }

  const emailEl = document.getElementById('auth-user-email');
  if (emailEl) {
    emailEl.innerText = formatUserEmailForDisplay(user) || `${meta.label} 연동됨`;
  }

  const avatarBox = document.getElementById('auth-avatar-box');
  if (avatarBox) {
    avatarBox.innerHTML = '';
    if (user.photoURL) {
      const img = document.createElement('img');
      img.src = user.photoURL;
      img.alt = '프로필 이미지';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        avatarBox.innerHTML = '<span class="material-symbols-outlined">person</span>';
      };
      avatarBox.appendChild(img);
    } else {
      avatarBox.innerHTML = '<span class="material-symbols-outlined">person</span>';
    }
  }
}

/**
 * 진행 중인 모든 세션 타이머(학습/기록 타이머, 관전 루프)와 음성을 정지한다.
 * 새 세션을 시작하거나 메인 화면으로 돌아갈 때 이전 루프가 백그라운드에서 계속 도는 것을 막는다.
 */
function stopAllSessionTimers() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (spectatorIntervalId) {
    clearInterval(spectatorIntervalId);
    spectatorIntervalId = null;
  }
  stopAllVoices();
}

// 모드 진입 중복 실행 방지 (버튼 연타, 단축키 반복 입력)
let isStartingSession = false;

/**
 * 모드 선택 버튼 클릭 시 초기 화면을 가리고 게임창을 기동하는 진입점
 */
window.startSessionWorkflow = async function (mode) {
  if (isStartingSession) return;
  isStartingSession = true;
  stopAllSessionTimers();
  currentMode = mode;
  try {
    const versionQuery = (window.CACHE_BUST || window.APP_VERSION) ? `?v=${window.CACHE_BUST || window.APP_VERSION}` : '';
    const viewFile = mode === 'spectator' ? 'spectatorMode' : 'studyMode';
    const response = await fetch(`./view/${viewFile}.html${versionQuery}`);
    if (!response.ok) throw new Error(`${viewFile}.html 수급 실패`);

    const htmlContent = await response.text();
    const mainBox = document.getElementById('main-box');
    if (mainBox) mainBox.innerHTML = htmlContent;

    const userInfoRight = document.querySelector('.user-info-right');
    if (userInfoRight) userInfoRight.classList.add('hidden');

    const headerQuizControl = document.getElementById('header-quiz-control');
    if (headerQuizControl) headerQuizControl.style.display = 'flex';

    const title = document.getElementById('current-mode-title');
    const badge = document.getElementById('header-mode-badge');
    const badgeIcon = badge?.querySelector('.mode-badge-icon');
    const pauseBtn = document.getElementById('header-pause-btn');
    const stopBtn = document.getElementById('header-stop-btn');

    if (pauseBtn) {
      pauseBtn.style.display = 'flex';
      pauseBtn.setAttribute('aria-label', '일시정지');
      pauseBtn.setAttribute('title', '일시정지');
      pauseBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1.3rem;">pause</span>';
      pauseBtn.style.background = '';
      pauseBtn.style.borderColor = '';
    }
    if (stopBtn) {
      stopBtn.style.display = 'flex';
      const stopTitle = mode === 'spectator' ? '관전 종료' : '중단';
      stopBtn.setAttribute('aria-label', stopTitle);
      stopBtn.setAttribute('title', stopTitle);
    }

    if (title && badge) {
      if (mode === 'study') {
        title.innerText = '학습 모드';
        badge.className = 'mode-badge study';
        if (badgeIcon) badgeIcon.innerText = 'school';
      } else if (mode === 'record') {
        title.innerText = '기록 모드';
        badge.className = 'mode-badge record';
        if (badgeIcon) badgeIcon.innerText = 'timer';
      } else if (mode === 'spectator') {
        title.innerText = '관전 모드 (LIVE)';
        badge.className = 'mode-badge spectator';
        if (badgeIcon) badgeIcon.innerText = 'visibility';
      }
    }

    if (mode === 'study') {
      await startQuizSession();
    } else if (mode === 'record') {
      await startSpeedrunSession();
    } else if (mode === 'spectator') {
      await startSpectatorSession();
    }
  } catch (error) {
    console.error("세션 진입 중 에러 발생:", error);
  } finally {
    isStartingSession = false;
  }
};

/**
 * 4지선다 옵션 버튼 DOM 렌더링 공통 헬퍼
 */
function renderOptionButtons(optionsContainer, onAnswerCallback) {
  currentQuestion.options.forEach((charId, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';

    const matchingItem = currentPool.find(p => p.charId === charId);
    const charText = matchingItem ? matchingItem.char : '';
    btn.innerHTML = `<span class="keybind-hint">${OPTION_KEYBIND_HINTS[idx]}</span><span>${charText}</span>`;
    btn.dataset.charId = charId;

    btn.onclick = () => {
      const latency = Date.now() - questionStartTime;
      if (latency < MIN_CLICK_LATENCY_MS) return;
      onAnswerCallback(charId, latency);
    };
    optionsContainer.appendChild(btn);
  });
}

/**
 * 오답 피드백 시각/청각 효과 공통 헬퍼
 */
async function handleErrorFeedback(targetCharId) {
  const feedbackMode = userConfig.errorFeedbackMode || 'both';
  if (feedbackMode !== 'none') {
    if (feedbackMode === 'both' && window.audioTriggerClick) window.audioTriggerClick();

    const correctBtn = document.querySelector(`.option-btn[data-char-id="${targetCharId}"]`);
    if (correctBtn) {
      correctBtn.style.transition = 'background-color 1s ease, color 1s ease';
      correctBtn.style.backgroundColor = '#4CAF50';
      correctBtn.style.color = 'white';
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  } else {
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

/**
 * 퀴즈 풀이 화면 기동 및 예약 풀 세팅
 */
async function startQuizSession() {
  isTimeUp = false;
  isPaused = false;
  sessionHistory = [];

  const historyBar = document.getElementById('history-bar');
  if (historyBar) historyBar.innerHTML = '';

  const dbData = await getAllProgress(userConfig.currentDomain);
  currentPool = initSessionPool(userConfig.currentDomain, dbData, userConfig.autoProgress, userConfig.MAX_POOL_SIZE);

  if (!currentPool || currentPool.length === 0) {
    alert("선택된 도메인에 출제 가능한 가나 후보군이 존재하지 않습니다.");
    return;
  }

  initialStages = {};
  currentPool.forEach(item => {
    initialStages[item.charId] = item.stage;
  });

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) {
    userInfoRight.classList.add('hidden');
  }

  await preloadSessionVoices(currentPool);

  timeLeft = userConfig.learningTime;
  updateTimerProgressBar(timeLeft, userConfig.learningTime);
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickSessionTimer, 1000);

  await renderNextQuestion();
}

/**
 * 복습 풀 내에서 무작위 4지선다 결합 후 화면 출력
 */
async function renderNextQuestion() {
  const optionsContainer = document.getElementById('options');
  if (!optionsContainer) return;
  optionsContainer.innerHTML = '';
  optionsContainer.style.pointerEvents = 'auto';

  const targetItem = currentPool[Math.floor(Math.random() * currentPool.length)];
  currentQuestion = generateFourOptions(targetItem, currentPool);

  window.lastQuestionTime = Date.now();
  console.log(`[TTS Profiler 📝] 문항 출제 완료: Target = '${currentQuestion.target.char}' (${window.lastQuestionTime} ms)`);

  updatePoolIndicatorUI();

  window.audioTriggerClick = () => {
    playTargetVoice(currentQuestion.target.char);
  };

  const audioBtn = document.getElementById('audio-trigger');
  if (audioBtn) {
    audioBtn.onclick = window.audioTriggerClick;
  }

  window.audioTriggerClick();
  questionStartTime = Date.now();

  renderOptionButtons(optionsContainer, handleUserAnswer);
}

/**
 * 유저 응답 결과 정산 및 가중치 업데이트 스케줄링 처리
 */
async function handleUserAnswer(selectedCharId, latency) {
  const optionsContainer = document.getElementById('options');
  if (optionsContainer) {
    optionsContainer.style.pointerEvents = 'none';
  }

  const target = currentQuestion.target;
  const isCorrect = selectedCharId === target.charId;

  const updatedItem = calculateReviewState({ ...target }, isCorrect, latency);
  const poolIdx = currentPool.findIndex(p => p.charId === target.charId);
  if (poolIdx !== -1) currentPool[poolIdx] = updatedItem;
  updatePoolIndicatorUI();

  sessionHistory.push({
    char: target.char,
    isCorrect: isCorrect,
    speed: latency
  });
  updateHistoryBarUI();

  if (!isCorrect) {
    await handleErrorFeedback(target.charId);
  }

  if (isTimeUp) {
    await terminateQuizSession();
  } else {
    await renderNextQuestion();
  }
}

function tickSessionTimer() {
  timeLeft--;
  if (timeLeft <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    isTimeUp = true;

    const weightDisplay = document.getElementById('weight-display');
    if (weightDisplay) {
      weightDisplay.innerText = "⏰ 시간 만료! 마지막 문항 정산 중...";
      weightDisplay.style.color = "#dc3545";
    }
  } else {
    updateTimerProgressBar(timeLeft, userConfig.learningTime);
  }
}

function updateTimerProgressBar(left, total) {
  const timerBar = document.getElementById('timer-progress-bar');
  if (timerBar) {
    const percentage = ((total - left) / total) * 100;
    timerBar.style.width = percentage + '%';
  }
}

/**
 * 랭킹 기록용 도메인 명칭 및 플레이어 이름 추출 헬퍼
 */
function resolveRankingMetadata() {
  let recordDomain = userConfig.currentDomain;
  if (recordDomain.toLowerCase() === 'english' || recordDomain.toLowerCase() === 'alphabet') {
    const sampleItem = currentPool.find(p => /[a-zA-Z]/.test(p.char));
    const sampleChar = sampleItem ? sampleItem.char : 'A';
    recordDomain = (sampleChar === sampleChar.toUpperCase()) ? 'english(A)' : 'english(a)';
  }

  let playerName = document.getElementById('profile-name')?.innerText ||
    (auth.currentUser ? (auth.currentUser.displayName || "이름 없음") : (localStorage.getItem('GUEST_ID') || "게스트"));
  if (playerName.includes('(')) playerName = playerName.split('(')[0].trim();

  return { recordDomain, playerName };
}

/**
 * 세션이 정상 타임아웃 종료되었을 때 성적 요약 및 최종 알림 예약 프로세스 마감
 */
async function terminateQuizSession() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  isTimeUp = false;
  isPaused = false;

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) {
    userInfoRight.classList.remove('hidden');
  }

  resetToMainModeSelection();

  try {
    await saveSessionPoolState(userConfig.currentDomain, currentPool);
    console.log("세션 풀 스트릭 데이터 일괄 동기화 완료.");

    const playedTime = Math.max(0, userConfig.learningTime - timeLeft);
    await updateDailyStudyTime(playedTime, userConfig.currentDomain);

    const correctLogs = sessionHistory.filter(h => h.isCorrect);
    if (correctLogs.length > 0) {
      const calcAvg = (arr) => arr.reduce((sum, log) => sum + log.speed, 0) / arr.length;
      const avgAll = calcAvg(correctLogs);
      const avgR10 = calcAvg(correctLogs.slice(-10));
      const avgR5 = calcAvg(correctLogs.slice(-5));

      await updateDailyStats(avgAll, avgR10, avgR5);
    }

    const nextTargetStage = Math.min(...currentPool.map(p => p.stage));
    const delayMin = INTERVALS[nextTargetStage] || 10;

    await scheduleReviewNotification(userConfig.currentDomain, delayMin);
    updateReviewCountBadge();

    const correctCount = correctLogs.length;
    const accuracy = sessionHistory.length > 0 ? Math.round((correctCount / sessionHistory.length) * 100) : 0;
    const { recordDomain, playerName } = resolveRankingMetadata();

    await submitStudyRanking(recordDomain, correctCount, playedTime, accuracy, playerName);
    console.log(`[Quiz] 학습 세션 정상 마감 완료 - 정답수: ${correctCount}, 시간: ${formatTime(playedTime)}, 정답률: ${accuracy}%`);
  } catch (dbError) {
    console.warn("[LocalFirst] 학습모드 완료 백엔드 등록 안내 (로컬 저장 완료):", dbError.message || dbError);
  }
}

function buildFullDomainPool(domain) {
  let rawDataset = ALPHABETS[domain] || [];
  if (typeof rawDataset === 'string') rawDataset = [rawDataset];
  const pool = [];
  let globalIdx = 0;
  rawDataset.forEach((rowStr) => {
    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char !== '_') {
        pool.push({ domain, charId: globalIdx, char, stage: 0 });
        globalIdx++;
      }
    }
  });
  return pool;
}

async function startSpeedrunSession() {
  isTimeUp = false;
  isPaused = false;
  sessionHistory = [];

  const historyBar = document.getElementById('history-bar');
  if (historyBar) historyBar.innerHTML = '';

  const dbData = await getAllProgress(userConfig.currentDomain);
  const fullPool = buildFullDomainPool(userConfig.currentDomain);
  const now = Date.now();

  currentPool = fullPool.map(item => {
    const dbItem = dbData[item.charId.toString()];
    if (!dbItem) return { ...item, isUnlocked: false };

    // DB에 남아 있을 수 있는 세션 전용 플래그(isEligibleForPromotion 등)는 버리고,
    // 승급 자격은 학습 모드와 같은 기준(복습 주기 충족 여부)으로 다시 계산한다.
    const saved = toPersistedSchema(dbItem);
    return {
      ...saved,
      domain: userConfig.currentDomain,
      charId: item.charId,
      char: item.char,
      stage: saved.stage || 0,
      recentLatencies: saved.recentLatencies || [],
      latenciesIdx: saved.latenciesIdx || 0,
      outCnt: saved.outCnt || 0,
      resetOutCnt: saved.resetOutCnt || 0,
      totalSolved: saved.totalSolved || 0,
      hasHistory: (saved.totalSolved || 0) > 0,
      isEligibleForPromotion: isDueForReview(saved, now),
      hasBeenPromotedThisSession: false,
      isUnlocked: (saved.stage || 0) > 0
    };
  });

  currentPool.sort(() => Math.random() - 0.5);

  if (!currentPool || currentPool.length === 0) {
    alert("선택된 도메인에 출제 가능한 문자가 없습니다.");
    return;
  }

  srTotalCount = currentPool.length;
  srCurrentIndex = 0;
  srCorrectCount = 0;
  srElapsedTime = 0;

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) userInfoRight.classList.add('hidden');

  await preloadSessionVoices(currentPool);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickSpeedrunTimer, 1000);

  await renderNextSpeedrunQuestion();
}

async function renderNextSpeedrunQuestion() {
  const optionsContainer = document.getElementById('options');
  if (!optionsContainer) return;
  optionsContainer.innerHTML = '';
  optionsContainer.style.pointerEvents = 'auto';

  if (srCurrentIndex >= srTotalCount) {
    await terminateSpeedrunSession();
    return;
  }

  const targetItem = currentPool[srCurrentIndex];
  currentQuestion = generateFourOptions(targetItem, currentPool);

  const weightDisplay = document.getElementById('weight-display');
  if (weightDisplay) {
    weightDisplay.innerText = `진행률: ${srCurrentIndex + 1} / ${srTotalCount} | ⏱️ ${formatTime(srElapsedTime)}`;
  }

  updateTimerProgressBar(srTotalCount - (srCurrentIndex + 1), srTotalCount);

  window.audioTriggerClick = () => { playTargetVoice(currentQuestion.target.char); };
  const audioBtn = document.getElementById('audio-trigger');
  if (audioBtn) audioBtn.onclick = window.audioTriggerClick;

  window.audioTriggerClick();
  questionStartTime = Date.now();

  renderOptionButtons(optionsContainer, handleSpeedrunAnswer);
}

async function handleSpeedrunAnswer(selectedCharId, latency) {
  const optionsContainer = document.getElementById('options');
  if (optionsContainer) optionsContainer.style.pointerEvents = 'none';

  const target = currentQuestion.target;
  const isCorrect = selectedCharId === target.charId;

  if (isCorrect) srCorrectCount++;

  if (target.isUnlocked) {
    const updatedItem = calculateReviewState({ ...target }, isCorrect, latency);
    currentPool[srCurrentIndex] = { ...updatedItem, isUnlocked: true };
  }

  sessionHistory.push({ char: target.char, isCorrect, speed: latency });
  updateHistoryBarUI();

  if (!isCorrect) {
    await handleErrorFeedback(target.charId);
  }

  srCurrentIndex++;
  await renderNextSpeedrunQuestion();
}

function tickSpeedrunTimer() {
  srElapsedTime++;
  const weightDisplay = document.getElementById('weight-display');
  if (weightDisplay && currentMode !== 'study') {
    weightDisplay.innerText = `진행률: ${srCurrentIndex + 1 > srTotalCount ? srTotalCount : srCurrentIndex + 1} / ${srTotalCount} | ⏱️ ${formatTime(srElapsedTime)}`;
  }
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

async function terminateSpeedrunSession() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isPaused = false;
  isTimeUp = false;

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) userInfoRight.classList.remove('hidden');

  resetToMainModeSelection();

  try {
    const itemsToSave = currentPool.filter(item => item.isUnlocked);
    if (itemsToSave.length > 0) {
      await saveSessionPoolState(userConfig.currentDomain, itemsToSave);
      console.log(`스피드런 세션 해금 문자 진도 동기화 완료 (${itemsToSave.length}개)`);
    }

    await updateDailyStudyTime(srElapsedTime, userConfig.currentDomain);

    const accuracy = Math.round((srCorrectCount / srTotalCount) * 100);
    const { recordDomain, playerName } = resolveRankingMetadata();

    await submitSpeedrunRanking(recordDomain, srTotalCount, srElapsedTime, accuracy, playerName);
    console.log(`[Speedrun] 기록 모드 완료 - 소요 시간: ${formatTime(srElapsedTime)}, 정답률: ${accuracy}%`);
  } catch (dbError) {
    console.error("스피드런 데이터 처리 중 예외 발생:", dbError);
  }
}

/**
 * 관전 모드 기동 및 설정
 */
async function startSpectatorSession() {
  stopAllVoices();
  lastSpectatorCharId = null;

  const dbData = await getAllProgress(userConfig.currentDomain);

  const allCharacters = [];
  const rows = ALPHABETS[userConfig.currentDomain] || [];
  let idCounter = 0;
  for (const row of rows) {
    for (const char of row) {
      if (char !== '_') {
        const saved = dbData[idCounter] || {};
        allCharacters.push({
          domain: userConfig.currentDomain,
          charId: idCounter,
          char,
          stage: saved.stage !== undefined ? saved.stage : 0,
          recentLatencies: saved.recentLatencies || [],
          latenciesIdx: saved.latenciesIdx || 0,
          outCnt: saved.outCnt || 0,
          resetOutCnt: saved.resetOutCnt || 0,
          totalSolved: saved.totalSolved || 0,
          lastSessionTime: saved.lastSessionTime || 0,
          sessionStreak: saved.sessionStreak || 0,
          hasHistory: (saved.totalSolved || 0) > 0,
          isEligibleForPromotion: false
        });
        idCounter++;
      }
    }
  }

  let unlocked = allCharacters.filter(item => item.hasHistory);
  if (unlocked.length === 0) {
    unlocked = allCharacters.slice(0, 10);
  }

  const getAvg = (item) => {
    if (!item.recentLatencies || item.recentLatencies.length === 0) return 0;
    return item.recentLatencies.reduce((a, b) => a + b, 0) / item.recentLatencies.length;
  };

  unlocked.sort((a, b) => getAvg(b) - getAvg(a));
  currentPool = unlocked.slice(0, 10);

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) userInfoRight.classList.add('hidden');

  await preloadSessionVoices(currentPool);

  initialStages = {};
  currentPool.forEach(item => {
    initialStages[item.charId] = item.stage;
  });
  updatePoolIndicatorUI();

  const intervalMs = (userConfig.spectatorInterval || 1) * 1000;
  tickSpectator();

  if (spectatorIntervalId) clearInterval(spectatorIntervalId);
  spectatorIntervalId = setInterval(tickSpectator, intervalMs);

  timeLeft = userConfig.learningTime;
  updateTimerProgressBar(timeLeft, userConfig.learningTime);
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickSpectatorSessionTimer, 1000);
}

function tickSpectatorSessionTimer() {
  timeLeft--;
  if (timeLeft <= 0) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    terminateSpectatorSession();
  } else {
    updateTimerProgressBar(timeLeft, userConfig.learningTime);
  }
}

/**
 * 1주기마다 글자를 무작위 선택하여 음성 및 글자 출력 (단, 2번 연속 선택 불가)
 */
function tickSpectator() {
  if (currentPool.length === 0) return;

  const candidates = currentPool.filter(item => item.charId !== lastSpectatorCharId);
  const nextItem = candidates.length > 0
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : currentPool[0];

  lastSpectatorCharId = nextItem.charId;

  const charEl = document.getElementById('spectator-char');
  if (charEl) {
    charEl.innerText = nextItem.char;
    charEl.classList.remove('pulse-scale');
    void charEl.offsetWidth;
    charEl.classList.add('pulse-scale');
  }

  playTargetVoice(nextItem.char);

  const badges = document.querySelectorAll('.pool-badge');
  badges.forEach(badge => {
    const bCharId = parseInt(badge.dataset.charId, 10);
    if (bCharId === nextItem.charId) {
      badge.style.transform = 'scale(1.25)';
      badge.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
      badge.style.border = '2.5px solid #2b2b2b';
      badge.style.zIndex = '10';
    } else {
      badge.style.transform = 'none';
      badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      badge.style.zIndex = '1';

      const item = currentPool.find(p => p.charId === bCharId);
      if (item) {
        if (item.isEligibleForPromotion) {
          badge.style.border = '1.5px solid #2b8a3e';
        } else if (!item.hasHistory) {
          badge.style.border = '1.5px dashed #868e96';
        } else {
          badge.style.border = 'none';
        }
      }
    }
  });
}

/**
 * 관전 모드 종료 시 리셋 프로세스
 */
function terminateSpectatorSession() {
  if (spectatorIntervalId) {
    clearInterval(spectatorIntervalId);
    spectatorIntervalId = null;
  }

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) userInfoRight.classList.remove('hidden');

  resetToMainModeSelection();
}

window.exitSpectatorTrigger = function () {
  terminateSpectatorSession();
};

// 퀴즈 / 학습 / 기록 / 관전 모드 세션 중단 트리거 (팝업 확인 후 안전 종료)
window.exitQuizTrigger = function () {
  if (isTimeUp) return;

  const wasPaused = isPaused;
  const wasInterval = timerInterval;
  const wasSpectatorInterval = spectatorIntervalId;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (spectatorIntervalId) {
    clearInterval(spectatorIntervalId);
    spectatorIntervalId = null;
  }
  stopAllVoices();

  const promptMsg = currentMode === 'spectator'
    ? "관전을 종료하고 메인 화면으로 돌아가시겠습니까?"
    : "현재 학습 세션을 중단하고 메인 화면으로 돌아가시겠습니까?";

  const confirmExit = confirm(promptMsg);
  if (confirmExit) {
    if (currentMode === 'study') {
      terminateQuizSession();
    } else if (currentMode === 'record') {
      terminateSpeedrunSession();
    } else {
      terminateSpectatorSession();
    }
  } else {
    if (!wasPaused) {
      isPaused = false;
      if (wasInterval) {
        if (currentMode === 'study') {
          timerInterval = setInterval(tickSessionTimer, 1000);
        } else if (currentMode === 'record') {
          timerInterval = setInterval(tickSpeedrunTimer, 1000);
        } else if (currentMode === 'spectator') {
          timerInterval = setInterval(tickSpectatorSessionTimer, 1000);
        }
      }
      if (wasSpectatorInterval && currentMode === 'spectator') {
        const intervalMs = (userConfig.spectatorInterval || 1) * 1000;
        spectatorIntervalId = setInterval(tickSpectator, intervalMs);
      }
      if (currentMode !== 'spectator' && window.audioTriggerClick) {
        window.audioTriggerClick();
      }
    }
  }
};

/**
 * 세션 타임아웃 또는 강제 이탈 시 메인 선택 화면으로 리셋 복귀
 */
function resetToMainModeSelection() {
  stopAllSessionTimers();

  const headerQuizControl = document.getElementById('header-quiz-control');
  if (headerQuizControl) headerQuizControl.style.display = 'none';

  const userInfoRight = document.querySelector('.user-info-right');
  if (userInfoRight) userInfoRight.classList.remove('hidden');

  const mainBox = document.getElementById('main-box');
  if (mainBox) {
    mainBox.innerHTML = MAIN_SELECTION_HTML;
    updateVisualBadges(userConfig);
  }

  updateReviewCountBadge();
}

/**
 * 활성화된 도메인에 맞춰 상단 UI 버튼의 텍스트(아이콘)를 동기화하는 함수
 */
function updateDomainUI() {
  const domainBtn = document.querySelector(".domain-btn");
  if (domainBtn) {
    const targetDataset = ALPHABETS[userConfig.currentDomain];
    if (targetDataset && targetDataset.length > 0) {
      const firstItem = targetDataset[0];
      const representChar = (typeof firstItem === 'object' && firstItem.char) ? firstItem.char : firstItem;
      domainBtn.innerText = representChar.charAt(0);
    } else {
      domainBtn.innerText = "?";
    }
  }
}

// 세션 도중 일시정지 / 재개 버튼 토글 핸들러 (학습/기록/관전 모드 공통 지원)
window.pauseGameTrigger = function () {
  if (isTimeUp) return;

  const pauseBtn = document.getElementById('header-pause-btn') || document.querySelector('.pause-btn');
  const optionsContainer = document.getElementById('options');

  if (!isPaused) {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (spectatorIntervalId) {
      clearInterval(spectatorIntervalId);
      spectatorIntervalId = null;
    }
    isPaused = true;
    stopAllVoices();

    if (optionsContainer) {
      optionsContainer.style.pointerEvents = 'none';
      optionsContainer.style.opacity = '0.5';
    }

    if (pauseBtn) {
      pauseBtn.setAttribute('aria-label', '재개');
      pauseBtn.setAttribute('title', '재개');
      pauseBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1.3rem; color: #16a34a;">play_arrow</span>';
      pauseBtn.style.background = '#dcfce7';
      pauseBtn.style.borderColor = '#86efac';
    }
    console.log("[Session] 게임/관전 세션 일시정지 ⏸️");
  } else {
    isPaused = false;

    if (currentMode === 'study') {
      timerInterval = setInterval(tickSessionTimer, 1000);
    } else if (currentMode === 'record') {
      timerInterval = setInterval(tickSpeedrunTimer, 1000);
    } else if (currentMode === 'spectator') {
      timerInterval = setInterval(tickSpectatorSessionTimer, 1000);
      const intervalMs = (userConfig.spectatorInterval || 1) * 1000;
      if (spectatorIntervalId) clearInterval(spectatorIntervalId);
      spectatorIntervalId = setInterval(tickSpectator, intervalMs);

      const charEl = document.getElementById('spectator-char');
      if (charEl && charEl.innerText && charEl.innerText !== '-') {
        playTargetVoice(charEl.innerText);
      }
    }

    if (optionsContainer) {
      optionsContainer.style.pointerEvents = 'auto';
      optionsContainer.style.opacity = '1';
    }

    if (pauseBtn) {
      pauseBtn.setAttribute('aria-label', '일시정지');
      pauseBtn.setAttribute('title', '일시정지');
      pauseBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 1.3rem;">pause</span>';
      pauseBtn.style.background = '';
      pauseBtn.style.borderColor = '';
    }

    if (currentMode !== 'spectator' && window.audioTriggerClick) {
      window.audioTriggerClick();
    }
    console.log("[Session] 게임/관전 세션 재개 ▶️");
  }
};

function updateHistoryBarUI() {
  const container = document.getElementById('history-bar');
  if (!container) return;
  container.innerHTML = '';

  sessionHistory.slice(-5).forEach((item, idx) => {
    const div = document.createElement('div');
    div.id = `quiz-history${idx + 1}`;
    div.innerText = item.char;

    div.style.cssText = item.isCorrect
      ? "background:#4CAF50; color:white; padding:5px; text-align:center; border-radius:4px; font-size:12px; font-weight:bold; width:100%;"
      : "background:#FFCDD2; color:#C62828; padding:5px; text-align:center; border-radius:4px; font-size:12px; font-weight:bold; width:100%;";
    container.appendChild(div);
  });
}

/**
 * 실시간 가나 상태 인디케이터 배지 목록 갱신
 */
function updatePoolIndicatorUI() {
  const weightDisplay = document.getElementById('weight-display');
  if (!weightDisplay) return;
  if (isTimeUp) return;

  weightDisplay.innerHTML = '';
  weightDisplay.style.display = 'flex';
  weightDisplay.style.gap = '6px';
  weightDisplay.style.flexWrap = 'wrap';
  weightDisplay.style.alignItems = 'center';

  currentPool.forEach(item => {
    const badge = document.createElement('div');
    badge.className = 'pool-badge';
    badge.innerText = item.char;
    badge.dataset.charId = item.charId;

    const bg = getStageColor(item.stage);
    let color = '#333';
    if (item.outCnt === 1) {
      color = '#e67e22';
    } else if (item.outCnt === 2) {
      color = '#e74c3c';
    }

    badge.style.backgroundColor = bg;
    badge.style.color = color;
    badge.style.fontWeight = 'bold';
    badge.style.boxSizing = 'border-box';

    if (item.hasBeenPromotedThisSession) {
      badge.style.border = '3px solid #2b8a3e';
    } else if (item.isEligibleForPromotion) {
      badge.style.border = '1.5px solid #2b8a3e';
    } else if (!item.hasHistory) {
      badge.style.border = '1.5px dashed #868e96';
    } else {
      badge.style.border = 'none';
    }

    badge.style.width = '30px';
    badge.style.height = '30px';
    badge.style.display = 'inline-flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.borderRadius = '6px';
    badge.style.fontSize = '14px';
    badge.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    badge.style.transition = 'all 0.2s ease';

    weightDisplay.appendChild(badge);
  });
}

window.changeVoiceSource = (sourceVal) => {
  if (!sourceVal) return;
  userConfig.voiceSource = sourceVal;
  console.log(`[Voice Config 🎵] 음성 선택 변경: ${sourceVal}`);
  saveUserConfig(userConfig);
  preloadSessionVoices(currentPool);
};

/**
 * 브라우저 탭 닫기, 새로고침 등 강제 종료 이탈 프로세스 감지
 */
window.addEventListener('beforeunload', (event) => {
  if (timerInterval && !isTimeUp && currentPool.length > 0) {
    if (currentMode === 'study') {
      saveSessionPoolState(userConfig.currentDomain, currentPool);
      const playedTime = Math.max(0, userConfig.learningTime - timeLeft);
      updateDailyStudyTime(playedTime, userConfig.currentDomain);
    } else {
      const itemsToSave = currentPool.filter(item => item.isUnlocked);
      if (itemsToSave.length > 0) saveSessionPoolState(userConfig.currentDomain, itemsToSave);
      updateDailyStudyTime(srElapsedTime, userConfig.currentDomain);
    }

    event.preventDefault();
    event.returnValue = '';
  }
});

window.toggleDomain = function () {
  if (typeof ALPHABETS === 'undefined' || !ALPHABETS) {
    alert("DB가 없습니다.");
    return;
  }

  const domains = Array.isArray(ALPHABETS) ? ALPHABETS : Object.keys(ALPHABETS);
  if (domains.length === 0) {
    alert("DB가 없습니다.");
    return;
  }

  if (timerInterval && !isTimeUp) {
    if (confirm("현재 진행 중인 세션이 초기화됩니다. 도메인을 변경할까요?")) {
      clearInterval(timerInterval);
      timerInterval = null;
      isPaused = false;
    } else {
      return;
    }
  }

  const currentIndex = domains.indexOf(userConfig.currentDomain);
  const nextIndex = (currentIndex + 1) % domains.length;

  userConfig.currentDomain = domains[nextIndex];
  window.currentDomain = userConfig.currentDomain;

  updateDomainUI();
  saveUserConfig(userConfig);
  console.log(`[Domain Swap] 현재 활성 도메인: ${userConfig.currentDomain}`);

  resetToMainModeSelection();
  updateReviewCountBadge();
};

const NOTIFICATION_STATUS_TEXT = {
  granted: '켜짐',
  default: '꺼짐',
  denied: '차단됨 · 기기 설정에서 허용해 주세요',
  'ios-install-required': '홈 화면에 추가한 앱에서 켤 수 있습니다',
  unsupported: '이 브라우저는 지원하지 않습니다',
  failed: '켜지 못했습니다 · 다시 시도해 주세요'
};

/**
 * 설정 모달의 「복습 알림」 줄: 현재 상태를 보여 주고, 버튼을 누를 때만 권한을 요청한다.
 */
function bindNotificationSetting(root) {
  const statusEl = root.querySelector('#notify-status');
  const btn = root.querySelector('#btn-notify-enable');
  if (!statusEl || !btn) return;

  const render = (override) => {
    const state = getNotificationState();
    statusEl.textContent = NOTIFICATION_STATUS_TEXT[override || state] || '';
    statusEl.dataset.state = override || state;
    btn.hidden = state !== 'default' && override !== 'failed';
  };

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    // 사용자 동작 안에서 곧바로 권한을 요청해야 아이폰 홈 화면 앱에서도 권한 창이 뜬다
    const token = await requestNotificationPermission();
    btn.disabled = false;
    render(!token && getNotificationState() === 'granted' ? 'failed' : undefined);
  });

  render();
}

/**
 * view/ 디렉터리의 조각 HTML을 원격 수급하여 모달 창에 주입하는 핵심 엔진
 */
async function openRemoteModalPopup(viewName, options = {}) {
  if (timerInterval && !isTimeUp) return;

  try {
    const versionQuery = (window.CACHE_BUST || window.APP_VERSION) ? `?v=${window.CACHE_BUST || window.APP_VERSION}` : '';
    const response = await fetch(`./view/${viewName}.html${versionQuery}`);
    if (!response.ok) throw new Error("HTML 조각 수급 실패");

    let htmlContent = await response.text();

    if (viewName === 'setting') {
      const rawTimeIdx = TIME_STEPS.indexOf(userConfig.learningTime);
      const timeIdx = rawTimeIdx >= 0 ? rawTimeIdx : 4;
      const rawSpeechIdx = SPEECH_STEPS.indexOf(userConfig.speechRate);
      const speechIdx = rawSpeechIdx >= 0 ? rawSpeechIdx : 2;

      let userName = auth.currentUser ? (auth.currentUser.displayName || "이름 없음") : "게스트";
      if (userName.includes('(')) userName = userName.split('(')[0].trim();

      const maskedEmail = formatUserEmailForDisplay(auth.currentUser);
      const kbHtml = generateKeybindingsHtml(userConfig);

      htmlContent = htmlContent
        .replace('{{userName}}', () => userName)
        .replace('{{userEmail}}', () => maskedEmail)
        .replace('{{timeIdx}}', timeIdx)
        .replace('{{learningTime}}', userConfig.learningTime)
        .replace('{{MAX_POOL_SIZE}}', userConfig.MAX_POOL_SIZE)
        .replace('{{speechIdx}}', speechIdx)
        .replace('{{speechRate}}', userConfig.speechRate)
        .replace('{{#if autoProgress}}checked{{/if}}', userConfig.autoProgress ? 'checked' : '')
        .replace('{{keybindingsConfig}}', () => kbHtml);
    }

    const viewTitles = {
      help: '도움말',
      leaderboard: '리더보드',
      setting: '환경설정',
      progress: '단어장 & 학습 현황',
      login: auth.currentUser ? '로그인 계정' : '간편 로그인',
      spectatorMode: '관전 모드',
      studyMode: '학습 모드'
    };
    const modalTitle = viewTitles[viewName] || '안내';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">${modalTitle}</h3>
          <div class="modal-header-actions">
            ${viewName === 'setting' ? `
              <button class="modal-icon-btn modal-help-trigger" id="setting-help-btn" title="도움말" aria-label="도움말">
                <span class="material-symbols-outlined" style="font-size:18px;">question_mark</span>
              </button>
            ` : ''}
            <button class="modal-close" aria-label="닫기">&times;</button>
          </div>
        </div>
        <div class="modal-body">
          ${htmlContent}
        </div>
      </div>
    `;

    const closeHandler = (e) => {
      if (e.target.closest('.modal-close') || e.target === overlay) {
        overlay.remove();
        if (viewName === 'setting') {
          saveUserConfig(userConfig);
          console.log("[Settings] 설정 모달 종료 - 일괄 저장 완료");
        }
        if (viewName === 'leaderboard') {
          if (window.highlightRemaining > 0) {
            window.highlightRemaining--;
          }
          if (!window.highlightRemaining || window.highlightRemaining <= 0) {
            window.highlightRecordId = null;
          }
        }
        if (options && options.returnTo) {
          openRemoteModalPopup(options.returnTo);
        }
      }
    };
    overlay.addEventListener('click', closeHandler);

    document.body.appendChild(overlay);

    if (viewName === 'progress') {
      await new Promise((resolve) => {
        if (document.getElementById('response-time-chart')) return resolve();
        const observer = new MutationObserver((mutations, obs) => {
          if (document.getElementById('response-time-chart')) {
            obs.disconnect();
            resolve();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });

      const currentDomainData = await getAllProgress(userConfig.currentDomain);
      await renderResponseTimeChart(userConfig.currentDomain);
      renderProgressTable(userConfig.currentDomain, currentDomainData);

      const currentWeeklyStats = await getWeeklyStats(userConfig.currentDomain);
      renderStudyStatsChart(currentWeeklyStats || { total: 0, history: {} });
    }

    if (viewName === 'leaderboard') {
      await new Promise((resolve) => {
        if (document.getElementById('leaderboard-list')) return resolve();
        const observer = new MutationObserver((mutations, obs) => {
          if (document.getElementById('leaderboard-list')) {
            obs.disconnect();
            resolve();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      });
      try {
        const targetDomain = window.targetLeaderboardDomain || 'all';
        const mode = window.currentLeaderboardMode || 'speedrun';

        const rankings = mode === 'study'
          ? await getStudyRankings(10, targetDomain)
          : await getGlobalRankings(10, targetDomain);
        renderLeaderboardUI(rankings, mode);

        setTimeout(() => {
          const domainSelect = document.querySelector('select[onchange*="changeLeaderboardDomain"]');
          if (domainSelect) domainSelect.value = targetDomain;
        }, 10);
      } catch (err) {
        console.error("[Leaderboard] 랭킹 데이터 조회 및 렌더링 실패:", err);
      }
    }

    if (viewName === 'help') {
      await bindSuggestionEvents(overlay);
    }

    if (viewName === 'login') {
      renderLoginModalState(auth.currentUser);
    }

    if (viewName === 'setting') {
      const helpBtn = overlay.querySelector('#setting-help-btn');
      if (helpBtn) {
        helpBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          saveUserConfig(userConfig);
          overlay.remove();
          openRemoteModalPopup('help', { returnTo: 'setting' });
        });
      }

      const ageSelect = document.getElementById('user-age');
      if (ageSelect) ageSelect.value = userConfig.age || '미상';

      const genderSelect = document.getElementById('user-gender');
      if (genderSelect) genderSelect.value = userConfig.gender || '미상';

      const spectatorIntervalSelect = document.getElementById('spectator-interval');
      if (spectatorIntervalSelect) spectatorIntervalSelect.value = (userConfig.spectatorInterval || 1).toString();

      const voiceSourceSelect = document.getElementById('voice-source');
      if (voiceSourceSelect) {
        voiceSourceSelect.value = userConfig.voiceSource || 'google_mp3';
        voiceSourceSelect.addEventListener('change', (e) => {
          userConfig.voiceSource = e.target.value;
          saveUserConfig(userConfig);
          console.log("[Settings 🎵] 음성 성우 엔진 선택 저장 완료:", userConfig.voiceSource);
          preloadSessionVoices(currentPool);
        });
      }

      bindNotificationSetting(overlay);

      const btnErrorShow = document.getElementById('btn-error-show');
      const btnErrorAudio = document.getElementById('btn-error-audio');

      const updateErrorFeedbackUI = () => {
        if (!btnErrorShow || !btnErrorAudio) return;
        if (userConfig.errorFeedbackMode === 'none') {
          btnErrorShow.innerText = "무시";
          btnErrorShow.style.background = "#9E9E9E";
          btnErrorAudio.style.background = "#9E9E9E";
          btnErrorAudio.disabled = true;
        } else {
          btnErrorShow.innerText = "표시";
          btnErrorShow.style.background = "#4CAF50";
          btnErrorAudio.disabled = false;

          if (userConfig.errorFeedbackMode === 'both') {
            btnErrorAudio.innerText = "+ 음성";
            btnErrorAudio.style.background = "#2196F3";
          } else {
            btnErrorAudio.innerText = "정답만";
            btnErrorAudio.style.background = "#FF9800";
          }
        }
      };

      if (btnErrorShow && btnErrorAudio) {
        if (!userConfig.errorFeedbackMode) userConfig.errorFeedbackMode = 'both';
        updateErrorFeedbackUI();

        btnErrorShow.addEventListener('click', () => {
          userConfig.errorFeedbackMode = userConfig.errorFeedbackMode === 'none' ? 'both' : 'none';
          updateErrorFeedbackUI();
        });

        btnErrorAudio.addEventListener('click', () => {
          userConfig.errorFeedbackMode = userConfig.errorFeedbackMode === 'both' ? 'visual_only' : 'both';
          updateErrorFeedbackUI();
        });
      }

      document.getElementById('pool-size')?.addEventListener('input', (e) => {
        userConfig.MAX_POOL_SIZE = parseInt(e.target.value, 10) || 10;
      });

      document.getElementById('auto-progress')?.addEventListener('change', (e) => {
        userConfig.autoProgress = e.target.checked;
      });

      document.getElementById('user-age')?.addEventListener('change', (e) => {
        userConfig.age = e.target.value || '미상';
      });

      document.getElementById('user-gender')?.addEventListener('change', (e) => {
        userConfig.gender = e.target.value || '미상';
      });

      document.getElementById('spectator-interval')?.addEventListener('change', (e) => {
        userConfig.spectatorInterval = parseFloat(e.target.value) || 1;
      });

      bindKeybindingSettingsEvents(overlay, userConfig);
    }

  } catch (error) {
    console.error("모달 수급 및 초기화 파이프라인 에러 발생:", error);
  }
}

window.popupHelp = () => openRemoteModalPopup('help');
window.popupLeaderboard = (domain = 'all', mode = 'speedrun') => {
  window.targetLeaderboardDomain = domain;
  window.currentLeaderboardMode = mode;
  openRemoteModalPopup('leaderboard');
};
window.popupSetting = () => openRemoteModalPopup('setting');
window.popupProgress = () => openRemoteModalPopup('progress');
window.popupLogin = () => openRemoteModalPopup('login');

/**
 * 리더보드 도메인 필터 변경 시 호출
 */
window.changeLeaderboardDomain = async function (targetDomain) {
  window.targetLeaderboardDomain = targetDomain;
  const listContainer = document.getElementById('leaderboard-list');
  const mode = window.currentLeaderboardMode || 'speedrun';
  if (listContainer) {
    const colCount = mode === 'study' ? 7 : 6;
    listContainer.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; padding: 30px; color:#777;">데이터를 불러오는 중입니다...</td></tr>`;
  }
  try {
    const rankings = mode === 'study'
      ? await getStudyRankings(10, targetDomain)
      : await getGlobalRankings(10, targetDomain);
    renderLeaderboardUI(rankings, mode);
  } catch (err) {
    console.error("[Leaderboard] 랭킹 데이터 필터링 실패:", err);
  }
};

/**
 * 리더보드 랭킹 모드(탭) 변경 시 호출
 */
window.switchLeaderboardMode = async function (mode) {
  window.currentLeaderboardMode = mode;
  const targetDomain = window.targetLeaderboardDomain || 'all';
  const listContainer = document.getElementById('leaderboard-list');
  if (listContainer) {
    const colCount = mode === 'study' ? 7 : 6;
    listContainer.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; padding: 30px; color:#777;">데이터를 불러오는 중입니다...</td></tr>`;
  }
  try {
    const rankings = mode === 'study'
      ? await getStudyRankings(10, targetDomain)
      : await getGlobalRankings(10, targetDomain);
    renderLeaderboardUI(rankings, mode);
  } catch (err) {
    console.error("[Leaderboard] 랭킹 모드 전환 실패:", err);
  }
};

/**
 * 로그인/로그아웃 액션을 전역 스코프로 노출 (auth-handler.js 모듈로 위임)
 */
window.googleLogin = () => googleLogin(resetToMainModeSelection);
window.kakaoLogin = kakaoLogin;
window.naverLogin = naverLogin;
window.logout = () => logoutUser(resetToMainModeSelection);

/**
 * 특정 단일 문자의 진도를 Stage=1로 활성화 (게스트 및 로그인 유저 공통 지원)
 */
window.activateSingleCharProgress = async function (domain, charId) {
  try {
    const updatedDomainData = await activateSingleCharInDb(domain, charId);
    if (updatedDomainData) {
      renderProgressTable(domain, updatedDomainData);
      await renderResponseTimeChart(domain);
      updateReviewCountBadge();
      console.log(`[UI Sync] 문자 ID ${charId} 진도 활성화 완료`);
    }
  } catch (error) {
    console.error("진도 활성화 처리 중 에러:", error);
  }
};

/**
 * 특정 단일 문자의 진도 기록을 초기화 (게스트 및 로그인 유저 공통 지원)
 */
window.resetSingleCharProgress = async function (domain, charId) {
  try {
    const updatedDomainData = await resetSingleCharInDb(domain, charId);
    if (updatedDomainData) {
      renderProgressTable(domain, updatedDomainData);
      await renderResponseTimeChart(domain);
      updateReviewCountBadge();
      console.log(`[UI Sync] 문자 ID ${charId} 기록 초기화 및 음영 복구 완료`);
    }
  } catch (error) {
    console.error("진도 초기화 처리 중 에러:", error);
  }
};

/**
 * 현재 도메인의 모든 미해금 문자를 Stage 1로 일괄 해금 (게스트 및 로그인 유저 공통 지원)
 */
window.unlockAllCharacters = async function () {
  const domain = userConfig.currentDomain;
  if (!confirm(`현재 도메인(${domain})의 미해금 문자를 모두 Stage 1 단계로 일괄 해금하시겠습니까?`)) return;

  try {
    const updatedDomainData = await unlockAllCharactersInDb(domain);
    if (updatedDomainData) {
      renderProgressTable(domain, updatedDomainData);
      await renderResponseTimeChart(domain);
      updateReviewCountBadge();
      console.log(`[Batch Sync] ${domain} 도메인 일괄 해금 완료`);
    }
  } catch (error) {
    console.error("일괄 해금 처리 중 오류:", error);
  }
};

/**
 * 현재 도메인의 모든 진도 내역을 전면 초기화 (게스트 및 로그인 유저 공통 지원)
 */
window.resetAllProgressData = async function () {
  const domain = userConfig.currentDomain;
  if (!confirm(`경고: 현재 도메인(${domain})의 모든 학습 기록이 영구 삭제됩니다.\n진행하시겠습니까?`)) return;

  try {
    const updatedDomainData = await resetAllProgressInDb(domain);
    renderProgressTable(domain, updatedDomainData);
    await renderResponseTimeChart(domain);
    updateReviewCountBadge();
    console.log(`[Batch Sync] ${domain} 도메인 전면 초기화 정산 마감`);
  } catch (error) {
    console.error("전체 초기화 처리 중 오류:", error);
  }
};

/**
 * 복습 대기 상태 글자 수 실시간 배지 업데이트 함수
 */
async function updateReviewCountBadge() {
  const badge = document.getElementById('review-count-badge');
  if (!badge) return;

  try {
    const domain = userConfig.currentDomain;
    const dbData = await getAllProgress(domain) || {};
    const now = Date.now();
    const rows = ALPHABETS[domain] || [];

    let count = 0;
    let idCounter = 0;

    for (const row of rows) {
      if (typeof row !== 'string' && !Array.isArray(row)) continue;
      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char !== '_') {
          const charId = idCounter++;
          const saved = dbData[charId.toString()] || dbData[charId];
          if (saved && (saved.stage > 0 || (saved.totalSolved && saved.totalSolved > 0))) {
            const stage = saved.stage !== undefined ? saved.stage : 0;
            const lastSessionTime = saved.lastSessionTime || 0;
            const timeDiffMin = (now - lastSessionTime) / (60 * 1000);
            const requiredMin = INTERVALS[stage] !== undefined ? INTERVALS[stage] : INTERVALS[INTERVALS.length - 1];
            if (timeDiffMin >= requiredMin) {
              count++;
            }
          }
        }
      }
    }

    if (count > 0) {
      badge.innerText = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (err) {
    console.error("복습 개수 배지 업데이트 실패:", err);
    badge.style.display = 'none';
  }
}

// 전역 단축키 등록 (컴포넌트로 위임)
registerGlobalKeybindings(userConfig, {
  onEscapeModal: (activeOverlay) => {
    activeOverlay.click();
  },
  onEscapeSpectator: () => {
    if (typeof window.exitQuizTrigger === 'function') {
      window.exitQuizTrigger();
    }
  },
  onEscapeQuiz: () => {
    if (typeof window.exitQuizTrigger === 'function') {
      window.exitQuizTrigger();
    }
  },
  onToggleDomain: () => {
    if (typeof window.toggleDomain === 'function') window.toggleDomain();
  },
  onPlaySoundTest: () => {
    if (typeof window.playSoundTest === 'function') window.playSoundTest();
  },
  onPopupProgress: () => {
    if (typeof window.popupProgress === 'function') window.popupProgress();
  },
  onPopupSetting: () => {
    if (typeof window.popupSetting === 'function') window.popupSetting();
  },
  onPopupLeaderboard: () => {
    if (typeof window.popupLeaderboard === 'function') window.popupLeaderboard();
  },
  onPopupHelp: () => {
    if (typeof window.popupHelp === 'function') window.popupHelp();
  },
  onPopupLogin: () => {
    if (typeof window.popupLogin === 'function') window.popupLogin();
  },
  onStartStudy: () => {
    if (typeof startSessionWorkflow === 'function') startSessionWorkflow('study');
  },
  onStartRecord: () => {
    if (typeof startSessionWorkflow === 'function') startSessionWorkflow('record');
  },
  onStartSpectator: () => {
    if (typeof startSessionWorkflow === 'function') startSessionWorkflow('spectator');
  },
  onReplayVoice: () => {
    if (isPaused) return;
    if (window.audioTriggerClick) window.audioTriggerClick();
  },
  onOptionSelect: (optionIndex) => {
    if (isPaused) return;
    const optionsContainer = document.getElementById('options');
    if (optionsContainer && optionsContainer.style.pointerEvents !== 'none') {
      const buttons = optionsContainer.querySelectorAll('.option-btn');
      if (buttons && buttons.length > optionIndex) {
        buttons[optionIndex].click();
      }
    }
  }
});
