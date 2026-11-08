/**
 * @file components/ui-modal-handler.js
 * @description 모달 뷰(단어장, 학습 통계 차트, 응답 속도 분포, 리더보드 등)의 UI 렌더링 및 상태 제어를 담당하는 모듈
 */

import { getAllProgress } from './db-handler.js';
import { ALPHABETS, INTERVALS } from './engine.js';
import { userConfig } from './store.js';

let analysisMode = 'default';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[s]));
}

export function getStandardCharCount(domain) {
  const rows = ALPHABETS[domain] || [];
  let count = 0;
  for (const row of rows) {
    if (typeof row === 'string' || Array.isArray(row)) {
      for (const char of row) {
        if (char !== '_') count++;
      }
    }
  }
  return count;
}

export function refreshPersonalizedSettings(config) {
  if (!config) return;
  const listContainer = document.getElementById('personalized-settings-list');
  if (listContainer) {
    listContainer.innerHTML = `
      <div style="margin-top:8px;">
        <b>• 진도 합격 기준 점수:</b> <span style="color:#2196F3; font-weight:bold;">${((config.masteryScore || 0.8) * 100).toFixed(0)}%</span>
      </div>
      <div style="margin-top:8px;">
        <b>• 최대 학습 풀 크기:</b> <span style="color:#4CAF50; font-weight:bold;">${config.MAX_POOL_SIZE || 10}개</span>
      </div>
    `;
  }
  const selectEl = document.getElementById('voice-source');
  if (selectEl && config.voiceSource) {
    selectEl.value = config.voiceSource;
  }
}

export function renderStudyStatsChart(stats) {
  const container = document.getElementById('study-chart-container');
  const totalDisplay = document.getElementById('total-study-time');

  if (!container) {
    console.error("[CRITICAL] '#study-chart-container' 엘리먼트를 DOM에서 찾을 수 없습니다.");
    return;
  }

  const totalMinRounded = Math.round((stats?.total || 0) / 60);
  if (totalDisplay) totalDisplay.innerText = `${totalMinRounded}분`;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]);
  }

  const maxSec = Math.max(...days.map(d => stats?.history?.[d] || 0), 1);

  container.innerHTML = days.map(day => {
    const sec = stats?.history?.[day] || 0;
    const height = (sec / maxSec) * 100;
    const label = day.slice(5);
    return `
      <div style="flex:1; display:flex; flex-direction:column; align-items:center; height:100%; justify-content:flex-end;">
        <div title="${Math.round(sec / 60)}분" style="width:100%; max-width:30px; height:${height}%; background:#4a90e2; border-radius:4px 4px 0 0; min-height:2px;"></div>
        <div style="font-size:9px; margin-top:5px; color:#999; white-space:nowrap;">${label}</div>
      </div>
    `;
  }).join('');
}

