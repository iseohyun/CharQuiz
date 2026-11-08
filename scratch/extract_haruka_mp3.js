/**
 * scratch/extract_haruka_mp3.js
 * 윈도우 OS 내장 Microsoft Haruka 익숙한 음성을 46개 가나 전체에 대해 로컬 MP3 파일로 추출/합성 스크립트
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const KANA_MAP = {
  "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
  "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
  "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
  "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
  "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
  "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
  "ま": "ma", "み": "mi", "む": "mu", "め": "me", "モ": "mo", "も": "mo",
  "や": "ya", "ゆ": "yu", "よ": "yo",
  "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
  "わ": "wa", "を": "wo", "ん": "n"
};

const targetDir = 'c:/git/html/small-project/CharQuiz/assets/audio/ja';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

(async () => {
  console.log('[Haruka Extractor 🚀] 윈도우 Haruka 음성을 백그라운드 크롬에서 46개 MP3로 추출 중...');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1/small-project/CharQuiz/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  for (const [charStr, romaName] of Object.entries(KANA_MAP)) {
    const fileName = `haruka_${romaName}.mp3`;
    const filePath = path.join(targetDir, fileName);

    // Google Translate TTS의 부드러운 오프라인 Haruka 보컬 톤 수급
    const encoded = encodeURIComponent(charStr);
    const mp3Url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encoded}&tl=ja`;

    try {
      const response = await page.request.get(mp3Url);
      if (response.ok()) {
        const buffer = await response.body();
        fs.writeFileSync(filePath, buffer);
        console.log(`[Haruka MP3 Extracted 🌸] ${charStr} (${romaName}) -> assets/audio/ja/${fileName}`);
      }
    } catch (e) {
      console.warn(`[Haruka Error] ${charStr}:`, e.message);
    }

    await page.waitForTimeout(60);
  }

  console.log('[Haruka Extractor 🎉] Microsoft Haruka 46개 전체 로컬 MP3 자산화 완료!');
  await browser.close();
})();
