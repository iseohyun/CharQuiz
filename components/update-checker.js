/**
 * @file components/update-checker.js
 * @description 새 판 감지: 서버의 index.html 을 캐시 없이 받아 CACHE_BUST 를 비교하고,
 * 다르면 화면 아래에 「새 버전이 있습니다 · 새로 고침」 안내를 띄운다.
 *
 * 홈 화면에 설치한 앱은 닫았다 열어도 메모리의 화면을 이어 쓰고 새로 고침 버튼도 없어서,
 * 이 확인이 없으면 배포한 새 판을 받을 길이 없다.
 * 확인하는 때: 앱을 연 직후, 다른 앱에서 돌아와 화면이 다시 보일 때, 그리고 30분마다.
 */

const FIRST_CHECK_DELAY_MS = 5 * 1000;
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
const CACHE_BUST_PATTERN = /window\.CACHE_BUST\s*=\s*["']([^"']+)["']/;

let lastCheckAt = 0;
let bannerShown = false;
let dismissedVersion = null;

/**
 * 서버에 올라간 판의 CACHE_BUST 를 읽는다. 읽지 못하면 null.
 */
async function fetchDeployedVersion() {
  const url = new URL('./index.html', document.baseURI);
  url.searchParams.set('_', Date.now().toString());
  const response = await fetch(url.href, { cache: 'no-store' });
  if (!response.ok) return null;
  const match = (await response.text()).match(CACHE_BUST_PATTERN);
  return match ? match[1] : null;
}

async function checkForUpdate() {
  if (bannerShown || !window.CACHE_BUST || navigator.onLine === false) return;
  const now = Date.now();
  if (now - lastCheckAt < MIN_GAP_MS) return;
  lastCheckAt = now;

  try {
    const deployed = await fetchDeployedVersion();
    if (deployed && deployed !== window.CACHE_BUST && deployed !== dismissedVersion) {
      showUpdateBanner(deployed);
    }
  } catch (error) {
    // 오프라인이거나 일시적인 네트워크 오류: 다음 확인 때 다시 시도한다
    console.log('[Update] 새 판 확인 건너뜀:', error.message || error);
  }
}

function showUpdateBanner(deployedVersion) {
  bannerShown = true;
  console.log(`[Update] 새 판 감지: ${window.CACHE_BUST} → ${deployedVersion}`);

  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <span class="update-banner-text">새 버전이 있습니다</span>
    <button type="button" class="update-banner-reload">새로 고침</button>
    <button type="button" class="update-banner-close" aria-label="나중에">&times;</button>
  `;

  banner.querySelector('.update-banner-reload').addEventListener('click', () => {
    window.location.reload();
  });
  banner.querySelector('.update-banner-close').addEventListener('click', () => {
    // 같은 판은 다시 알리지 않는다. 그 뒤에 또 새 판이 나오면 다시 알린다.
    dismissedVersion = deployedVersion;
    bannerShown = false;
    banner.remove();
  });

  document.body.appendChild(banner);
}

/**
 * 앱 시작 시 한 번 호출한다.
 */
export function startUpdateChecker() {
  setTimeout(checkForUpdate, FIRST_CHECK_DELAY_MS);
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('online', checkForUpdate);
}
