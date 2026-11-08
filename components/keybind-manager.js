/**
 * @file components/keybind-manager.js
 * @description 단축키 설정 UI 렌더링, 이벤트 바인딩, 배지 갱신 및 전역 키 매핑을 총괄하는 컴포넌트
 */

/**
 * 설정창 내부 단축키 설정 UI 테이블 HTML 동적 빌드
 */
export function generateKeybindingsHtml(userConfig) {
  let kbHtml = `
    <div style="margin-top: 20px; border-top: 1px solid #ddd; padding-top: 15px;">
      <h3 style="font-size: 14px; margin-bottom: 10px;">⌨️ 메인화면 단축키 설정</h3>
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #eee;">
            <th style="text-align: left; padding: 4px;">기능</th>
            <th style="text-align: center; padding: 4px; width: 85px;">정 (Primary)</th>
            <th style="text-align: center; padding: 4px; width: 85px;">부 (Secondary)</th>
          </tr>
        </thead>
        <tbody>
  `;

  const mainKeys = ['toggleDomain', 'playSoundTest', 'popupProgress', 'popupSetting', 'popupLeaderboard', 'popupHelp', 'popupLogin', 'startStudy', 'startRecord', 'startSpectator'];
  const ingameKeys = ['replayVoice', 'option0', 'option1', 'option2', 'option3'];

  mainKeys.forEach(k => {
    const bind = userConfig.keybindings[k] || { label: k, primary: "", secondary: "" };
    let primaryText = bind.primary || '-';
    if (primaryText === ' ' || primaryText.toLowerCase() === 'space') primaryText = 'Space';
    else if (primaryText.toLowerCase() === 'escape') primaryText = 'ESC';

    let secondaryText = bind.secondary || '-';
    if (secondaryText === ' ' || secondaryText.toLowerCase() === 'space') secondaryText = 'Space';
    else if (secondaryText.toLowerCase() === 'escape') secondaryText = 'ESC';

    kbHtml += `
      <tr style="border-bottom: 1px solid #f9f9f9;">
        <td style="padding: 6px 4px;">${bind.label}</td>
        <td style="text-align: center; padding: 4px;">
          <button class="kb-bind-btn" data-action="${k}" data-type="primary" style="width: 75px; padding: 3px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: #fff;">${primaryText}</button>
        </td>
        <td style="text-align: center; padding: 4px;">
          <button class="kb-bind-btn" data-action="${k}" data-type="secondary" style="width: 75px; padding: 3px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: #fff;">${secondaryText}</button>
        </td>
      </tr>
    `;
  });

  kbHtml += `
        </tbody>
      </table>
      
      <hr style="margin: 20px 0; border: 0; border-top: 1px solid #ddd;" />
      
      <h3 style="font-size: 14px; margin-bottom: 10px;">🎮 인게임 단축키 설정</h3>
      <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 1px solid #eee;">
            <th style="text-align: left; padding: 4px;">기능</th>
            <th style="text-align: center; padding: 4px; width: 85px;">정 (Primary)</th>
            <th style="text-align: center; padding: 4px; width: 85px;">부 (Secondary)</th>
          </tr>
        </thead>
        <tbody>
  `;

  ingameKeys.forEach(k => {
    const bind = userConfig.keybindings[k] || { label: k, primary: "", secondary: "" };
    let primaryText = bind.primary || '-';
    if (primaryText === ' ' || primaryText.toLowerCase() === 'space') primaryText = 'Space';
    else if (primaryText.toLowerCase() === 'escape') primaryText = 'ESC';

    let secondaryText = bind.secondary || '-';
    if (secondaryText === ' ' || secondaryText.toLowerCase() === 'space') secondaryText = 'Space';
    else if (secondaryText.toLowerCase() === 'escape') secondaryText = 'ESC';

    kbHtml += `
      <tr style="border-bottom: 1px solid #f9f9f9;">
        <td style="padding: 6px 4px;">${bind.label}</td>
        <td style="text-align: center; padding: 4px;">
          <button class="kb-bind-btn" data-action="${k}" data-type="primary" style="width: 75px; padding: 3px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: #fff;">${primaryText}</button>
        </td>
        <td style="text-align: center; padding: 4px;">
          <button class="kb-bind-btn" data-action="${k}" data-type="secondary" style="width: 75px; padding: 3px; font-size: 11px; border: 1px solid #ccc; border-radius: 3px; cursor: pointer; background: #fff;">${secondaryText}</button>
        </td>
      </tr>
    `;
  });

  kbHtml += `
        </tbody>
      </table>
    </div>
  `;
  return kbHtml;
}

/**
 * 단축키 설정 변경 버튼 이벤트 리스너 바인딩 및 중복 확인
 */
