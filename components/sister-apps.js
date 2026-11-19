/**
 * @file components/sister-apps.js
 * @description QuizQuiz 자매품(퀴즈 앱) 목록. 알림함 맨 위에 이 앱을 뺀 나머지를 홍보 링크로 보여 준다.
 * 새 퀴즈 앱을 내면 두 앱(CharQuiz, NameQuiz)의 이 파일에 같은 줄을 더한다.
 */

const SITE = 'https://iseohyun.github.io';
const CURRENT_APP = 'CharQuiz';

export const SISTER_APPS = [
  { id: 'CharQuiz', name: '글자 퀴즈', desc: '히라가나·가타카나·한글·영문을 소리로', url: `${SITE}/CharQuiz/` },
  { id: 'NameQuiz', name: '캐릭터 퀴즈', desc: '산리오·티니핑 캐릭터 이름 맞히기', url: `${SITE}/NameQuiz/` }
];

/** 알림함 맨 위 자매품 링크 HTML. 이 앱은 뺀다. */
export function renderSisterAppsHtml() {
  const others = SISTER_APPS.filter((app) => app.id !== CURRENT_APP);
  if (!others.length) return '';
  return `
    <div class="sister-apps">
      <span class="sister-apps-title">QuizQuiz 자매품</span>
      <div class="sister-apps-list">
        ${others.map((app) => `
          <a class="sister-app" href="${app.url}" target="_blank" rel="noopener">
            <img src="${app.url}icon-192.png" alt="" width="36" height="36" loading="lazy">
            <span class="sister-app-text"><strong>${app.name}</strong><small>${app.desc}</small></span>
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          </a>`).join('')}
      </div>
    </div>`;
}
