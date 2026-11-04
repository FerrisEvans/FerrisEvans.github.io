/** TV startup never owns the room, camera, VCR transport, or sound permission. */
export function createTVStartup() {
  let phase: 'off' | 'booting' | 'prompt' | 'playing' = 'off';
  let started = 0, reveal = 1, cycle = 0;
  return {
    get phase() { return phase; },
    get waiting() { return phase === 'booting' || phase === 'prompt'; },
    get moving() { return phase === 'booting'; },
    get reveal() { return reveal; },
    get cycle() { return cycle; },
    power(on: boolean, now: number, reduced = false) {
      if (!on) { phase = 'off'; reveal = 1; return; }
      if (phase !== 'off') return;
      cycle++; started = now; reveal = reduced ? 1 : 0;
      phase = reduced ? 'prompt' : 'booting';
    },
    update(now: number, reduced = false) {
      if (phase !== 'booting') return;
      const progress = reduced ? 1 : Math.max(0, Math.min(1, (now - started) / .65));
      reveal = progress * progress * (3 - 2 * progress);
      if (progress === 1) phase = 'prompt';
    },
    play() {
      if (phase === 'off') return false;
      phase = 'playing'; reveal = 1; return true;
    },
  };
}
