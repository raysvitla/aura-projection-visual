export type RitePhaseId = 'SLATE' | 'APPROACH' | 'ICON' | 'TUNNEL' | 'APPARITION' | 'STATIONS' | 'BENEDICTION';

export type LayerWeights = {
  void: number;
  wall: number;
  icon: number;
  apparition: number;
  stations: number;
  logo: number;
  eye: number;
  cream: number;
  blood: number;
};

export type RitePhase = {
  id: RitePhaseId;
  minMs: number;
  maxMs: number;
  transitionMs: number;
  cameraDepth: number;
  cameraOrbit: number;
  weights: LayerWeights;
};

const minute = 60_000;

export const RITE_PHASES: RitePhase[] = [
  {
    id: 'SLATE',
    minMs: 10 * minute,
    maxMs: 14 * minute,
    transitionMs: 70_000,
    cameraDepth: 0.02,
    cameraOrbit: 0.004,
    weights: { void: 1, wall: 0.08, icon: 0.32, apparition: 0, stations: 0, logo: 0.75, eye: 0, cream: 0.08, blood: 0.2 },
  },
  {
    id: 'APPROACH',
    minMs: 14 * minute,
    maxMs: 22 * minute,
    transitionMs: 80_000,
    cameraDepth: 0.16,
    cameraOrbit: 0.012,
    weights: { void: 0.74, wall: 0.22, icon: 0.72, apparition: 0.08, stations: 0, logo: 0, eye: 0, cream: 0.45, blood: 0.45 },
  },
  {
    id: 'ICON',
    minMs: 18 * minute,
    maxMs: 26 * minute,
    transitionMs: 90_000,
    cameraDepth: 0.26,
    cameraOrbit: 0.018,
    weights: { void: 0.68, wall: 0.34, icon: 1, apparition: 0.02, stations: 0, logo: 0, eye: 0.05, cream: 0.55, blood: 0.7 },
  },
  {
    id: 'TUNNEL',
    minMs: 18 * minute,
    maxMs: 28 * minute,
    transitionMs: 90_000,
    cameraDepth: 0.48,
    cameraOrbit: 0.028,
    weights: { void: 0.92, wall: 0.92, icon: 0.78, apparition: 0.1, stations: 0, logo: 0, eye: 0.14, cream: 0.1, blood: 0.86 },
  },
  {
    id: 'APPARITION',
    minMs: 12 * minute,
    maxMs: 20 * minute,
    transitionMs: 80_000,
    cameraDepth: 0.38,
    cameraOrbit: 0.02,
    weights: { void: 0.96, wall: 0.58, icon: 0.58, apparition: 0.46, stations: 0.05, logo: 0, eye: 0.22, cream: 0.02, blood: 0.9 },
  },
  {
    id: 'STATIONS',
    minMs: 12 * minute,
    maxMs: 18 * minute,
    transitionMs: 80_000,
    cameraDepth: 0.24,
    cameraOrbit: 0.01,
    weights: { void: 0.9, wall: 0.36, icon: 0.86, apparition: 0.14, stations: 0.78, logo: 0, eye: 0.08, cream: 0.16, blood: 0.58 },
  },
  {
    id: 'BENEDICTION',
    minMs: 2 * minute,
    maxMs: 5 * minute,
    transitionMs: 70_000,
    cameraDepth: 0.03,
    cameraOrbit: 0.002,
    weights: { void: 1, wall: 0.02, icon: 0.18, apparition: 0, stations: 0, logo: 0.55, eye: 0.86, cream: 0, blood: 0.22 },
  },
];

export const TOTAL_RITE_MS = RITE_PHASES.reduce((sum, phase) => sum + phase.minMs, 0);

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function mixWeights(from: LayerWeights, to: LayerWeights, t: number): LayerWeights {
  return {
    void: mix(from.void, to.void, t),
    wall: mix(from.wall, to.wall, t),
    icon: mix(from.icon, to.icon, t),
    apparition: mix(from.apparition, to.apparition, t),
    stations: mix(from.stations, to.stations, t),
    logo: mix(from.logo, to.logo, t),
    eye: mix(from.eye, to.eye, t),
    cream: mix(from.cream, to.cream, t),
    blood: mix(from.blood, to.blood, t),
  };
}
