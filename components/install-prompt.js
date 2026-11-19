/**
 * @file components/install-prompt.js
 * @description 「앱 설치」 단추. 설치한 앱으로 연 것이 아니면 늘 보인다(설치 전에는 빨간 점).
 * 누르면 Chrome 이 준 설치 신호(beforeinstallprompt)가 있으면 설치창을 띄우고, 없으면 설치 방법을 안내한다.
 * 신호는 이미 설치했거나 Chrome 의 설치 안내를 닫은 뒤 한동안 오지 않으므로, 신호에만 기대면 단추가 사라진다.
 * 아이폰 Safari 는 설치창이 없으므로 「공유 → 홈 화면에 추가」 안내를 보여 준다. 설치한 앱으로 열었으면 숨긴다.
 *
 * Chrome 의 자동 설치 안내(미니 바)는 막지 않는다. 사용자가 그 안내를 닫았어도 이 단추로 다시 설치할 수 있다.
 * 단추는 class="install-app-btn" 인 요소면 어디든 되고, 설치할 수 없을 때는 hidden 이 된다.
 * 아이콘은 Android Chrome 의 「설치」와 같은 모양(모니터 + 오른쪽 위 아래 화살표, Material Symbols install_desktop)을 쓴다.
 * 설치할 수 있는지가 바뀌면 window 에 'install-availability-changed'(detail.installable)를 보낸다.
 */

let deferredPrompt = null;

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIosSafari = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 지금 설치를 권할 수 있는가 */
export function canOfferInstall() {
  return !isStandalone();
}

/** 화면에 있는 모든 설치 단추를 지금 상태에 맞춰 보이거나 숨긴다 */
export function refreshInstallButtons() {
  const show = canOfferInstall();
  document.querySelectorAll('.install-app-btn').forEach((btn) => { btn.hidden = !show; });
  // 설정 톱니의 new 점 등이 듣는다
  window.dispatchEvent(new CustomEvent('install-availability-changed', { detail: { installable: show } }));
}

/** 설치창을 띄운다. 아이폰이면 안내를 보여 준다. */
export async function promptInstall() {
  if (deferredPrompt) {
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    promptEvent.prompt();
    try {
      await promptEvent.userChoice;
    } catch {
      /* 무시 */
    }
    refreshInstallButtons();
    return;
  }
  if (isIosSafari()) {
    alert('아이폰에서는 Safari 아래쪽의 공유 단추(□↑)를 누르고 「홈 화면에 추가」를 고르면 앱처럼 설치됩니다.');
    return;
  }
  alert('Chrome 오른쪽 위 메뉴(⋮)에서 「앱 설치」나 「홈 화면에 추가」를 누르면 설치됩니다. 이미 설치했다면 홈 화면의 아이콘으로 열어 주세요.');
}

/** 알림함 맨 위 등에 넣는 설치 안내 줄 HTML. 설치할 수 없으면 숨긴 채로 둔다. */
export function renderInstallRowHtml() {
  return `
    <button type="button" class="install-app-btn install-app-row" ${canOfferInstall() ? '' : 'hidden'}>
      <span class="material-symbols-outlined" aria-hidden="true">install_desktop</span>
      <span class="install-app-text"><strong>홈 화면에 앱 설치</strong><small>앱처럼 바로 열고 복습 알림도 받아요</small></span>
    </button>`;
}

/** 페이지의 설치 단추 클릭을 한 곳에서 받는다(나중에 그려진 단추도 포함) */
document.addEventListener('click', (e) => {
  const btn = e.target.closest?.('.install-app-btn');
  if (!btn) return;
  e.stopPropagation();
  promptInstall();
}, true);

window.addEventListener('beforeinstallprompt', (e) => {
  deferredPrompt = e;
  refreshInstallButtons();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  refreshInstallButtons();
});