export function bindKeybindingSettingsEvents(overlay, userConfig) {
  const bindButtons = overlay.querySelectorAll('.kb-bind-btn');
  bindButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();

      if (window.activeKeybindBtn) return;

      window.activeKeybindBtn = btn;
      btn.innerText = "입력 대기...";
      btn.style.background = "#fff3cd";
      btn.style.borderColor = "#ffc107";

      const keydownHandler = (keyEvent) => {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();

        const newKey = keyEvent.key;
        const action = btn.dataset.action;
        const type = btn.dataset.type;

        let formattedKey = newKey;

        // 중복 검사
        const mainKeys = ['toggleDomain', 'playSoundTest', 'popupProgress', 'popupSetting', 'popupLeaderboard', 'popupHelp', 'popupLogin', 'startStudy', 'startRecord', 'startSpectator'];
        const ingameKeys = ['replayVoice', 'option0', 'option1', 'option2', 'option3'];
        const isMain = mainKeys.includes(action);
        const targetGroup = isMain ? mainKeys : ingameKeys;

        let isDuplicate = false;
        let duplicateLabel = "";

        for (const otherAction of targetGroup) {
          const otherBind = userConfig.keybindings[otherAction];
          if (!otherBind) continue;
          if (otherAction === action) {
            const otherType = type === 'primary' ? 'secondary' : 'primary';
            if ((otherBind[otherType] || '').toLowerCase() === formattedKey.toLowerCase()) {
              isDuplicate = true;
              duplicateLabel = `${otherBind.label} (${otherType === 'primary' ? '정' : '부'})`;
              break;
            }
          } else {
            if ((otherBind.primary || '').toLowerCase() === formattedKey.toLowerCase()) {
              isDuplicate = true;
              duplicateLabel = `${otherBind.label} (정)`;
              break;
            }
            if ((otherBind.secondary || '').toLowerCase() === formattedKey.toLowerCase()) {
              isDuplicate = true;
              duplicateLabel = `${otherBind.label} (부)`;
              break;
            }
          }
        }

        let displayKey = formattedKey;
        if (displayKey === ' ' || displayKey.toLowerCase() === 'space') displayKey = 'Space';
        else if (displayKey.toLowerCase() === 'escape') displayKey = 'ESC';

        if (isDuplicate) {
          alert(`이미 '${displayKey}' 키는 ${duplicateLabel}에 할당되어 있습니다.`);
          let originalVal = userConfig.keybindings[action][type] || '-';
          if (originalVal === ' ' || originalVal.toLowerCase() === 'space') originalVal = 'Space';
          else if (originalVal.toLowerCase() === 'escape') originalVal = 'ESC';
          btn.innerText = originalVal;
        } else {
          userConfig.keybindings[action][type] = formattedKey;
          btn.innerText = displayKey;
          updateVisualBadges(userConfig);
        }

        btn.style.background = "#fff";
        btn.style.borderColor = "#ccc";
        window.activeKeybindBtn = null;
        window.removeEventListener('keydown', keydownHandler, true);
      };

      window.addEventListener('keydown', keydownHandler, true);
    });
  });
}

/**
 * 메인 화면 단축키 안내 배지(badge) 업데이트
 */
export function updateVisualBadges(userConfig) {
  if (!userConfig.keybindings) return;
  
  const ids = {
    popupLogin: 'kb-badge-popupLogin',
    toggleDomain: 'kb-badge-toggleDomain',
    playSoundTest: 'kb-badge-playSoundTest',
    popupProgress: 'kb-badge-popupProgress',
    popupSetting: 'kb-badge-popupSetting',
    popupLeaderboard: 'kb-badge-popupLeaderboard',
    popupHelp: 'kb-badge-popupHelp',
    startStudy: 'kb-badge-startStudy',
    startRecord: 'kb-badge-startRecord',
    startSpectator: 'kb-badge-startSpectator'
  };
  
  Object.keys(ids).forEach(action => {
    const el = document.getElementById(ids[action]);
    if (el) {
      const bind = userConfig.keybindings[action];
      if (bind) {
        let displayKey = bind.primary || bind.secondary || '-';
        if (displayKey.toLowerCase() === 'escape') displayKey = 'ESC';
        if (displayKey === ' ') displayKey = 'Space';
        el.innerText = displayKey;
      }
    }
  });
}

/**
 * 단축키 입력 비교 헬퍼
 */
export function matchKey(e, bind) {
  if (!bind) return false;
  const key = e.key.toLowerCase();
  const primary = (bind.primary || '').toLowerCase();
  const secondary = (bind.secondary || '').toLowerCase();
  
  if (key === ' ' || key === 'space') {
    return primary === ' ' || primary === 'space' || secondary === ' ' || secondary === 'space';
  }
  
  return key === primary || key === secondary;
}

/**
 * 전역 단축키 이벤트 리스너 등록
 */
