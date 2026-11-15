// DOM-only presentation. Text is always assigned as textContent, never HTML from state.
export function createHud() {
  const element = id => document.getElementById(id);
  const overlay = element('overlay');
  const buy = element('buy-menu');
  let markerTimer;
  return {
    setState(state, equipment, objective, allies, enemies) {
      element('round').textContent = state.round;
      const seconds = Math.ceil(state.time);
      element('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      element('score-value').textContent = `${state.blue} : ${state.red}`;
      element('money').textContent = `$${state.money}`;
      element('objective').textContent = objective;
      element('health').textContent = Math.max(0, Math.ceil(state.health));
      element('weapon-name').textContent = equipment.config.name;
      element('ammo-mag').textContent = equipment.weapon.state.mag;
      element('ammo-reserve').textContent = `/ ${equipment.weapon.state.reserve}`;
      element('phase').textContent = state.phase === 'buy' ? 'REQUISITION' : state.phase.toUpperCase();
      element('squads').textContent = `WARDEN ${allies}  /  EMBER ${enemies}`;
      element('equipment').textContent = `G · FRAG ×${state.grenades}   |   ${equipment.weapon.state.reloadLeft > 0 ? 'RELOADING…' : 'R · RELOAD'}`;
      for (const button of buy.querySelectorAll('[data-cost]')) {
        button.disabled = state.phase !== 'buy' || state.money < Number(button.dataset.cost);
      }
      element('crosshair').style.opacity = state.phase === 'live' && state.health > 0 ? '1' : '0';
    },
    hitMarker(kill, headshot = false) {
      const marker = element('hitmarker');
      marker.textContent = headshot ? '✦' : '×';
      marker.style.color = kill ? '#ffc46b' : '#e8f3f5';
      marker.classList.add('on');
      clearTimeout(markerTimer);
      markerTimer = setTimeout(() => marker.classList.remove('on'), 160);
    },
    notice(text) { element('notice').textContent = text; },
    show(mode, title, copy, action = 'DEPLOY') {
      element('overlay-title').textContent = title;
      element('overlay-copy').textContent = copy;
      element('play').textContent = action;
      buy.hidden = mode !== 'buy';
      overlay.hidden = false;
    },
    hide() { overlay.hidden = true; },
    onPlay(callback) { element('play').addEventListener('click', callback); },
    onBuy(callback) {
      for (const button of buy.querySelectorAll('[data-item]')) {
        button.addEventListener('click', () => callback(button.dataset.item));
      }
    },
  };
}
