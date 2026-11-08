/**
 * @file components/audio-manager.js
 * @description 4가지 성우 엔진(구글 여성 MP3, 구글 남성 MP3, Windows Haruka MP3, 브라우저 실시간 TTS)을
 * 사전 로드 및 재생하며, 정적 MP3가 없는 문자(탁음/반탁음, 한글, 영문 등)는 도메인별 브라우저 TTS로 자동 폴백하는 오디오 매니저 모듈.
 */

import { userConfig } from './store.js';

let audioCtx = null;
const mp3AudioBufferMap = {}; // 오디오 버퍼 저장소
let activeSources = [];
let cachedHarukaVoice = null;

// 히라가나 및 가타카나 청음 46자 -> 로마자 MP3 파일명 매핑
const KANA_ROMA_MAP = {
  // 히라가나 청음 46자
  "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
  "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
  "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
  "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
  "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
  "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
  "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
  "や": "ya", "ゆ": "yu", "よ": "yo",
  "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
  "わ": "wa", "を": "wo", "ん": "n",
  // 가타카나 청음 46자 (동일 음원 공유)
  "ア": "a", "イ": "i", "ウ": "u", "エ": "e", "オ": "o",
  "カ": "ka", "キ": "ki", "ク": "ku", "ケ": "ke", "コ": "ko",
  "サ": "sa", "シ": "shi", "ス": "su", "セ": "se", "ソ": "so",
  "タ": "ta", "チ": "chi", "ツ": "tsu", "テ": "te", "ト": "to",
  "ナ": "na", "ニ": "ni", "ヌ": "nu", "ネ": "ne", "ノ": "no",
  "ハ": "ha", "ヒ": "hi", "フ": "fu", "ヘ": "he", "ホ": "ho",
  "マ": "ma", "ミ": "mi", "ム": "mu", "メ": "me", "モ": "mo",
  "ヤ": "ya", "ユ": "yu", "ヨ": "yo",
  "ラ": "ra", "リ": "ri", "ル": "ru", "レ": "re", "ロ": "ro",
  "ワ": "wa", "ヲ": "wo", "ン": "n"
};

function _getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    try {
      audioCtx.resume();
    } catch (e) {
      // 브라우저 자동재생 정책에 의해 사용자 제스처 전까지 대기
    }
  }
  return audioCtx;
}

function _findHarukaVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  cachedHarukaVoice =
    voices.find(v => (v.name || '').includes('Haruka') || (v.name || '').includes('haruka')) ||
    voices.find(v => v.lang === 'ja-JP' && v.localService === true) ||
    voices.find(v => v.lang.startsWith('ja')) ||
    null;
  return cachedHarukaVoice;
}

/**
 * 도메인별 브라우저 내장 Web Speech API (TTS) 음성 출력 헬퍼
 */
function _speakWithBrowserTTS(charStr, renderToCallDelay = 0) {
  if (!('speechSynthesis' in window)) {
    return { pass: false, decibel: 0, char: charStr };
  }
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const domain = userConfig.currentDomain || 'hira';
    const utterance = new SpeechSynthesisUtterance(charStr);

    if (domain === 'hangle') {
      utterance.lang = 'ko-KR';
    } else if (domain.toLowerCase() === 'english' || domain.toLowerCase() === 'alphabet') {
      utterance.lang = 'en-US';
    } else {
      utterance.lang = 'ja-JP';
      if (!cachedHarukaVoice) {
        _findHarukaVoice();
      }
      if (cachedHarukaVoice) {
        utterance.voice = cachedHarukaVoice;
      }
    }

    utterance.rate = userConfig.speechRate || 0.9;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      console.log(`%c[Browser Live TTS 🎙️] 실시간 TTS 출력! (글자: '${charStr}', 언어: ${utterance.lang}, 딜레이: +${renderToCallDelay}ms)`, 'color: #3b82f6; font-weight: bold;');
    };

    window.speechSynthesis.speak(utterance);
    return { pass: true, decibel: 95, char: charStr };
  } catch (e) {
    console.error("[Browser Live TTS Error]:", e);
    return { pass: false, decibel: 0, char: charStr };
  }
}

export function initAudioEngine() {
  return new Promise((resolve) => {
    _getAudioContext();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        _findHarukaVoice();
      };
      _findHarukaVoice();
    }
    resolve(true);
  });
}

/**
 * 선택된 음성 엔진 오디오 파일 사전 메모리 수급
 * (정적 MP3가 존재하는 청음 46자에 대해서만 fetch 수행, 나머지는 브라우저 TTS 폴백)
 */
