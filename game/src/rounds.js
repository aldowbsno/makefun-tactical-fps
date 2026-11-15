// Match rules have no rendering dependencies. Only this module awards round income.
export function createRounds() {
  const state = {
    phase: 'briefing', round: 1, blue: 0, red: 0, time: 12,
    money: 2400, health: 100, grenades: 1, result: '', reason: '',
  };
  return {
    state,
    begin() {
      state.phase = 'buy';
      state.time = 12;
      state.health = 100;
      state.result = '';
      state.reason = '';
    },
    next() {
      state.round++;
      this.begin();
    },
    deploy() {
      if (state.phase !== 'buy') return;
      state.phase = 'live';
      state.time = 85;
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
      if (state.phase !== 'buy' || state.money < cost) return false;
      state.money -= cost;
      return true;
    },
    reward(headshot = false) {
      state.money = Math.min(12000, state.money + (headshot ? 450 : 300));
    },
  };
}
