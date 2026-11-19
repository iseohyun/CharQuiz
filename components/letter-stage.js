/**
 * @file components/letter-stage.js
 * @description 처음 화면 요약 카드 뒤의 계절·날씨 무대. 고른 범위의 글자들이 계절에 맞게 움직이고, 날씨가 그 위에 겹친다.
 *
 *  계절(움직임과 바탕):  봄 = 글자가 살랑이며 떠오르고 꽃잎이 날림 · 여름 = 물결 위에서 출렁이고 윤슬이 반짝임
 *                        가을 = 글자가 흔들리며 내려오고 낙엽이 구름 · 겨울 = 글자가 천천히 내려오고 눈이 옴
 *  날씨(겹침):           비·뇌우 = 빗줄기(뇌우는 가끔 번쩍) · 눈 = 눈송이 · 흐림 = 구름 · 안개 = 뿌연 막 · 맑음 = 해(밤에는 별)
 * 카드가 화면에서 사라지면 스스로 멈춘다. 움직임 줄이기 설정이면 한 장면만 그린다.
 */

const MAX_LETTERS = 10;

const SEASON_STYLE = {
  spring: { bg: ['#fff1f6', '#fde7f1', '#f0fdf4'], letter: ['#ec4899', '#f472b6', '#22c55e', '#a855f7'], particle: '#f9a8d4' },
  summer: { bg: ['#ecfeff', '#e0f2fe', '#dbeafe'], letter: ['#0284c7', '#06b6d4', '#2563eb', '#14b8a6'], particle: '#ffffff' },
  autumn: { bg: ['#fff7ed', '#ffedd5', '#fef3c7'], letter: ['#ea580c', '#c2410c', '#ca8a04', '#b45309'], particle: '#f97316' },
  winter: { bg: ['#f8fafc', '#eef2ff', '#e0f2fe'], letter: ['#4f46e5', '#0ea5e9', '#64748b', '#6366f1'], particle: '#ffffff' }
};

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let rafId = null;

export function stopLetterStage() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/**
 * @param {HTMLElement} container 무대를 깔 요소(요약 카드). 맨 앞에 canvas 를 넣는다.
 * @param {string[]} chars 떠다닐 글자들
 * @param {{season: string, weather: {kind: string, isDay: boolean}|null}} scene
 */
