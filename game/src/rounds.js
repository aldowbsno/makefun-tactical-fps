// Match rules have no rendering dependencies. Only this module awards round income.
export function createRounds() {
  const state = {
    phase: 'briefing', round: 1, blue: 0, red: 0, time: 12,
    money: 2400, health: 100, grenades: 1, result: '', reason: '',
  };
  return {
    state,
    begin() {
      if (state.phase !== 'briefing' && state.phase !== 'result') return false;
      state.phase = 'buy';
      state.time = 12;
      state.health = 100;
      state.result = '';
      state.reason = '';
      return true;
    },
    next() {
      if (state.phase !== 'result') return false;
      state.round++;
      return this.begin();
    },
    deploy() {
      if (state.phase !== 'buy') return false;
      state.phase = 'live';
      state.time = 85;
      return true;
    },
    tick(dt) {
      if (state.phase === 'buy' || state.phase === 'live') state.time = Math.max(0, state.time - dt);
      if (state.phase === 'buy' && state.time === 0) this.deploy();
    },
    finish(win, reason) {
      if (state.phase !== 'live') return false;
      state.phase = 'result';
      state[win ? 'blue' : 'red']++;
      state.money = Math.min(12000, state.money + (win ? 2200 : 1400));
      state.result = win ? 'ROUND SECURED' : 'RELAY DENIED';
      state.reason = reason;
      return true;
    },
    spend(cost) {
      if (state.phase !== 'buy' || !Number.isFinite(cost) || cost <= 0 || state.money < cost) return false;
      state.money -= cost;
      return true;
    },
    reward(headshot = false) {
      if (state.phase !== 'live') return;
      state.money = Math.min(12000, state.money + (headshot ? 450 : 300));
    },
  };
}

export function roundOutcome(state, objective, enemies, allies) {
  if (state.phase !== 'live') return null;
  if (objective.outcome === 'disarmed') return { win: false, reason: 'Ember disarmed the relay' };
  if (objective.outcome === 'transferred') return { win: true, reason: 'Relay transfer completed' };
  if (enemies === 0) return { win: true, reason: 'Ember squad eliminated' };
  if (state.health <= 0 && allies === 0 && !objective.armed) return { win: false, reason: 'Warden squad eliminated' };
  if (state.time === 0 && !objective.armed) return { win: false, reason: 'Link window expired' };
  return null;
}