export async function preloadSessionVoices(pool = []) {
  const sourceMode = userConfig.voiceSource || 'google_mp3';
  if (sourceMode === 'browser_tts') {
    _findHarukaVoice();
    return;
  }

  const ctx = _getAudioContext();
  if (!ctx) return;

  const targetChars = Array.isArray(pool) && pool.length > 0
    ? pool.map(item => item.char || item)
    : ["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ"];

  let prefix = '';
  if (sourceMode === 'haruka_mp3') prefix = 'haruka_';
  else if (sourceMode === 'google_male_mp3') prefix = 'male_';

  const loadPromises = targetChars.map(async (charStr) => {
    const romaName = KANA_ROMA_MAP[charStr];
    const cacheKey = `${sourceMode}_${charStr}`;
    // 정적 MP3 매핑이 없는 문자(탁음/반탁음, 한글, 영문 등)는 불필요한 네트워크 요청 없이 스킵
    if (!charStr || !romaName || mp3AudioBufferMap[cacheKey]) return;

    try {
      const mp3Url = `./assets/audio/ja/${prefix}${romaName}.mp3`;
      const response = await fetch(mp3Url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      mp3AudioBufferMap[cacheKey] = decodedBuffer;
    } catch (e) {
      console.warn(`[Multi-Voice Preload Warning] ${charStr} (${sourceMode}) 읽기 실패:`, e);
    }
  });

  await Promise.all(loadPromises);
  console.log(`[Multi-Voice Engine 🎵] [현재 선택: ${sourceMode}] 세션 오디오 사전 로딩 완결!`);
}

/**
 * 선택된 성우 엔진별 출력 렌더러 (MP3 미보유 문자는 도메인별 브라우저 TTS로 자동 폴백)
 */
export function playTargetVoice(charStr, isRetry = false) {
  if (!charStr) return { pass: false, decibel: 0 };

  const sourceMode = userConfig.voiceSource || 'google_mp3';
  const callTime = Date.now();
  const renderToCallDelay = window.lastQuestionTime ? (callTime - window.lastQuestionTime) : 0;

  stopAllVoices();

  // 1. 브라우저 실시간 TTS 모드이거나, 정적 MP3 매핑이 없는 문자(탁음, 한글, 영문 등)인 경우 즉시 TTS 폴백
  if (sourceMode === 'browser_tts' || !KANA_ROMA_MAP[charStr]) {
    return _speakWithBrowserTTS(charStr, renderToCallDelay);
  }

  // 2. MP3 성우 오디오 버퍼 0ms 직통 렌더링 (구글 여성 / 구글 남성 / Haruka MP3)
  const ctx = _getAudioContext();
  const cacheKey = `${sourceMode}_${charStr}`;
  const buffer = mp3AudioBufferMap[cacheKey];

  try {
    if (buffer && ctx) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain();

      source.buffer = buffer;

      let voiceLabel = '🎵 구글 여성 성우 (Female MP3)';
      if (sourceMode === 'haruka_mp3') {
        source.playbackRate.value = 1.08;
        gainNode.gain.setValueAtTime(1.15, now);
        voiceLabel = '🌸 Windows Haruka (Haruka MP3)';
      } else if (sourceMode === 'google_male_mp3') {
        source.playbackRate.value = 0.88;
        gainNode.gain.setValueAtTime(1.2, now);
        voiceLabel = '👨‍💼 구글 남성 성우 (Male MP3)';
      } else {
        source.playbackRate.value = 1.0;
        gainNode.gain.setValueAtTime(1.0, now);
      }

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      source.onended = () => {
        activeSources = activeSources.filter(s => s !== source);
      };

      source.start(now);
      activeSources.push(source);

      console.log(`%c[Preloaded Voice 🔊🔊🔊] [${voiceLabel}] 0ms 직통 출력 완료! (글자: '${charStr}', 딜레이: +${renderToCallDelay}ms)`, 'color: #10b981; font-weight: bold;');
      return { pass: true, decibel: 100, char: charStr };
    } else if (!isRetry) {
      preloadSessionVoices([charStr]).then(() => {
        playTargetVoice(charStr, true);
      });
      return { pass: true, decibel: 80, char: charStr };
    } else {
      return _speakWithBrowserTTS(charStr, renderToCallDelay);
    }
  } catch (e) {
    console.error("[Audio Direct Error]:", e);
    return _speakWithBrowserTTS(charStr, renderToCallDelay);
  }
}

export function playSoundTest() {
  return playTargetVoice("あ");
}

export function stopAllVoices() {
  activeSources.forEach(source => {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // 이미 종료된 오디오 노드 예외 무시
    }
  });
  activeSources = [];

  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // 취소 예외 무시
    }
  }
}
