/**
 * @file components/combo-fx.js
 * @description 학습 모드 연속 정답 「Combo」 효과. 정답을 2번 이상 이어서 맞히면 화면 가운데에 「N COMBO!」가 튀어 오르고 사라진다.
 * 5·10·20·30… 연속이면 더 크게 띄운다. 틀리면 이어진 수가 끊긴다(세션 기록의 끝에서부터 센다).
 * QuizApp Common GUI 「Combo」 규칙과 같은 모양이며 CharQuiz·NameQuiz 에 같은 파일이 있다.
 */

const MIN_COMBO = 2;
const BIG_COMBOS = new Set([5, 10]);

/**
 * 세션 기록 끝에서부터 이어진 정답 수.
 * @param {Array<{isCorrect: boolean}>} history
 */
export function getTrailingStreak(history) {
  let streak = 0;
  for (let i = history.length - 1; i >= 0 && history[i].isCorrect; i--) streak++;
  return streak;
}

/** 이어진 정답 수가 2 이상이면 Combo 를 띄운다 */
export function showCombo(count) {
  if (count < MIN_COMBO) return;
  document.querySelector('.combo-fx')?.remove();
  const big = BIG_COMBOS.has(count) || (count >= 20 && count % 10 === 0);
  const el = document.createElement('div');
  el.className = `combo-fx${big ? ' combo-big' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="combo-count">${count}</span><span class="combo-word">COMBO!</span>${big ? '<span class="combo-spark">✨</span>' : ''}`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 1500);
}
