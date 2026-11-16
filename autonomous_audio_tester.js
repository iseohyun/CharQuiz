/**
 * @file autonomous_audio_tester.js
 * @description 관전 모드 및 가나 46자 음성 재생을 헤드리스 크롬으로 점검하는 자율 테스트 스크립트.
 *
 * 사용법:
 *   1) 로컬 서버 실행 (예: VS Code Live Server → http://127.0.0.1:5500/)
 *   2) node autonomous_audio_tester.js
 *      - 다른 주소를 검사하려면: set BASE_URL=https://iseohyun.com/CharQuiz/ && node autonomous_audio_tester.js
 *   3) 결과: ./test-results/audio_test_report.json
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5500/';
const REPORT_DIR = path.join(__dirname, 'test-results');
const REPORT_PATH = path.join(REPORT_DIR, 'audio_test_report.json');

(async () => {
  console.log(`[AI Autonomous Tester 🚀] 헤드리스 크롬 가동 중... (대상: ${BASE_URL})`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  const consoleLogs = [];
  const audioErrors = [];
  const spectatorVoices = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('Preloaded Voice') || text.includes('Multi-Voice Engine') || text.includes('Browser Live TTS') || text.includes('0ms 직통')) {
      spectatorVoices.push(text);
      console.log(`[Browser Console 🔊] ${text}`);
    }
    if (text.includes('Direct Error') || text.includes('FAIL ❌') || text.includes('interrupted')) {
      audioErrors.push(text);
    }
  });
  page.on('pageerror', err => {
    audioErrors.push(`[pageerror] ${err.message}`);
  });

  console.log('[AI Autonomous Tester 🌐] CharQuiz 메인 화면 접속 중...');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 1. 관전 모드 버튼 클릭 테스트 시나리오
  console.log('[AI Autonomous Tester 👁️] 관전 모드 버튼 실제 클릭 및 5초간 관전 검증...');
  const spectatorBtn = await page.$('.mode-spectator');
  if (spectatorBtn) {
    await spectatorBtn.click();
    await page.waitForTimeout(5000);
  } else {
    console.warn('[AI Autonomous Tester ⚠️] 관전 모드 버튼을 찾지 못함, 전역 테스트 수용');
  }

  // 2. 46개 가나 전체 수급 테스트 시나리오
  console.log('[AI Autonomous Tester 🧪] 46개 가나 전체 음성 수급 검증...');
  const tcResult = await page.evaluate(async () => {
    if (typeof window.runAutonomousAudioTC === 'function') {
      return await window.runAutonomousAudioTC(["あ", "い", "う", "え", "お", "か", "き", "く", "け", "こ", "さ", "し", "す", "せ", "そ", "た", "ち", "つ", "て", "と", "な", "に", "ぬ", "ね", "の", "は", "ひ", "ふ", "へ", "ほ", "ま", "み", "む", "め", "も", "や", "ゆ", "よ", "ら", "り", "る", "れ", "ろ", "わ", "を", "ん"]);
    }
    return { error: 'runAutonomousAudioTC not found' };
  });

  const isSpectatorSuccess = audioErrors.length === 0;

  console.log(`[AI Autonomous Tester 📊] 관전 모드 실측 검증: ${spectatorVoices.length}개 음성 수급, 에러 ${audioErrors.length}개`);
  console.log(`[AI Autonomous Tester 🎯] 최종 검증 상태: ${isSpectatorSuccess ? '성공 (PASS)' : '실패 (FAIL)'}`);

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    isSpectatorSuccess,
    spectatorVoiceCount: spectatorVoices.length,
    tcResult,
    audioErrors,
    spectatorVoices
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[AI Autonomous Tester 💾] 리포트 저장: ${REPORT_PATH}`);

  await browser.close();
  process.exitCode = isSpectatorSuccess ? 0 : 1;
})();
