/**
 * @file components/season-weather.js
 * @description 계절(날짜)과 대략의 날씨(IP 위치)를 정한다. 위치 권한은 묻지 않는다.
 *
 * - 계절: 기기 날짜로 정한다(3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울).
 * - 날씨: ipwho.is 로 접속 IP 의 대략적인 위치(도시 단위)를 받고, Open-Meteo 에서 그 위치의 지금 날씨를 받는다.
 *   둘 다 키가 필요 없다. 접속 IP 가 ipwho.is 로 가므로 설정의 「날씨 반영」을 끄면 아예 묻지 않는다.
 *   결과는 기기에 1시간 동안 저장해 두고 다시 쓴다. 실패하면 날씨 없이 계절만 쓴다.
 */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export const SEASON_META = Object.freeze({
  spring: { icon: '🌸', label: '봄' },
  summer: { icon: '🌊', label: '여름' },
  autumn: { icon: '🍂', label: '가을' },
  winter: { icon: '❄️', label: '겨울' }
});

export const WEATHER_META = Object.freeze({
  clear: { icon: '☀️', nightIcon: '🌙', label: '맑음' },
  cloudy: { icon: '☁️', label: '흐림' },
  fog: { icon: '🌫️', label: '안개' },
  rain: { icon: '🌧️', label: '비' },
  snow: { icon: '🌨️', label: '눈' },
  thunder: { icon: '⛈️', label: '뇌우' }
});

const CACHE_KEY = 'CHARQUIZ_WEATHER';
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

export function getSeasonByDate(date = new Date()) {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/** Open-Meteo(WMO) 날씨 코드를 화면용 날씨로 묶는다 */
function weatherKindFromCode(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  if (code >= 51 && code <= 82) return 'rain';
  return 'cloudy';
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  } catch {
    /* 저장소를 못 쓰면 매번 새로 묻는다 */
  }
  return null;
}

function writeCache(value) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* 무시 */
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 대략의 지금 날씨. 실패하거나 끈 경우 null.
 * @returns {Promise<{kind: string, isDay: boolean, temp: number|null, city: string}|null>}
 */
export async function getApproxWeather() {
  const cached = readCache();
  if (cached) return cached.value;
  try {
    const where = await fetchJson('https://ipwho.is/?fields=success,latitude,longitude,city');
    if (!where?.success || typeof where.latitude !== 'number') throw new Error('위치를 알 수 없음');
    // 소수 첫째 자리(약 10km)까지만 보낸다
    const lat = where.latitude.toFixed(1);
    const lon = where.longitude.toFixed(1);
    const now = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day,temperature_2m`);
    const current = now?.current || {};
    const value = {
      kind: weatherKindFromCode(Number(current.weather_code)),
      isDay: current.is_day !== 0,
      temp: typeof current.temperature_2m === 'number' ? Math.round(current.temperature_2m) : null,
      city: String(where.city || '')
    };
    writeCache({ at: Date.now(), value });
    return value;
  } catch (error) {
    console.warn('[Weather] 대략의 날씨를 받지 못해 계절만 씁니다:', error?.message || error);
    writeCache({ at: Date.now(), value: null });
    return null;
  }
}