export function registerGlobalKeybindings(userConfig, callbacks) {
  window.addEventListener('keydown', (e) => {
    // 세팅 창 등의 입력(Input, Select) 필드에서 타이핑 중일 때는 단축키 동작 무시
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    // Alt 키 배지 토글 (기본 브라우저 포커스 동작 차단)
    if (e.key === 'Alt') {
      e.preventDefault();
      document.body.classList.add('show-keybinds');
      return;
    }

    const bindings = userConfig.keybindings || {};

    // ESC 키로 모달 닫기
    if (e.key === 'Escape') {
      const activeOverlay = document.querySelector('.modal-overlay');
      if (activeOverlay) {
        e.preventDefault();
        if (typeof callbacks.onEscapeModal === 'function') {
          callbacks.onEscapeModal(activeOverlay);
        }
        return;
      }
    }

    // 관전 화면 탈출 처리 (ESC 누를 시 즉시 메인 화면 복귀)
    const spectatorLayer = document.getElementById('spectator-game-layer');
    if (spectatorLayer && e.key === 'Escape') {
      e.preventDefault();
      if (typeof callbacks.onEscapeSpectator === 'function') {
        callbacks.onEscapeSpectator();
      }
      return;
    }

    const optionsContainer = document.getElementById('options');

    // 퀴즈 화면 탈출 처리 (ESC 누를 시 컨펌창 띄우고 취소 시 타이머 재개)
    if (optionsContainer && e.key === 'Escape') {
      e.preventDefault();
      if (typeof callbacks.onEscapeQuiz === 'function') {
        callbacks.onEscapeQuiz();
      }
      return;
    }

    // 퀴즈 화면이 아닐 때 (메인화면인 경우) 단축키 설정
    if (!optionsContainer) {
      if (document.querySelector('.modal-overlay')) return;

      if (matchKey(e, bindings.toggleDomain)) {
        e.preventDefault();
        if (typeof callbacks.onToggleDomain === 'function') callbacks.onToggleDomain();
      } else if (matchKey(e, bindings.playSoundTest)) {
        e.preventDefault();
        if (typeof callbacks.onPlaySoundTest === 'function') callbacks.onPlaySoundTest();
      } else if (matchKey(e, bindings.popupProgress)) {
        e.preventDefault();
        if (typeof callbacks.onPopupProgress === 'function') callbacks.onPopupProgress();
      } else if (matchKey(e, bindings.popupSetting)) {
        e.preventDefault();
        if (typeof callbacks.onPopupSetting === 'function') callbacks.onPopupSetting();
      } else if (matchKey(e, bindings.popupLeaderboard)) {
        e.preventDefault();
        if (typeof callbacks.onPopupLeaderboard === 'function') callbacks.onPopupLeaderboard();
      } else if (matchKey(e, bindings.popupHelp)) {
        e.preventDefault();
        if (typeof callbacks.onPopupHelp === 'function') callbacks.onPopupHelp();
      } else if (matchKey(e, bindings.popupLogin)) {
        e.preventDefault();
        if (typeof callbacks.onPopupLogin === 'function') callbacks.onPopupLogin();
      } else if (matchKey(e, bindings.startStudy)) {
        e.preventDefault();
        if (typeof callbacks.onStartStudy === 'function') callbacks.onStartStudy();
      } else if (matchKey(e, bindings.startRecord)) {
        e.preventDefault();
        if (typeof callbacks.onStartRecord === 'function') callbacks.onStartRecord();
      } else if (matchKey(e, bindings.startSpectator)) {
        e.preventDefault();
        if (typeof callbacks.onStartSpectator === 'function') callbacks.onStartSpectator();
      }
      return;
    }

    // 퀴즈 화면이지만 오답 확인 대기 중(pointerEvents === 'none')일 때는 무시
    if (optionsContainer.style.pointerEvents === 'none') return;

    // 음성 다시듣기 단축키 매칭
    if (matchKey(e, bindings.replayVoice)) {
      e.preventDefault();
      if (typeof callbacks.onReplayVoice === 'function') callbacks.onReplayVoice();
      return;
    }

    let optionIndex = -1;
    if (matchKey(e, bindings.option0)) optionIndex = 0;      // 왼쪽 위
    if (matchKey(e, bindings.option1)) optionIndex = 1;      // 오른쪽 위
    if (matchKey(e, bindings.option2)) optionIndex = 2;      // 왼쪽 아래
    if (matchKey(e, bindings.option3)) optionIndex = 3;      // 오른쪽 아래

    if (optionIndex !== -1) {
      if (typeof callbacks.onOptionSelect === 'function') {
        callbacks.onOptionSelect(optionIndex);
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      e.preventDefault();
      document.body.classList.remove('show-keybinds');
    }
  });

  window.addEventListener('blur', () => {
    document.body.classList.remove('show-keybinds');
  });
}