export async function renderResponseTimeChart(domain) {
  const container = document.getElementById('response-time-chart');
  if (!container) {
    console.error("[CRITICAL] '#response-time-chart' 엘리먼트가 고착되지 않았습니다.");
    return;
  }

  const allData = await getAllProgress(domain);

  const correctBins = new Array(26).fill(0);
  let totalCount = 0;

  Object.values(allData).forEach(data => {
    if (!data.recentLatencies) return;
    data.recentLatencies.forEach(ms => {
      const sec = ms / 1000;
      const binIndex = Math.min(Math.floor(sec / 0.2), 25);
      correctBins[binIndex]++;
      totalCount++;
    });
  });

  if (totalCount === 0) {
    container.innerHTML = `<div style="color:#aaa; text-align:center; padding-top:15px; font-size:11px; width:100%;">분포 데이터 부족</div>`;
    return;
  }

  const maxFreq = Math.max(...correctBins, 1);
  const barHtml = correctBins.map((cVal, idx) => {
    const cHeight = (cVal / maxFreq) * 100;
    const isMaxBucket = (cVal === maxFreq);
    const bgColor = isMaxBucket ? '#222222' : '#b39ddb';
    return `<div title="${(idx * 0.2).toFixed(1)}s: ${cVal}개" style="flex:1; height:${cHeight}%; background:${bgColor}; min-width:1px;"></div>`;
  }).join('');

  const points = correctBins.map((v, i) => {
    const x = ((i + 0.5) / 26) * 100;
    const y = 100 - (v / maxFreq) * 100;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  container.innerHTML = barHtml + `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; overflow:visible;">
      <polyline points="${points}" fill="none" stroke="#FF5722" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>
  `;
}

function getLatencyColor(avgSec) {
  if (!avgSec || avgSec <= 0) return '#f0f0f0';
  const ratio = Math.min(Math.max((avgSec - 1) / 4, 0), 1);
  const r = Math.floor(200 + (255 - 200) * ratio);
  const g = Math.floor(240 - (240 - 150) * ratio);
  const b = Math.floor(200 - (200 - 150) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

export function getStageColor(stage) {
  if (stage === 0) return '#f0f0f0';
  const colors = [
    '#ffdddd', // lv.0
    '#ffe0cc', // lv.1
    '#ffe6ba', // lv.2
    '#fff0b3', // lv.3
    '#edf2b2', // lv.4
    '#d9efb0', // lv.5
    '#c3e9ad', // lv.6
    '#aedfaa', // lv.7
    '#99d5a6'  // lv.8
  ];
  return colors[Math.min(stage, 8)];
}

export function renderProgressTable(domain, domainProgress) {
  const table = document.getElementById('progress-table');
  const countLabel = document.getElementById('settings-active-count');

  if (!table) return;
  table.innerHTML = '';

  const safeProgress = domainProgress || {};
  const rawDataset = ALPHABETS[domain] || [];

  let totalCount = 0;
  let learnedCount = 0;
  let globalIdx = 0;

  // 1. 진행률 집계를 위한 인덱스 사전 매핑 (언더바 완전 제외)
  rawDataset.forEach((rowStr) => {
    if (typeof rowStr === 'string') {
      for (let i = 0; i < rowStr.length; i++) {
        if (rowStr[i] !== '_') {
          totalCount++;
          const progress = safeProgress[globalIdx.toString()];
          if (progress && progress.stage > 0) learnedCount++;
          globalIdx++;
        }
      }
    }
  });

  // 2. 행렬 드로잉 (문자열 데이터셋의 1줄 = 테이블의 1행 강제 매치)
  let charIdxMarker = 0;

  rawDataset.forEach((rowStr) => {
    if (typeof rowStr !== 'string') return;

    const tr = document.createElement('tr');

    for (let i = 0; i < rowStr.length; i++) {
      const charName = rowStr[i];
      const td = document.createElement('td');
      td.style.border = "1px solid #e5e5e5";
      td.style.padding = "7px 2px";
      td.style.transition = "background-color 0.2s ease";

      // 언더바 발견 시 인덱스 계산 제외 및 공백 빈 셀 처리
      if (charName === '_') {
        td.style.background = "#e9e9e9";
        td.innerHTML = `&nbsp;`;
        tr.appendChild(td);
        continue;
      }

      const cId = charIdxMarker;
      charIdxMarker++;

      const progress = safeProgress[cId.toString()];
      const hasProgress = progress && progress.stage > 0;

      td.style.cursor = "pointer";

      let isOverdue = false;
      if (hasProgress) {
        const lastTime = progress.lastSessionTime || Date.now();
        const timeDiffMin = (Date.now() - lastTime) / (60 * 1000);
        const requiredMin = INTERVALS[progress.stage] || INTERVALS[INTERVALS.length - 1];
        isOverdue = timeDiffMin >= requiredMin;
      }

      if (!hasProgress) {
        td.style.background = "#e9e9e9";
        td.style.color = "#bbbbbb";
        td.innerHTML = `
          <div style="font-size:15px; font-weight:bold; opacity:0.35;">${escapeHtml(charName)}</div>
          <div style="font-size:9px; color:#bfbfbf; margin-top:3px;">-</div>
        `;
      } else {
        const avgLat = progress.recentLatencies && progress.recentLatencies.length > 0
          ? (progress.recentLatencies.reduce((a, b) => a + b, 0) / progress.recentLatencies.length / 1000)
          : 0;

        const infoText = analysisMode === 'stage'
          ? `Lv.${progress.stage} | ${progress.outCnt} Out`
          : `${avgLat ? avgLat.toFixed(1) + 's' : '-'}`;

        td.style.background = (analysisMode === 'stage') ? getStageColor(progress.stage) : getLatencyColor(avgLat);
        td.style.color = "#222222";

        if (isOverdue) {
          td.style.border = "2px solid #F44336";
          td.style.padding = "6px 1px";
        }

        td.innerHTML = `
          <div style="font-size:16px; font-weight:bold;">${escapeHtml(charName)}</div>
          <div style="font-size:9px; color:#555555; margin-top:2px; font-family:monospace; line-height:1.1;">
            ${escapeHtml(infoText)}
          </div>
        `;
      }

      td.onclick = () => {
        if (hasProgress) {
          if (confirm(`[${charName}] 기록을 초기화할까요?`)) window.resetSingleCharProgress?.(domain, cId);
        } else {
          if (confirm(`[${charName}] 진도를 나갈까요?`)) window.activateSingleCharProgress?.(domain, cId);
        }
      };

      tr.appendChild(td);
    }

    table.appendChild(tr);
  });

  if (countLabel) {
    const percent = totalCount > 0 ? ((learnedCount / totalCount) * 100).toFixed(1) : "0.0";
    countLabel.innerText = `${learnedCount} / ${totalCount} (${percent}%)`;
  }
}

/**
 * 분석 모드 토글 액션 바인딩
 */
export async function toggleAnalysisMode() {
  analysisMode = (analysisMode === 'default') ? 'stage' : 'default';
  const btn = document.getElementById('btn-analysis');
  if (btn) btn.innerText = analysisMode === 'stage' ? "장기기억" : "응답속도";

  const domain = userConfig.currentDomain;
  const currentDomainData = await getAllProgress(domain);
  renderProgressTable(domain, currentDomainData);
}

/**
 * 스피드런 및 학습 모드 랭킹 리더보드 렌더링 함수
 */
export function renderLeaderboardUI(rankings, mode = 'speedrun') {
  const listContainer = document.getElementById('leaderboard-list');
  if (!listContainer) {
    console.warn("[Leaderboard] 랭킹을 표시할 '#leaderboard-list' 엘리먼트를 찾을 수 없습니다.");
    return;
  }

  const btnSpeedrun = document.getElementById('tab-speedrun');
  const btnStudy = document.getElementById('tab-study');
  if (btnSpeedrun && btnStudy) {
    if (mode === 'study') {
      btnSpeedrun.classList.remove('active');
      btnStudy.classList.add('active');
    } else {
      btnSpeedrun.classList.add('active');
      btnStudy.classList.remove('active');
    }
  }

  const headerContainer = document.getElementById('leaderboard-header');
  if (headerContainer) {
    if (mode === 'study') {
      headerContainer.innerHTML = `
        <tr>
          <th>순위</th>
          <th>아이디</th>
          <th>도메인</th>
          <th>정답수</th>
          <th>소요시간</th>
          <th>정답률</th>
          <th>완료시각</th>
        </tr>
      `;
    } else {
      headerContainer.innerHTML = `
        <tr>
          <th>순위</th>
          <th>아이디</th>
          <th>도메인 (문항수)</th>
          <th>소요시간</th>
          <th>정답률</th>
          <th>완료 시각</th>
        </tr>
      `;
    }
  }

  listContainer.innerHTML = '';

  const colCount = mode === 'study' ? 7 : 6;

  if (!rankings || rankings.length === 0) {
    listContainer.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center; padding: 30px; color:#777;">등록된 기록이 없습니다.</td></tr>`;
    return;
  }

  const domainMap = {
    'hira': 'あ',
    'kata': 'ア',
    'hangle': '가',
    'english(a)': 'a',
    'english(A)': 'A',
    'english': 'a',
    'ENGLISH': 'A',
    'alphabet': 'a'
  };

  let html = '';
  rankings.forEach((entry, index) => {
    const rank = index + 1;
    const isTop3 = rank <= 3;
    const rankStyle = isTop3 ? 'font-weight:bold; color:#FF9800;' : 'color:#555;';

    let displayName = entry.name || '게스트';
    if (displayName.startsWith('GUEST_')) {
      displayName = 'G_' + displayName.substring(6, 10) + '...';
    }
    const safeName = escapeHtml(displayName);

    const domainDisplay = escapeHtml(domainMap[entry.domain] || entry.domain || '');
    const safeElapsed = escapeHtml(entry.elapsedStr || '-');
    const safeUpdatedAt = escapeHtml(entry.updatedAt || '');

    const isHighlighted = window.highlightRecordId && window.highlightRecordId === entry.id;
    const trStyle = isHighlighted ? 'background-color: #fff9c4;' : '';

    if (mode === 'study') {
      html += `
        <tr style="${trStyle}">
          <td style="text-align:center; ${rankStyle} font-size:16px;">${rank}</td>
          <td style="font-weight:bold; color:#333; text-align:center;">${safeName}</td>
          <td style="text-align:center;">${domainDisplay}</td>
          <td style="text-align:center; font-weight:bold; color:#4CAF50;">${Number(entry.correctCount) || 0}</td>
          <td style="text-align:center; font-weight:bold; color:#2196F3;">${safeElapsed}</td>
          <td style="text-align:center;">${Number(entry.accuracy) || 0}%</td>
          <td style="text-align:center; font-size:11px; color:#aaa;">${safeUpdatedAt}</td>
        </tr>
      `;
    } else {
      html += `
        <tr style="${trStyle}">
          <td style="text-align:center; ${rankStyle} font-size:16px;">${rank}</td>
          <td style="font-weight:bold; color:#333; text-align:center;">${safeName}</td>
          <td style="text-align:center;">${domainDisplay} <span style="font-size:11px; color:#999;">(${Number(entry.charCount) || 0})</span></td>
          <td style="text-align:center; font-weight:bold; color:#2196F3;">${safeElapsed}</td>
          <td style="text-align:center;">${Number(entry.accuracy) || 0}%</td>
          <td style="text-align:center; font-size:11px; color:#aaa;">${safeUpdatedAt}</td>
        </tr>
      `;
    }
  });

  listContainer.innerHTML = html;
}
