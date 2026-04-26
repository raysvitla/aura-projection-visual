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
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 55_000,
    cameraDepth: 0.04,
    cameraOrbit: 0.08,
    weights: { void: 1, wall: 0.05, icon: 0.24, apparition: 0, stations: 0, logo: 0.92, eye: 0, cream: 0.04, blood: 0.18 },
  },
  {
    id: 'APPROACH',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 65_000,
    cameraDepth: 0.24,
    cameraOrbit: 0.18,
    weights: { void: 0.76, wall: 0.34, icon: 0.66, apparition: 0.06, stations: 0, logo: 0.26, eye: 0, cream: 0.46, blood: 0.38 },
  },
  {
    id: 'ICON',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 70_000,
    cameraDepth: 0.34,
    cameraOrbit: 0.26,
    weights: { void: 0.66, wall: 0.16, icon: 1, apparition: 0.02, stations: 0, logo: 0.2, eye: 0.18, cream: 0.72, blood: 0.52 },
  },
  {
    id: 'TUNNEL',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 75_000,
    cameraDepth: 0.58,
    cameraOrbit: 0.46,
    weights: { void: 0.92, wall: 1, icon: 0.48, apparition: 0.08, stations: 0, logo: 0.26, eye: 0.08, cream: 0.08, blood: 0.92 },
  },
  {
    id: 'APPARITION',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 68_000,
    cameraDepth: 0.46,
    cameraOrbit: 0.34,
    weights: { void: 1, wall: 0.26, icon: 0.46, apparition: 0.72, stations: 0.06, logo: 0.18, eye: 0.24, cream: 0.02, blood: 0.86 },
  },
  {
    id: 'STATIONS',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 62_000,
    cameraDepth: 0.28,
    cameraOrbit: 0.3,
    weights: { void: 0.86, wall: 0.58, icon: 0.62, apparition: 0.08, stations: 1, logo: 0.5, eye: 0.04, cream: 0.16, blood: 0.78 },
  },
  {
    id: 'BENEDICTION',
    minMs: 5 * minute,
    maxMs: 7 * minute,
    transitionMs: 58_000,
    cameraDepth: 0.08,
    cameraOrbit: 0.14,
    weights: { void: 1, wall: 0.08, icon: 0.26, apparition: 0, stations: 0.12, logo: 1, eye: 0.86, cream: 0.02, blood: 0.28 },
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
