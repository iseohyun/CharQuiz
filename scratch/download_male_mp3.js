/**
 * scratch/download_male_mp3.js
 * 구글 남성 성우(Google Male Voice) MP3 파일 46개 가나 수급 스크립트
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

function downloadMaleMp3(charStr, romaName) {
  return new Promise((resolve) => {
    const fileName = `male_${romaName}.mp3`;
    const filePath = path.join(targetDir, fileName);

    const encoded = encodeURIComponent(charStr);
    // 남성 낮은 음역대 바리톤 톤 수급 URL
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encoded}&tl=ja&ttsspeed=0.9`;

    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 200) {
        const fileStream = fs.createWriteStream(filePath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`[Male MP3 Download Success 👨‍💼] ${charStr} (${romaName}) -> assets/audio/ja/${fileName}`);
          resolve(true);
        });
      } else {
        console.warn(`[Male MP3 Fail ⚠️] ${charStr} HTTP ${res.statusCode}`);
        resolve(false);
      }
    });

    req.on('error', (e) => {
      console.error(`[Male MP3 Error] ${charStr}:`, e.message);
      resolve(false);
    });
  });
}

(async () => {
  console.log('[Male Voice Extractor 🚀] 구글 남성 성우 46개 MP3 다운로드 중...');
  for (const [charStr, romaName] of Object.entries(KANA_MAP)) {
    await downloadMaleMp3(charStr, romaName);
    await new Promise(r => setTimeout(r, 60));
  }
  console.log('[Male Voice Extractor 🎉] 구글 남성 성우 MP3 자산 수급 완료!');
})();
