/**
 * @file components/store.js
 * @description 사용자 환경설정(userConfig) 전역 상태 및 슬라이더 스텝 상수 관리 모듈
 */

export const userConfig = {
  learningTime: 60,
  MAX_POOL_SIZE: 10,
  autoProgress: true,
  speechRate: 0.85,
  currentDomain: 'hira',
  errorFeedbackMode: 'both',
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
