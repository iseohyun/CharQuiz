/**
 * @file components/new-dot.js
 * @description 헤더 설정 톱니의 new 점. 새 버전을 아직 확인하지 않았거나 읽지 않은 알림이 있으면 켠다.
 *
 * - 새 버전: window.APP_VERSION 이 이 기기에서 마지막으로 확인한 버전과 다를 때. 설정 화면을 열면 확인한 것으로 친다.
 *   처음 연 기기는 지금 버전을 확인한 것으로 적어 두고 점을 켜지 않는다.
 * - 새 알림: notification-inbox.js 가 보내는 'charquiz-inbox-changed' 의 읽지 않은 수. 알림함을 열면 사라진다.
 * - 앱 설치: 아직 설치하지 않아 설치할 수 있으면(install-prompt.js). 설치하면 사라진다.
 */

import { canOfferInstall } from './install-prompt.js';

const SEEN_VERSION_KEY = 'CHARQUIZ_SEEN_VERSION';

let unreadCount = 0;

function readSeenVersion() {
  try {
    return localStorage.getItem(SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeSeenVersion(version) {
  try {
    localStorage.setItem(SEEN_VERSION_KEY, version);
  } catch {
    /* 저장할 수 없으면 점이 다음에도 뜰 뿐이다 */
  }
}

/** 지금 버전을 아직 확인하지 않았는가 */
export function hasUnseenVersion() {
  const current = window.APP_VERSION;
  if (!current) return false;
  const seen = readSeenVersion();
  if (seen === null) {
    writeSeenVersion(current);
    return false;
  }
  return seen !== current;
}

/** 설정 화면을 열었을 때 부른다 */
export function markVersionSeen() {
  if (window.APP_VERSION) writeSeenVersion(window.APP_VERSION);
  refreshSettingNewDot();
}

export function refreshSettingNewDot() {
  const dot = document.getElementById('setting-new-dot');
  if (dot) dot.hidden = !(hasUnseenVersion() || unreadCount > 0 || canOfferInstall());
}

export function initSettingNewDot() {
  window.addEventListener('charquiz-inbox-changed', (e) => {
    unreadCount = e.detail?.unread || 0;
    refreshSettingNewDot();
  });
  window.addEventListener('install-availability-changed', refreshSettingNewDot);
  refreshSettingNewDot();
}
