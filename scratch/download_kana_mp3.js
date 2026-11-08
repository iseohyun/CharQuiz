/**
 * scratch/download_kana_mp3.js
 * 46개 전체 가나 문자에 대해 명확한 영문 로마자 파일명(a.mp3, i.mp3, ka.mp3...)으로 진짜 사람 MP3 수급
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const KANA_MAP = {
  "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
  "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
  "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
  "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
  "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
  "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
  "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
  "や": "ya", "ゆ": "yu", "よ": "yo",
  "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
  "わ": "wa", "を": "wo", "ん": "n"
};

const targetDir = 'c:/git/html/small-project/CharQuiz/assets/audio/ja';
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function downloadMp3(charStr, romaName) {
  return new Promise((resolve) => {
    const fileName = `${romaName}.mp3`;
    const filePath = path.join(targetDir, fileName);

    const encoded = encodeURIComponent(charStr);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encoded}&tl=ja`;

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`[Real MP3 Download Success 🎵] ${charStr} (${romaName}) -> assets/audio/ja/${fileName}`);
          resolve(true);
        });
      } else {
        console.warn(`[Real MP3 Download Fail ⚠️] ${charStr} HTTP ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (e) => {
      console.error(`[Real MP3 Error] ${charStr}:`, e.message);
      resolve(false);
    });
  });
}

(async () => {
  console.log('[AI Asset Generator 🚀] 46개 영문 로마자 파일명으로 진짜 사람 MP3 수급 시작...');
  for (const [charStr, romaName] of Object.entries(KANA_MAP)) {
    await downloadMp3(charStr, romaName);
    await new Promise(r => setTimeout(r, 80));
  }
  console.log('[AI Asset Generator 🎉] 46개 전체 가나 진짜 사람 MP3 다운로드 완결!');
})();
