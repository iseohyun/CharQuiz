/**
 * @file components/date-utils.js
 * @description 학습 통계용 날짜 키 유틸리티. 사용자 기기의 "로컬 날짜"(한국이면 KST) 기준 YYYY-MM-DD 키를 만든다.
 * toISOString()은 UTC 기준이라 한국 시간 00:00~08:59 기록이 전날로 집계되므로 사용하지 않는다.
 */

/**
 * 로컬 날짜 기준 'YYYY-MM-DD' 키를 반환한다.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function toLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 오늘을 포함한 최근 N일의 로컬 날짜 키를 오래된 날짜부터 반환한다.
 * @param {number} [days=7]
 * @returns {string[]}
 */
export function getRecentLocalDateKeys(days = 7) {
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(toLocalDateKey(d));
  }
  return keys;
}
