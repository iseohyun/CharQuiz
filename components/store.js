/**
 * @file components/store.js
 * @description 사용자 환경설정(userConfig) 전역 상태 및 슬라이더 스텝 상수 관리 모듈
 */

export const userConfig = {
  learningTime: 60,
  MAX_POOL_SIZE: 10,
  autoProgress: true,
  targetAccuracy: 85, // 목표 정답률(%): 최근 학습 정답률이 이보다 높으면 새 문제를 더 넣는다 (components/adaptive-progress.js)
  reviewReminder: true, // 복습 알림 예약 여부 (설정 화면에서 끄고 켠다)
  speechRate: 0.85,
  currentDomain: 'hira',
  activeDomains: ['hira'], // 요약 카드에서 함께 고른 범위(같은 언어 묶음 안). 첫 번째가 currentDomain
  errorFeedbackMode: 'both',
  weatherTheme: true, // 처음 화면 무대에 대략의 날씨(IP 위치)를 반영할지 (components/season-weather.js)
  accentColor: 'pink', // 테마색(강조색): 'pink' | 'blue' | 'green' | 'purple' | 'orange' (common.css 의 html[data-accent])
  uiLanguage: 'ko', // 화면 언어: 'ko' | 'en' | 'ja' (components/i18n.js)
  spectatorInterval: 1, // 관전모드 출력 주기 (초)
  voiceSource: 'google_mp3', // 음성 엔진 옵션: 'google_mp3', 'google_male_mp3', 'haruka_mp3', 'browser_tts'
  keybindings: {
    toggleDomain: { label: "도메인 변경", primary: "1", secondary: "d" },
    playSoundTest: { label: "음성 테스트", primary: "2", secondary: "t" },
    popupProgress: { label: "진도표 팝업", primary: "3", secondary: "p" },
    popupSetting: { label: "설정 팝업", primary: "4", secondary: "s" },
    popupLeaderboard: { label: "랭킹 팝업", primary: "5", secondary: "r" },
    popupHelp: { label: "도움말 팝업", primary: "9", secondary: "h" },
    popupLogin: { label: "로그인 팝업", primary: "Escape", secondary: "l" },
    startStudy: { label: "학습 모드 시작", primary: "q", secondary: "7" },
    startRecord: { label: "기록 모드 시작", primary: "w", secondary: "8" },
    startSpectator: { label: "관전 모드 시작", primary: "e", secondary: "6" },
    replayVoice: { label: "음성 다시듣기", primary: "Space", secondary: "0" },
    option0: { label: "1번 답안 (좌상)", primary: "4", secondary: "a" },
    option1: { label: "2번 답안 (우상)", primary: "5", secondary: "s" },
    option2: { label: "3번 답안 (좌하)", primary: "1", secondary: "z" },
    option3: { label: "4번 답안 (우하)", primary: "2", secondary: "x" }
  }
};

export const TIME_STEPS = [20, 30, 40, 50, 60, 90];
export const SPEECH_STEPS = [0.5, 0.7, 0.85, 1.0, 1.5, 2.0];

// 앱 기본 설정 스냅샷 (계정 전환 시 이전 사용자 설정이 남지 않도록 되돌릴 때 사용)
const DEFAULT_USER_CONFIG = JSON.parse(JSON.stringify(userConfig));

/**
 * userConfig 를 기본값으로 되돌린다.
 * 다른 모듈이 userConfig 객체 참조를 들고 있으므로(예: 전역 단축키) 새 객체로 바꾸지 않고 내용만 교체한다.
 */
export function resetUserConfig() {
  Object.keys(userConfig).forEach((key) => {
    if (!(key in DEFAULT_USER_CONFIG)) delete userConfig[key];
  });
  Object.assign(userConfig, JSON.parse(JSON.stringify(DEFAULT_USER_CONFIG)));
}

window.updateTimeFromSlider = updateTimeFromSlider;
window.updateSpeechFromSlider = updateSpeechFromSlider;

export function updateTimeFromSlider(val) {
  const targetTime = TIME_STEPS[val] || 60;
  userConfig.learningTime = targetTime;

  const display = document.getElementById('time-val-display');
  if (display) display.innerText = targetTime;
}

export function updateSpeechFromSlider(val) {
  const targetSpeed = SPEECH_STEPS[val] || 0.85;
  userConfig.speechRate = targetSpeed;

  const display = document.getElementById('speech-val-display');
  if (display) display.innerText = targetSpeed;
}