export function startLetterStage(container, chars, { season, weather }) {
  stopLetterStage();
  container.querySelector('.letter-stage')?.remove();
  if (!chars.length) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'letter-stage';
  canvas.setAttribute('aria-hidden', 'true');
  container.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const style = SEASON_STYLE[season] || SEASON_STYLE.spring;
  const kind = weather?.kind || null;
  const isNight = weather && !weather.isDay;

  let w = 0;
  let h = 0;
  const resize = () => {
    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  // ---- 글자 ----
  const makeLetter = (anywhere) => {
    const size = rand(18, 30);
    const letter = { ch: pick(chars), size, color: pick(style.letter), phase: rand(0, Math.PI * 2), alpha: rand(0.22, 0.38), x: rand(0, w), y: 0 };
    if (season === 'spring') { letter.vy = -rand(10, 18); letter.y = anywhere ? rand(0, h) : h + size; }
    else if (season === 'summer') { letter.vx = rand(8, 16) * (Math.random() < 0.5 ? -1 : 1); letter.baseY = rand(h * 0.25, h * 0.9); letter.y = letter.baseY; letter.x = anywhere ? rand(0, w) : (letter.vx > 0 ? -size : w + size); }
    else { letter.vy = season === 'winter' ? rand(6, 11) : rand(12, 20); letter.y = anywhere ? rand(0, h) : -size; }
    return letter;
  };
  let letters = Array.from({ length: Math.min(MAX_LETTERS, Math.max(5, chars.length)) }, () => makeLetter(true));

  // ---- 계절 입자 ----
  const seasonCount = season === 'summer' ? 18 : 14;
  const makeSeasonParticle = (anywhere) => ({
    x: rand(0, w), y: anywhere ? rand(0, h) : -10, r: rand(2, 4.5), vy: rand(10, 24), vx: rand(-8, 14),
    rot: rand(0, Math.PI * 2), vr: rand(-1.5, 1.5), phase: rand(0, Math.PI * 2),
    color: pick(['rgba(249, 115, 22, 0.7)', 'rgba(234, 88, 12, 0.7)', 'rgba(202, 138, 4, 0.7)'])
  });
  let seasonParticles = Array.from({ length: seasonCount }, () => makeSeasonParticle(true));

  // ---- 날씨 입자 ----
  const weatherCount = { rain: 40, thunder: 50, snow: 36 }[kind] || 0;
  const makeWeatherParticle = (anywhere) => ({
    x: rand(-20, w), y: anywhere ? rand(0, h) : rand(-40, -5), len: rand(8, 14), r: rand(1.2, 2.6),
    vy: kind === 'snow' ? rand(14, 26) : rand(180, 260), vx: kind === 'snow' ? rand(-6, 6) : 40
  });
  let weatherParticles = Array.from({ length: weatherCount }, () => makeWeatherParticle(true));
  const clouds = (kind === 'cloudy' || kind === 'rain' || kind === 'thunder')
    ? Array.from({ length: 3 }, (_, i) => ({ x: rand(0, w), y: 10 + i * 16, s: rand(0.8, 1.3), vx: rand(4, 9) })) : [];
  const stars = (kind === 'clear' && isNight) ? Array.from({ length: 14 }, () => ({ x: rand(0, w), y: rand(0, h * 0.6), p: rand(0, 6) })) : [];
  let flash = 0;

  const drawBackground = (t) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    style.bg.forEach((c, i) => g.addColorStop(i / (style.bg.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (isNight) { ctx.fillStyle = 'rgba(30, 41, 59, 0.10)'; ctx.fillRect(0, 0, w, h); }
    if (kind === 'clear' && !isNight) {
      const sun = ctx.createRadialGradient(w - 18, 18, 2, w - 18, 18, 60);
      sun.addColorStop(0, 'rgba(253, 224, 71, 0.55)');
      sun.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, w, h);
    }
    stars.forEach((s) => {
      ctx.fillStyle = `rgba(250, 204, 21, ${0.35 + 0.35 * Math.sin(t * 2 + s.p)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2); ctx.fill();
    });
    if (season === 'summer') {
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.18)';
      ctx.lineWidth = 1.5;
      for (let row = 0; row < 4; row++) {
        const y0 = h * (0.35 + row * 0.18);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin(x / 22 + t * 1.6 + row) * 3);
        ctx.stroke();
      }
    }
  };

  const drawSeasonParticle = (p, t) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (season === 'spring') {
      ctx.fillStyle = 'rgba(249, 168, 212, 0.75)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.4, p.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    } else if (season === 'summer') {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.45 * Math.abs(Math.sin(t * 3 + p.phase))})`;
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.6, 0, Math.PI * 2); ctx.fill();
    } else if (season === 'autumn') {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.moveTo(0, -p.r * 1.6); ctx.quadraticCurveTo(p.r * 1.4, 0, 0, p.r * 1.6); ctx.quadraticCurveTo(-p.r * 1.4, 0, 0, -p.r * 1.6); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };

  const step = (dt, t) => {
    letters.forEach((l, i) => {
      if (season === 'summer') {
        l.x += l.vx * dt;
        l.y = l.baseY + Math.sin(t * 1.6 + l.phase) * 5;
        if (l.x < -40 || l.x > w + 40) letters[i] = makeLetter(false);
      } else {
        l.y += l.vy * dt;
        l.x += Math.sin(t * 0.9 + l.phase) * (season === 'winter' ? 6 : 12) * dt;
        if (l.y < -40 || l.y > h + 40) letters[i] = makeLetter(false);
      }
    });
    if (season !== 'summer') {
      seasonParticles.forEach((p, i) => {
        p.y += p.vy * dt; p.x += (p.vx + Math.sin(t + p.phase) * 10) * dt; p.rot += p.vr * dt;
        if (p.y > h + 10 || p.x > w + 20) seasonParticles[i] = makeSeasonParticle(false);
      });
    }
    weatherParticles.forEach((p, i) => {
      p.y += p.vy * dt; p.x += p.vx * dt;
      if (p.y > h + 10) weatherParticles[i] = makeWeatherParticle(false);
    });
    clouds.forEach((c) => { c.x += c.vx * dt; if (c.x > w + 60) c.x = -60; });
    if (kind === 'thunder') {
      flash = Math.max(0, flash - dt * 3);
      if (Math.random() < dt * 0.08) flash = 1;
    }
  };

  const draw = (t) => {
    ctx.clearRect(0, 0, w, h);
    drawBackground(t);
    seasonParticles.forEach((p) => drawSeasonParticle(p, t));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    letters.forEach((l) => {
      ctx.globalAlpha = l.alpha;
      ctx.fillStyle = l.color;
      ctx.font = `800 ${l.size}px 'Noto Sans JP', 'Noto Sans KR', sans-serif`;
      ctx.fillText(l.ch, l.x, l.y);
    });
    ctx.globalAlpha = 1;
    clouds.forEach((c) => {
      ctx.fillStyle = kind === 'cloudy' ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.32)';
      [[0, 0, 16], [14, -5, 13], [28, 0, 15], [14, 5, 12]].forEach(([dx, dy, r]) => {
        ctx.beginPath(); ctx.arc(c.x + dx * c.s, c.y + dy * c.s, r * c.s, 0, Math.PI * 2); ctx.fill();
      });
    });
    if (kind === 'snow') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      weatherParticles.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); });
    } else if (weatherParticles.length) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.lineWidth = 1;
      weatherParticles.forEach((p) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.len * 0.2, p.y - p.len); ctx.stroke(); });
    }
    if (kind === 'fog') { ctx.fillStyle = 'rgba(241, 245, 249, 0.45)'; ctx.fillRect(0, 0, w, h); }
    if (flash > 0) { ctx.fillStyle = `rgba(255, 255, 255, ${flash * 0.5})`; ctx.fillRect(0, 0, w, h); }
  };

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    draw(0);
    return;
  }

  let last = performance.now();
  const loop = (now) => {
    if (!canvas.isConnected) { stopLetterStage(); return; }
    const rect = container.getBoundingClientRect();
    if (Math.abs(rect.width - w) > 1 || Math.abs(rect.height - h) > 1) resize();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt, now / 1000);
    draw(now / 1000);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}
