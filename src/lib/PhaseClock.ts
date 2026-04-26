import { RITE_PHASES, smoothstep } from './Liturgy';

export type PhaseClockSnapshot = {
  phaseIndex: number;
  previousPhaseIndex: number;
  phaseElapsedMs: number;
  transitionProgress: number;
};

export class PhaseClock {
  private phaseIndex = 0;
  private previousPhaseIndex = 0;
  private phaseStartedAt = performance.now();
  private surgeStartedAt: number | null = null;

  step(delta: 1 | -1) {
    const next = (this.phaseIndex + delta + RITE_PHASES.length) % RITE_PHASES.length;
    this.jump(next);
  }

  jump(index: number, elapsedMs = 0) {
    const now = performance.now();
    this.previousPhaseIndex = this.phaseIndex;
    this.phaseIndex = ((index % RITE_PHASES.length) + RITE_PHASES.length) % RITE_PHASES.length;
    this.phaseStartedAt = now - Math.max(0, elapsedMs);
    this.surgeStartedAt = null;
  }

  reset() {
    this.previousPhaseIndex = this.phaseIndex;
    this.phaseStartedAt = performance.now();
    this.surgeStartedAt = null;
  }

  tick(lowMid: number): PhaseClockSnapshot {
    const now = performance.now();
    const phase = RITE_PHASES[this.phaseIndex];
    const elapsed = now - this.phaseStartedAt;

    if (elapsed > phase.minMs && lowMid > 0.66) {
      this.surgeStartedAt ??= now;
    } else if (lowMid < 0.5) {
      this.surgeStartedAt = null;
    }

    const confirmedMusicChange = this.surgeStartedAt !== null && now - this.surgeStartedAt > 4200;
    const hitCeiling = elapsed > phase.maxMs;

    if ((confirmedMusicChange || hitCeiling) && this.phaseIndex < RITE_PHASES.length - 1) {
      this.previousPhaseIndex = this.phaseIndex;
      this.phaseIndex += 1;
      this.phaseStartedAt = now;
      this.surgeStartedAt = null;
    }

    const active = RITE_PHASES[this.phaseIndex];
    const activeElapsed = now - this.phaseStartedAt;
    const rawTransition = Math.min(1, activeElapsed / active.transitionMs);

    return {
      phaseIndex: this.phaseIndex,
      previousPhaseIndex: this.previousPhaseIndex,
      phaseElapsedMs: activeElapsed,
      transitionProgress: smoothstep(0, 1, rawTransition),
    };
  }
}
