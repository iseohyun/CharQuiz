/**
 * @file components/storage-migration.js
 * @description 서비스 이름 변경(KanaLoop → CharQuiz)으로 바뀐 localStorage 키를 1회 복사해 기존 사용자 데이터를 복구하는 모듈.
 * origin(https://iseohyun.com)이 바뀌지 않았기 때문에 옛 키가 브라우저에 그대로 남아 있다.
 * 옛 키는 롤백에 대비해 지우지 않고 남겨 둔다.
 */

const LEGACY_PREFIX = 'KANALOOP_';
const CURRENT_PREFIX = 'CHARQUIZ_';
const MIGRATION_FLAG_KEY = 'CHARQUIZ_STORAGE_MIGRATED_V1';

/**
 * KANALOOP_* 키를 CHARQUIZ_* 키로 복사한다. 이미 새 키가 있으면 덮어쓰지 않는다.
 * @returns {number} 이번 실행에서 복사한 키 개수
 */
export function migrateLegacyStorage() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG_KEY)) return 0;

    // 반복 중에 setItem 을 하면 key(i) 순서가 바뀌므로 대상 키를 먼저 모은다.
    const legacyKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
    }

    let copiedCount = 0;
    legacyKeys.forEach((legacyKey) => {
      const newKey = CURRENT_PREFIX + legacyKey.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, localStorage.getItem(legacyKey));
        copiedCount++;
      }
    });

    localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
    if (copiedCount > 0) {
      console.log(`[Migration] 이전 버전(KanaLoop) 로컬 데이터 ${copiedCount}건을 복구했습니다.`);
    }
    return copiedCount;
  } catch (e) {
    console.warn('[Migration] 로컬 데이터 마이그레이션 실패 (기존 동작 유지):', e);
    return 0;
  }
}
