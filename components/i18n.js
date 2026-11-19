/**
 * @file components/i18n.js
 * @description 화면 언어(한국어·English·日本語). 처음 화면과 설정 화면의 글자를 바꾼다.
 *
 * HTML 에는 data-i18n="키"(글자), data-i18n-title="키"(title·aria-label)를 단다.
 * 사전에 없는 키는 한국어로, 한국어에도 없으면 키를 그대로 보여 준다.
 * 리더보드·단어장·도움말·문제 화면의 문구는 아직 한국어만 있다.
 */

export const UI_LANGUAGES = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' }
];

const DICT = {
  ko: {
    'header.guest': '게스트',
    'header.suffix': '님',
    'menu.leaderboard': '리더보드',
    'menu.progress': '단어장',
    'menu.soundTest': '소리 테스트',
    'menu.toggleDomain': '일본어 → 한국어 → 영어 전환',
    'menu.setting': '설정',
    'mode.study': '학습 모드',
    'mode.studyDesc': '반복 오디오 퀴즈로 가나 익히기',
    'mode.record': '기록 모드',
    'mode.recordDesc': '타임어택으로 암기 속도 측정',
    'mode.spectator': '관전 모드',
    'mode.spectatorDesc': '자동 재생으로 편안하게 복습',
    'mode.info': '단축키(Q, W, E, 1~5)와 퀴즈 루프로 빠르게 가나를 마스터하세요.',
    'setting.close': '닫기',
    'setting.soundTest': '소리 테스트',
    'setting.inbox': '알림함',
    'setting.about': '앱 정보·도움말',
    'setting.share': '공유하기',
    'setting.groupUser': '사용자',
    'setting.groupPersonal': '개인화 설정',
    'setting.groupSystem': '시스템',
    'setting.groupKeys': '단축키',
    'setting.account': '계정',
    'setting.age': '연령대',
    'setting.gender': '성별',
    'setting.unknown': '선택 안 함',
    'setting.male': '남',
    'setting.female': '여',
    'setting.ageSuffix': '대',
    'setting.learningTime': '1회당 학습 시간',
    'setting.seconds': '초',
    'setting.poolSize': '1회당 문제 수',
    'setting.autoProgress': '자동 진도',
    'setting.language': '언어',
    'setting.speechRate': '음성 속도',
    'setting.voice': '음성 모델',
    'setting.reminder': '복습 알림',
    'setting.errorFeedback': '오답 표시 방법',
    'setting.errorShow': '표시',
    'setting.errorIgnore': '무시',
    'setting.errorWithVoice': '+ 음성',
    'setting.errorAnswerOnly': '정답만',
    'setting.spectatorInterval': '관전 모드 주기',
    'setting.newVersion': '새 버전',
    'share.text': '히라가나·카타카나를 소리로 익히는 퀴즈 앱',
    'share.copied': '주소를 복사했어요. 카톡이나 문자에 붙여 넣어 보내세요.',
    'share.failed': '공유하지 못했어요.',
    'mode.record20': '20문제 타임어택',
    'mode.record30': '30초 타임어택',
    'setting.play': '듣기',
    'summary.lang.ja': '일본어',
    'summary.lang.ko': '한국어',
    'summary.lang.en': '영어',
    'summary.hira': '히라가나',
    'summary.kata': '가타카나',
    'summary.hangle': '한글',
    'summary.ENGLISH': '대문자',
    'summary.english': '소문자',
    'summary.unlocked': '해금'
  },
  en: {
    'header.guest': 'Guest',
    'header.suffix': '',
    'menu.leaderboard': 'Leaderboard',
    'menu.progress': 'Word list',
    'menu.soundTest': 'Sound test',
    'menu.toggleDomain': 'Japanese → Korean → English',
    'menu.setting': 'Settings',
    'mode.study': 'Study',
    'mode.studyDesc': 'Learn kana with audio quizzes',
    'mode.record': 'Time attack',
    'mode.recordDesc': 'Measure how fast you recall',
    'mode.spectator': 'Watch',
    'mode.spectatorDesc': 'Review hands-free with autoplay',
    'mode.info': 'Master kana fast with shortcuts (Q, W, E, 1–5) and the quiz loop.',
    'setting.close': 'Close',
    'setting.soundTest': 'Sound test',
    'setting.inbox': 'Notifications',
    'setting.about': 'About & help',
    'setting.share': 'Share',
    'setting.groupUser': 'User',
    'setting.groupPersonal': 'Personal',
    'setting.groupSystem': 'System',
    'setting.groupKeys': 'Shortcuts',
    'setting.account': 'Account',
    'setting.age': 'Age',
    'setting.gender': 'Gender',
    'setting.unknown': 'Not set',
    'setting.male': 'Male',
    'setting.female': 'Female',
    'setting.ageSuffix': 's',
    'setting.learningTime': 'Time per session',
    'setting.seconds': 's',
    'setting.poolSize': 'Questions per session',
    'setting.autoProgress': 'Auto progress',
    'setting.language': 'Language',
    'setting.speechRate': 'Speech speed',
    'setting.voice': 'Voice',
    'setting.reminder': 'Review reminder',
    'setting.errorFeedback': 'Wrong answer feedback',
    'setting.errorShow': 'Show',
    'setting.errorIgnore': 'Ignore',
    'setting.errorWithVoice': '+ Voice',
    'setting.errorAnswerOnly': 'Answer only',
    'setting.spectatorInterval': 'Watch mode interval',
    'setting.newVersion': 'New version',
    'share.text': 'A quiz app for learning hiragana and katakana by sound',
    'share.copied': 'Link copied. Paste it into a chat or message.',
    'share.failed': 'Could not share.',
    'mode.record20': '20-question time attack',
    'mode.record30': '30-second time attack',
    'setting.play': 'Play',
    'summary.lang.ja': 'Japanese',
    'summary.lang.ko': 'Korean',
    'summary.lang.en': 'English',
    'summary.hira': 'Hiragana',
    'summary.kata': 'Katakana',
    'summary.hangle': 'Hangul',
    'summary.ENGLISH': 'Uppercase',
    'summary.english': 'Lowercase',
    'summary.unlocked': 'unlocked'
  },
  ja: {
    'header.guest': 'ゲスト',
    'header.suffix': 'さん',
    'menu.leaderboard': 'ランキング',
    'menu.progress': '単語帳',
    'menu.soundTest': '音声テスト',
    'menu.toggleDomain': '日本語 → 韓国語 → 英語 切替',
    'menu.setting': '設定',
    'mode.study': '学習モード',
    'mode.studyDesc': '音声クイズでかなを覚える',
    'mode.record': '記録モード',
    'mode.recordDesc': 'タイムアタックで暗記速度を測る',
    'mode.spectator': '観戦モード',
    'mode.spectatorDesc': '自動再生で気軽に復習',
    'mode.info': 'ショートカット(Q, W, E, 1~5)とクイズループで素早くかなをマスター。',
    'setting.close': '閉じる',
    'setting.soundTest': '音声テスト',
    'setting.inbox': 'お知らせ',
    'setting.about': 'アプリ情報・ヘルプ',
    'setting.share': '共有',
    'setting.groupUser': 'ユーザー',
    'setting.groupPersonal': '個人設定',
    'setting.groupSystem': 'システム',
    'setting.groupKeys': 'ショートカット',
    'setting.account': 'アカウント',
    'setting.age': '年代',
    'setting.gender': '性別',
    'setting.unknown': '未選択',
    'setting.male': '男性',
    'setting.female': '女性',
    'setting.ageSuffix': '代',
    'setting.learningTime': '1回の学習時間',
    'setting.seconds': '秒',
    'setting.poolSize': '1回の問題数',
    'setting.autoProgress': '自動進度',
    'setting.language': '言語',
    'setting.speechRate': '音声速度',
    'setting.voice': '音声モデル',
    'setting.reminder': '復習通知',
    'setting.errorFeedback': '不正解の表示',
    'setting.errorShow': '表示',
    'setting.errorIgnore': '無視',
    'setting.errorWithVoice': '+ 音声',
    'setting.errorAnswerOnly': '正解のみ',
    'setting.spectatorInterval': '観戦モードの間隔',
    'setting.newVersion': '新バージョン',
    'share.text': 'ひらがな・カタカナを音で覚えるクイズアプリ',
    'share.copied': 'リンクをコピーしました。チャットやメッセージに貼り付けてください。',
    'share.failed': '共有できませんでした。',
    'mode.record20': '20問タイムアタック',
    'mode.record30': '30秒タイムアタック',
    'setting.play': '再生',
    'summary.lang.ja': '日本語',
    'summary.lang.ko': '韓国語',
    'summary.lang.en': '英語',
    'summary.hira': 'ひらがな',
    'summary.kata': 'カタカナ',
    'summary.hangle': 'ハングル',
    'summary.ENGLISH': '大文字',
    'summary.english': '小文字',
    'summary.unlocked': '解放'
  }
};

let currentLanguage = 'ko';

export function getLanguage() {
  return currentLanguage;
}

/** @param {string} code ko | en | ja (그 밖의 값은 ko) */
export function setLanguage(code) {
  currentLanguage = DICT[code] ? code : 'ko';
  document.documentElement.lang = currentLanguage;
  applyI18n(document);
}

export function t(key) {
  return DICT[currentLanguage]?.[key] ?? DICT.ko[key] ?? key;
}

/** root 안의 data-i18n, data-i18n-title 을 지금 언어로 바꾼다. */
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const text = t(el.dataset.i18nTitle);
    if (el.hasAttribute('data-tooltip')) el.setAttribute('data-tooltip', text);
    else el.title = text;
    el.setAttribute('aria-label', text);
  });
}
