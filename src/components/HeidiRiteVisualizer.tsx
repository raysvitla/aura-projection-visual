import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { AudioEngine, AudioFrame } from '../lib/AudioEngine';
import { PhaseClock } from '../lib/PhaseClock';
import { RITE_PHASES, clamp, mix, mixWeights, smoothstep } from '../lib/Liturgy';
import type { LayerWeights } from '../lib/Liturgy';
import '../heidi-rite.css';

type HeidiRiteVisualizerProps = {
  audio: AudioEngine;
};

type RuntimeState = {
  time: number;
  frame: AudioFrame;
  weights: LayerWeights;
  phaseIndex: number;
  previousPhaseIndex: number;
  phaseMix: number[];
  phaseElapsedMs: number;
  transitionProgress: number;
  cameraDepth: number;
  cameraOrbit: number;
  onsetPulse: number;
};

type RuntimeRef = MutableRefObject<RuntimeState>;

const BASE = `${import.meta.env.BASE_URL}heidi-rite/`;
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.glb`;
const ICON_ASPECT = 2912 / 1632;

type ScenePose = { x: number; y: number; z: number; shiftX: number; shiftY: number; scale: number };

const SCENE_POSES: ScenePose[] = [
  { x: -0.04, y: -0.08, z: 0.0, shiftX: 0.0, shiftY: 0.02, scale: 1.0 },
  { x: 0.34, y: -0.48, z: -0.08, shiftX: -0.1, shiftY: 0.04, scale: 1.04 },
  { x: -0.18, y: 0.36, z: 0.07, shiftX: 0.05, shiftY: 0.02, scale: 1.08 },
  { x: 0.36, y: -0.52, z: -0.13, shiftX: -0.03, shiftY: -0.02, scale: 1.13 },
  { x: -0.32, y: 0.2, z: 0.16, shiftX: 0.1, shiftY: -0.03, scale: 1.07 },
  { x: 0.16, y: 0.46, z: -0.2, shiftX: -0.1, shiftY: 0.0, scale: 1.1 },
  { x: -0.08, y: -0.18, z: 0.25, shiftX: 0.0, shiftY: 0.08, scale: 0.98 },
];

const WALL_LAYER_CONFIGS = [
  { variant: 0, opacity: 0.72, z: -1.9, scale: 1.06, rotation: 0.0 },
  { variant: 1, opacity: 0.42, z: -1.82, scale: 1.08, rotation: -0.05 },
  { variant: 2, opacity: 0.74, z: -1.76, scale: 1.02, rotation: 0.08 },
  { variant: 3, opacity: 0.46, z: -1.68, scale: 1.0, rotation: 0.02 },
  { variant: 4, opacity: 0.9, z: -1.72, scale: 1.1, rotation: -0.1 },
  { variant: 5, opacity: 0.95, z: -1.7, scale: 1.03, rotation: 0.12 },
  { variant: 6, opacity: 0.8, z: -1.84, scale: 1.09, rotation: -0.14 },
];

const REFERENCE_SCENES = [
  { src: `${BASE}scene-schematic-crt.png`, phase: 1, mode: 0, x: -0.02, y: 0.03, z: 0.06, width: 1.18, height: 0.82, rotation: -0.045, opacity: 0.96 },
  { src: `${BASE}scene-neural-map.png`, phase: 3, mode: 1, x: 0.02, y: 0.0, z: 0.08, width: 1.12, height: 0.86, rotation: 0.04, opacity: 0.98 },
  { src: `${BASE}scene-cybermap.png`, phase: 6, mode: 2, x: 0.0, y: 0.02, z: 0.18, width: 1.0, height: 0.78, rotation: -0.025, opacity: 0.94 },
] as const;

type WallLayerConfig = (typeof WALL_LAYER_CONFIGS)[number];
type ReferenceSceneConfig = (typeof REFERENCE_SCENES)[number];

function mixPose(from: ScenePose, to: ScenePose, t: number): ScenePose {
  return {
    x: mix(from.x, to.x, t),
    y: mix(from.y, to.y, t),
    z: mix(from.z, to.z, t),
    shiftX: mix(from.shiftX, to.shiftX, t),
    shiftY: mix(from.shiftY, to.shiftY, t),
    scale: mix(from.scale, to.scale, t),
  };
}

const INITIAL_FRAME: AudioFrame = {
  sub: 0.18,
  lowMid: 0.22,
  high: 0.08,
  rms: 0.18,
  spectralFlux: 0,
  onset: false,
  silenceMs: 0,
  impulse: 0,
  mode: 'autopilot',
  micAvailable: false,
  bass: 0.18,
  flow: 0.22,
  shimmer: 0.08,
  energy: 0.18,
};

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOID_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSub;
  uniform float uVoid;
  uniform float uCream;
  uniform float uBlood;
  uniform float uImpulse;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float radius = length(p * vec2(1.55, 1.0));
    float vignette = 1.0 - smoothstep(0.28, 0.88, radius);
    vec3 black = vec3(0.006, 0.005, 0.004);
    vec3 cream = vec3(0.84, 0.78, 0.66);
    vec3 blood = vec3(0.58, 0.045, 0.035);
    float pressure = 0.018 + uSub * 0.035 + uImpulse * 0.04;
    vec3 base = black + vec3(pressure * (0.25 + vignette * 0.75));
    base = mix(base, cream * (0.12 + vignette * 0.18), uCream * 0.45);
    base += blood * uBlood * vignette * (0.08 + uSub * 0.12);
    float grain = hash(gl_FragCoord.xy + uTime * 19.0) * 0.028;
    gl_FragColor = vec4(base + grain, 1.0);
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uWall;
  uniform float uOpacity;
  uniform float uVariant;
  uniform float uSub;
  uniform float uLowMid;
  uniform float uHigh;
  uniform float uAspect;
  uniform float uCream;
  uniform float uBlood;
  varying vec2 vUv;

  mat2 rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float stripe(float v, float width) {
    return 1.0 - smoothstep(width, width + 0.055, abs(sin(v)));
  }

  vec4 atlasSample(vec2 uv, float frame) {
    float cols = 10.0;
    float rows = 8.0;
    float x = mod(frame, cols);
    float y = floor(frame / cols);
    vec2 cell = vec2(x, y);
    vec2 atlasUv = (fract(uv) + cell) / vec2(cols, rows);
    atlasUv.y = 1.0 - atlasUv.y;
    return texture2D(uMap, atlasUv);
  }

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;
    float r = length(p * vec2(1.02, 1.18));
    float a = atan(p.y, p.x);
    float vignette = 1.0 - smoothstep(0.54, 1.08, r);
    float outer = smoothstep(0.36, 0.86, r);
    float frame = floor(mod(uTime * (3.0 + uLowMid * 8.0 + uSub * 3.5), 79.0));
    vec2 tunnelUv = rot(uTime * (0.018 + uLowMid * 0.05)) * p;
    tunnelUv = tunnelUv / max(0.28, 0.86 - uSub * 0.05) + 0.5;
    vec4 sampleA = atlasSample(tunnelUv, frame);
    vec4 sampleB = atlasSample(tunnelUv * (1.0 + uLowMid * 0.2) + vec2(0.13, -0.09), mod(frame + 17.0, 79.0));
    float texLum = dot(mix(sampleA.rgb, sampleB.rgb, 0.42), vec3(0.299, 0.587, 0.114));
    float texLine = smoothstep(0.23 - uLowMid * 0.08, 0.72, texLum);
    float grain = hash(gl_FragCoord.xy + uTime * 29.0);

    float v = floor(uVariant + 0.5);
    float line = 0.0;
    float alpha = 0.0;
    float bloodMix = uBlood * 0.2;
    float boneBoost = uCream * 0.12;

    if (v < 0.5) {
      // SLATE: almost-empty black plate, scanner scratches, logo should own the room.
      float scar = max(stripe(p.y * 42.0 + uTime * 0.16, 0.018), stripe((p.x + p.y * 0.12) * 19.0, 0.014));
      float slab = 1.0 - smoothstep(0.16, 0.68, abs(p.x + sin(p.y * 7.0 + uTime * 0.08) * 0.03));
      line = scar * 0.38 + slab * 0.16 + grain * 0.1;
      alpha = (0.18 + line * 0.38) * vignette;
      bloodMix = uBlood * 0.24;
    } else if (v < 1.5) {
      // APPROACH: crooked cathedral/PCB architecture.
      float columns = stripe(p.x * 19.0 + sin(p.y * 6.0) * 0.9, 0.028);
      float diagonals = stripe((p.x * 0.76 + p.y * 1.25) * 23.0 - uTime * 0.08, 0.022);
      float arch = stripe(r * 25.0 - 1.6 + sin(a * 4.0) * 0.35, 0.032);
      line = max(columns * 0.72, max(diagonals * 0.38, arch * 0.55));
      alpha = (0.25 + line * 0.62) * (0.5 + vignette * 0.7);
      boneBoost = 0.18 + uCream * 0.32;
      bloodMix = uBlood * outer * 0.28;
    } else if (v < 2.5) {
      // ICON: radial halo chamber around Heidi, less wallpaper, more iconography.
      float spokes = stripe(a * 10.0 + sin(r * 12.0), 0.04);
      float rings = stripe(r * 38.0 - uTime * 0.11, 0.025);
      float iris = 1.0 - smoothstep(0.08, 0.34, abs(r - 0.34));
      line = max(rings * 0.56, spokes * 0.42) + iris * 0.24;
      alpha = (0.24 + line * 0.58) * (0.42 + vignette * 0.8);
      boneBoost = 0.28 + uCream * 0.36;
      bloodMix = uBlood * 0.22 + iris * 0.16;
    } else if (v < 3.5) {
      // TUNNEL: the explicit moire/op-art engine.
      float squeeze = 1.0 - smoothstep(0.16, 0.72, r);
      line = texLine * (0.75 + squeeze * 0.5);
      alpha = (0.32 + line * 0.68) * (0.58 + vignette * 0.6);
      bloodMix = uBlood * (0.22 + outer * 0.42);
    } else if (v < 4.5) {
      // APPARITION: vertical ghost curtains / spectral scan, not the tunnel.
      vec2 q = rot(-0.32) * p;
      float curtains = stripe(q.x * 34.0 + sin(q.y * 11.0 + uTime * 0.17) * 1.4, 0.026);
      float melt = stripe((q.y + texLum * 0.28) * 18.0 - uTime * 0.12, 0.03);
      float ghost = smoothstep(0.62, 0.96, texLum) * (1.0 - smoothstep(0.24, 0.82, r));
      line = max(curtains * 0.52, melt * 0.38) + ghost * 0.48;
      alpha = (0.16 + line * 0.64) * (0.35 + vignette * 0.8);
      bloodMix = uBlood * 0.38 + ghost * 0.12;
      boneBoost = uCream * 0.08;
    } else if (v < 5.5) {
      // STATIONS: stamp field / paw-and-relic stage; blockier and more frontal.
      vec2 q = rot(0.72) * p;
      float stampGrid = max(stripe(q.x * 12.0, 0.038), stripe(q.y * 12.0, 0.038));
      float brokenCircle = stripe(length(fract(q * 2.35) - 0.5) * 18.0 - uTime * 0.06, 0.034);
      float floorBand = 1.0 - smoothstep(0.08, 0.42, abs(p.y + 0.28));
      line = max(stampGrid * 0.48, brokenCircle * 0.72) + floorBand * 0.22;
      alpha = (0.28 + line * 0.66) * (0.46 + vignette * 0.7);
      bloodMix = 0.28 + uBlood * 0.46;
      boneBoost = 0.12 + uCream * 0.16;
    } else {
      // BENEDICTION: minimal black signal with diamond/eye residue for the spinning logo scene.
      vec2 q = rot(0.78 + uTime * 0.025) * p;
      float diamonds = stripe((abs(q.x) + abs(q.y)) * 24.0, 0.026);
      float scan = stripe((p.y + sin(p.x * 7.0) * 0.03) * 30.0, 0.016);
      float eye = 1.0 - smoothstep(0.08, 0.5, length(p * vec2(1.75, 0.7)));
      line = diamonds * 0.46 + scan * 0.26 + eye * 0.24;
      alpha = (0.16 + line * 0.5) * vignette;
      bloodMix = uBlood * 0.22;
      boneBoost = 0.1;
    }

    vec3 bone = vec3(0.92, 0.86, 0.74);
    vec3 blood = vec3(0.68, 0.05, 0.04);
    vec3 ink = vec3(0.01, 0.008, 0.006);
    vec3 color = mix(ink, bone, clamp(line + boneBoost, 0.0, 1.0));
    color = mix(color, blood, clamp(bloodMix + uSub * 0.08 + uHigh * 0.03, 0.0, 0.74));
    color += grain * 0.025;
    float finalAlpha = clamp(alpha * uOpacity * (0.72 + uWall * 0.55 + uLowMid * 0.12), 0.0, 0.92);
    gl_FragColor = vec4(color, finalAlpha);
  }
`;

const HEIDI_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uIcon;
  uniform float uVoid;
  uniform float uCream;
  uniform float uBlood;
  uniform float uHigh;
  uniform float uTime;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453123);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p * vec2(1.0, 1.48));
    float mask = 1.0 - smoothstep(0.52, 0.79, r);
    float edge = smoothstep(0.45, 0.70, r) * (1.0 - smoothstep(0.70, 0.83, r));
    vec4 tex = texture2D(uMap, vUv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bone = vec3(0.92, 0.86, 0.74);
    vec3 blood = vec3(0.55, 0.035, 0.032);
    vec3 color = mix(tex.rgb, vec3(lum) * bone, 0.18 + uVoid * 0.12);
    color = mix(color, bone, uCream * 0.08);
    color = (color - 0.5) * 1.18 + 0.5;
    color = color * 1.18 + bone * 0.06;
    color += blood * edge * uBlood * (0.28 + uHigh * 0.34);
    color += hash(gl_FragCoord.xy + uTime * 3.0) * 0.018;
    gl_FragColor = vec4(color, mask * uIcon);
  }
`;

const SPRITE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFrameCount;
  uniform float uRows;
  uniform float uHigh;
  varying vec2 vUv;

  vec4 atlasSample(vec2 uv, float frame) {
    float cols = 10.0;
    float x = mod(frame, cols);
    float y = floor(frame / cols);
    vec2 cell = vec2(x, y);
    vec2 atlasUv = (uv + cell) / vec2(cols, uRows);
    atlasUv.y = 1.0 - atlasUv.y;
    return texture2D(uMap, atlasUv);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float mask = 1.0 - smoothstep(0.42, 0.72, length(p * vec2(1.0, 1.0)));
    float frame = floor(mod(uTime * (5.0 + uHigh * 9.0), uFrameCount));
    vec4 tex = atlasSample(vUv, frame);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bone = vec3(0.92, 0.86, 0.74);
    float alpha = smoothstep(0.18, 0.86, lum) * mask * uOpacity;
    gl_FragColor = vec4(bone * (0.45 + lum * 0.85), alpha);
  }
`;

const MASKED_TEXTURE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uUseAlpha;
  uniform float uBone;
  uniform float uBlood;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float radial = 1.0 - smoothstep(0.42, 0.72, length(p * vec2(1.0, 1.0)));
    vec4 tex = texture2D(uMap, vUv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 bone = vec3(0.92, 0.86, 0.74);
    vec3 blood = vec3(0.62, 0.045, 0.035);
    vec3 color = mix(tex.rgb, vec3(lum) * bone, uBone);
    color = mix(color, blood, uBlood * (1.0 - lum) * 0.45);
    float alphaSource = mix(radial, tex.a, uUseAlpha);
    gl_FragColor = vec4(color, alphaSource * uOpacity);
  }
`;

const REFERENCE_FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uMode;
  uniform float uHigh;
  uniform float uPulse;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(41.7, 289.3))) * 43758.5453123);
  }

  void main() {
    vec2 p = vUv - 0.5;
    float radius = length(p * vec2(1.12, 1.0));
    float softEdge = 1.0 - smoothstep(0.52, 0.78, radius);
    vec4 tex = texture2D(uMap, vUv);
    float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
    float scan = 0.84 + sin((vUv.y + uTime * 0.012) * 980.0) * 0.08;
    float grain = hash(gl_FragCoord.xy + uTime * 11.0) * 0.035;
    vec3 bone = vec3(0.93, 0.87, 0.73);
    vec3 blood = vec3(0.66, 0.035, 0.026);
    vec3 ink = vec3(0.006, 0.005, 0.004);
    vec3 color = bone;
    float alpha = 0.0;

    if (uMode < 0.5) {
      // Old CRT schematic: visible blinking diagnostic plate.
      float stutter = step(0.9, hash(vec2(floor(uTime * 6.0), floor(vUv.y * 15.0))));
      float blackout = 1.0 - stutter * 0.42;
      float blink = (step(0.0, sin(uTime * 6.2)) * 0.65 + 0.35 + uPulse * 0.18) * blackout;
      float lines = smoothstep(0.06, 0.58, lum);
      color = mix(ink, tex.rgb * 1.08, lines);
      color = mix(color, bone, smoothstep(0.74, 0.98, lum) * 0.12);
      color = mix(color, blood, smoothstep(0.48, 0.92, tex.r - tex.g) * 0.34 + uHigh * 0.08);
      alpha = clamp((smoothstep(0.035, 0.46, lum) * 0.92 + smoothstep(0.5, 0.92, lum) * 0.18) * softEdge * blink * uOpacity, 0.0, 0.94);
    } else if (uMode < 1.5) {
      // Neural/node map: keep sparse accent colors but degrade them into the material.
      float lines = smoothstep(0.05, 0.52, lum);
      color = mix(ink, tex.rgb * 0.92 + bone * 0.32, lines);
      color = mix(color, blood, smoothstep(0.42, 0.88, tex.r - tex.g) * 0.26);
      alpha = clamp((lines * 0.92 + smoothstep(0.34, 0.82, lum) * 0.26) * softEdge * uOpacity * (0.88 + uHigh * 0.3 + uPulse * 0.12), 0.0, 0.92);
    } else {
      // 1994 cybermap: keep the ridiculous color-map read, but make it a shrine relic.
      float mapInk = smoothstep(0.06, 0.62, lum);
      color = tex.rgb * (0.58 + mapInk * 0.56) + bone * 0.04;
      color = mix(color, blood, (1.0 - lum) * 0.08);
      alpha = smoothstep(0.05, 0.82, lum) * softEdge * uOpacity * (0.82 + sin(uTime * 0.9) * 0.08);
    }

    gl_FragColor = vec4(color * scan + grain, clamp(alpha, 0.0, 0.86));
  }
`;


function emptyRuntime(): RuntimeState {
  return {
    time: 0,
    frame: INITIAL_FRAME,
    weights: RITE_PHASES[0].weights,
    phaseIndex: 0,
    previousPhaseIndex: 0,
    phaseMix: RITE_PHASES.map((_, index) => (index === 0 ? 1 : 0)),
    phaseElapsedMs: 0,
    transitionProgress: 1,
    cameraDepth: RITE_PHASES[0].cameraDepth,
    cameraOrbit: RITE_PHASES[0].cameraOrbit,
    onsetPulse: 0,
  };
}

export default function HeidiRiteVisualizer({ audio }: HeidiRiteVisualizerProps) {
  return (
    <div className="heidi-rite-stage" data-rite-contract="vespers-for-heidi local-assets slow-3d-perspective no-ui no-ascii">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 8], zoom: 120, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <Suspense fallback={null}>
          <RiteScene audio={audio} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function RiteScene({ audio }: HeidiRiteVisualizerProps) {
  const runtimeRef = useRef<RuntimeState>(emptyRuntime());
  const phaseClockRef = useRef(new PhaseClock());
  const chamberRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPhase = Number(params.get('phase'));
    const requestedAge = Number(params.get('ageMs') ?? params.get('age') ?? 0);
    if (Number.isFinite(requestedPhase) && requestedPhase >= 0) {
      phaseClockRef.current.jump(Math.floor(requestedPhase) % RITE_PHASES.length, Number.isFinite(requestedAge) ? requestedAge : 0);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === ']') phaseClockRef.current.step(1);
      if (event.key === '[') phaseClockRef.current.step(-1);
      if (event.key === '\\') phaseClockRef.current.reset();
      const phaseKey = Number(event.key);
      if (Number.isInteger(phaseKey) && phaseKey >= 1 && phaseKey <= RITE_PHASES.length) {
        phaseClockRef.current.jump(phaseKey - 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const frame = audio.getReactiveState(time);
    const snapshot = phaseClockRef.current.tick(frame.lowMid + frame.impulse * 0.55);
    const from = RITE_PHASES[snapshot.previousPhaseIndex];
    const to = RITE_PHASES[snapshot.phaseIndex];
    const weights = mixWeights(from.weights, to.weights, snapshot.transitionProgress);
    const onsetPulse = frame.onset ? 1 : runtimeRef.current.onsetPulse * 0.86;
    const phaseMix = RITE_PHASES.map((_, index) => {
      let presence = 0;
      if (index === snapshot.previousPhaseIndex) presence += 1 - snapshot.transitionProgress;
      if (index === snapshot.phaseIndex) presence += snapshot.transitionProgress;
      return clamp(presence, 0, 1);
    });

    runtimeRef.current = {
      time,
      frame,
      weights,
      phaseIndex: snapshot.phaseIndex,
      previousPhaseIndex: snapshot.previousPhaseIndex,
      phaseMix,
      phaseElapsedMs: snapshot.phaseElapsedMs,
      transitionProgress: snapshot.transitionProgress,
      cameraDepth: from.cameraDepth + (to.cameraDepth - from.cameraDepth) * snapshot.transitionProgress,
      cameraOrbit: from.cameraOrbit + (to.cameraOrbit - from.cameraOrbit) * snapshot.transitionProgress,
      onsetPulse,
    };

    if (chamberRef.current) {
      const previousPose = SCENE_POSES[snapshot.previousPhaseIndex] ?? SCENE_POSES[0];
      const nextPose = SCENE_POSES[snapshot.phaseIndex] ?? SCENE_POSES[0];
      const pose = mixPose(previousPose, nextPose, snapshot.transitionProgress);
      const phase = RITE_PHASES[snapshot.phaseIndex];
      const sectionTurn = smoothstep(0, 1, Math.min(1, snapshot.phaseElapsedMs / phase.minMs));
      const depth = runtimeRef.current.cameraDepth;
      const breathing = frame.sub * 0.018 + frame.lowMid * 0.012;
      chamberRef.current.rotation.x = pose.x + Math.sin(time * 0.019) * 0.018 + breathing;
      chamberRef.current.rotation.y = pose.y + (sectionTurn - 0.5) * 0.34 + Math.cos(time * 0.017) * 0.024;
      chamberRef.current.rotation.z = pose.z + Math.sin(time * 0.013) * 0.018 + frame.high * 0.025;
      chamberRef.current.position.set(pose.shiftX, pose.shiftY, -depth * 0.92);
      chamberRef.current.scale.setScalar(pose.scale + depth * 0.045 + frame.lowMid * 0.018);
    }
  }, -100);

  return (
    <>
      <color attach="background" args={['#030201']} />
      <ambientLight intensity={0.55} color="#f2ebdc" />
      <group ref={chamberRef}>
        <VoidPlane runtime={runtimeRef} />
        <WallPortal runtime={runtimeRef} />
        <SceneReferences runtime={runtimeRef} />
        <IconStack runtime={runtimeRef} />
      </group>
    </>
  );
}

function VoidPlane({ runtime }: { runtime: RuntimeRef }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSub: { value: 0 },
      uVoid: { value: 1 },
      uCream: { value: 0 },
      uBlood: { value: 0 },
      uImpulse: { value: 0 },
    }),
    [],
  );

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.time;
    materialRef.current.uniforms.uSub.value = state.frame.sub;
    materialRef.current.uniforms.uVoid.value = state.weights.void;
    materialRef.current.uniforms.uCream.value = state.weights.cream;
    materialRef.current.uniforms.uBlood.value = state.weights.blood;
    materialRef.current.uniforms.uImpulse.value = state.frame.impulse;
  });

  return (
    <mesh position={[0, 0, -3]} scale={[viewport.width * 1.08, viewport.height * 1.08, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial ref={materialRef} args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: VOID_FRAGMENT }]} />
    </mesh>
  );
}

function WallPortal({ runtime }: { runtime: RuntimeRef }) {
  return (
    <group>
      {WALL_LAYER_CONFIGS.map((config) => (
        <WallLayer key={`wall-${config.variant}`} runtime={runtime} config={config} />
      ))}
    </group>
  );
}

function WallLayer({ runtime, config }: { runtime: RuntimeRef; config: WallLayerConfig }) {
  const texture = useTexture(`${BASE}pattern-opart-sheet.png`);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uTime: { value: 0 },
      uWall: { value: 0 },
      uOpacity: { value: 0 },
      uVariant: { value: config.variant },
      uSub: { value: 0 },
      uLowMid: { value: 0 },
      uHigh: { value: 0 },
      uAspect: { value: 1 },
      uCream: { value: 0 },
      uBlood: { value: 0 },
    }),
    [texture, config.variant],
  );

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const presence = state.phaseMix[config.variant] ?? 0;
    const phaseFloor = presence > 0.01 ? 0.0 : state.weights.wall * 0.018;
    const opacity = clamp((phaseFloor + presence * config.opacity) * (0.52 + state.weights.wall * 0.62 + state.frame.lowMid * 0.1), 0, 0.94);
    materialRef.current.uniforms.uTime.value = state.time;
    materialRef.current.uniforms.uWall.value = state.weights.wall;
    materialRef.current.uniforms.uOpacity.value = opacity;
    materialRef.current.uniforms.uVariant.value = config.variant;
    materialRef.current.uniforms.uSub.value = state.frame.sub;
    materialRef.current.uniforms.uLowMid.value = state.frame.lowMid;
    materialRef.current.uniforms.uHigh.value = state.frame.high;
    materialRef.current.uniforms.uAspect.value = viewport.width / viewport.height;
    materialRef.current.uniforms.uCream.value = state.weights.cream;
    materialRef.current.uniforms.uBlood.value = state.weights.blood;
    if (meshRef.current) {
      meshRef.current.rotation.z = config.rotation + Math.sin(state.time * (0.018 + config.variant * 0.002)) * 0.024 + state.frame.lowMid * 0.018;
      meshRef.current.rotation.x = Math.sin(state.time * 0.011 + config.variant) * 0.035 * presence;
      meshRef.current.rotation.y = Math.cos(state.time * 0.013 + config.variant) * 0.05 * presence;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0.04, config.z]} scale={[viewport.width * config.scale, viewport.height * config.scale, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: WALL_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.NormalBlending }]}
      />
    </mesh>
  );
}

function SceneReferences({ runtime }: { runtime: RuntimeRef }) {
  return (
    <group>
      {REFERENCE_SCENES.map((config) => (
        <ReferencePlate key={config.src} runtime={runtime} config={config} />
      ))}
    </group>
  );
}

function ReferencePlate({ runtime, config }: { runtime: RuntimeRef; config: ReferenceSceneConfig }) {
  const texture = useTexture(config.src);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { viewport } = useThree();

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uMode: { value: config.mode },
      uHigh: { value: 0 },
      uPulse: { value: 0 },
    }),
    [texture, config.mode],
  );

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const presence = state.phaseMix[config.phase] ?? 0;
    const arrival = smoothstep(0, 18_000, state.phaseElapsedMs);
    const opacity = clamp(presence * arrival * config.opacity * (0.82 + state.frame.lowMid * 0.18) + state.onsetPulse * presence * 0.05, 0, 0.86);
    materialRef.current.uniforms.uTime.value = state.time;
    materialRef.current.uniforms.uOpacity.value = opacity;
    materialRef.current.uniforms.uHigh.value = state.frame.high;
    materialRef.current.uniforms.uPulse.value = state.onsetPulse;
    materialRef.current.uniforms.uMode.value = config.mode;
    if (meshRef.current) {
      meshRef.current.position.x = viewport.width * config.x + Math.sin(state.time * 0.021 + config.phase) * viewport.width * 0.012 * presence;
      meshRef.current.position.y = viewport.height * config.y + Math.cos(state.time * 0.018 + config.phase) * viewport.height * 0.008 * presence;
      meshRef.current.rotation.z = config.rotation + Math.sin(state.time * 0.016 + config.phase) * 0.018;
      meshRef.current.rotation.x = -0.08 * presence;
      meshRef.current.rotation.y = (config.phase === 6 ? 0.1 : -0.12) * presence;
      meshRef.current.visible = opacity > 0.01;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[viewport.width * config.x, viewport.height * config.y, config.z]}
      rotation={[0, 0, config.rotation]}
      scale={[viewport.width * config.width, viewport.height * config.height, 1]}
    >
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: REFERENCE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.NormalBlending }]}
      />
    </mesh>
  );
}

function IconStack({ runtime }: { runtime: RuntimeRef }) {
  const { viewport } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const iconWidth = Math.min(viewport.width * 0.68, viewport.height * 1.18);
  const iconHeight = iconWidth / ICON_ASPECT;
  const radius = iconHeight * 0.72;

  useFrame(() => {
    const state = runtime.current;
    if (!groupRef.current) return;
    const dolly = state.cameraDepth;
    const micro = Math.sin(state.time * 0.017) * 0.012;
    groupRef.current.position.set(0, viewport.height * 0.045, 0.18 + dolly * 0.22);
    groupRef.current.rotation.z = Math.sin(state.time * 0.009) * state.cameraOrbit * 0.55 + micro;
  });

  return (
    <group ref={groupRef}>
      <ApparitionLayer runtime={runtime} iconWidth={iconWidth * 0.84} />
      <PortalFrame runtime={runtime} radius={radius} />
      <HeidiPlate runtime={runtime} width={iconWidth} height={iconHeight} />
      <HaloRays runtime={runtime} radius={radius * 0.93} />
      <EyeOracle runtime={runtime} width={iconWidth * 0.34} />
      <Stations runtime={runtime} radius={radius} />
      <GirasolBookend runtime={runtime} radius={radius} />
    </group>
  );
}

function PortalFrame({ runtime, radius }: { runtime: RuntimeRef; radius: number }) {
  const arcs = useMemo(
    () => [
      { r: 0.99, tube: 0.021, start: 0.18, arc: 0.88, crimson: true },
      { r: 1.02, tube: 0.018, start: 1.42, arc: 0.64, crimson: true },
      { r: 0.97, tube: 0.025, start: 2.48, arc: 0.72, crimson: true },
      { r: 1.05, tube: 0.014, start: 3.62, arc: 1.05, crimson: true },
      { r: 0.91, tube: 0.008, start: 4.86, arc: 0.48, crimson: false },
      { r: 1.18, tube: 0.005, start: 0.92, arc: 0.58, crimson: false },
      { r: 1.13, tube: 0.006, start: 2.92, arc: 0.74, crimson: false },
      { r: 1.22, tube: 0.004, start: 4.44, arc: 0.66, crimson: false },
    ],
    [],
  );
  const materials = useMemo(
    () =>
      arcs.map(
        (arc) =>
          new THREE.MeshBasicMaterial({
            color: arc.crimson ? '#d82020' : '#f2ebdc',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [arcs],
  );
  const refs = useRef<THREE.Group[]>([]);

  useFrame(() => {
    const state = runtime.current;
    const pressure = state.frame.sub * 0.18 + state.onsetPulse * 0.08;
    materials.forEach((material, index) => {
      const arc = arcs[index];
      const flicker = Math.sin(state.time * (0.19 + index * 0.013) + index * 2.1) * 0.5 + 0.5;
      material.opacity = arc.crimson
        ? clamp((0.2 + state.weights.blood * 0.64 + pressure) * (0.54 + flicker * 0.28), 0, 0.88)
        : clamp(0.04 + state.weights.cream * 0.11 + state.frame.high * 0.1 + flicker * 0.035, 0, 0.26);
      const ref = refs.current[index];
      if (ref) ref.rotation.z = arc.start + Math.sin(state.time * 0.037 + index) * 0.025 + state.frame.lowMid * 0.018;
    });
  });

  return (
    <group position={[0, 0, -0.08]} scale={[1 + runtime.current.frame.sub * 0.01, 1 + runtime.current.frame.sub * 0.01, 1]}>
      {arcs.map((arc, index) => (
        <group key={`${arc.start}-${arc.arc}`} ref={(node) => { if (node) refs.current[index] = node; }}>
          <mesh material={materials[index]}>
            <torusGeometry args={[radius * arc.r, radius * arc.tube, 8, 72, arc.arc]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function HeidiPlate({ runtime, width, height }: { runtime: RuntimeRef; width: number; height: number }) {
  const texture = useTexture(`${BASE}heidi-halo-reference.png`);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uIcon: { value: 0 },
      uVoid: { value: 1 },
      uCream: { value: 0 },
      uBlood: { value: 0 },
      uHigh: { value: 0 },
      uTime: { value: 0 },
    }),
    [texture],
  );

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const silenceOpen = smoothstep(1400, 2600, state.frame.silenceMs);
    const phaseEye = state.weights.eye * 0.12;
    materialRef.current.uniforms.uTime.value = state.time;
    materialRef.current.uniforms.uIcon.value = clamp(state.weights.icon + phaseEye - silenceOpen * 0.08, 0, 1);
    materialRef.current.uniforms.uVoid.value = state.weights.void;
    materialRef.current.uniforms.uCream.value = state.weights.cream;
    materialRef.current.uniforms.uBlood.value = state.weights.blood;
    materialRef.current.uniforms.uHigh.value = state.frame.high;
  });

  return (
    <mesh position={[0, 0, 0.12]} scale={[width, height, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: HEIDI_FRAGMENT, transparent: true, depthWrite: false }]}
      />
    </mesh>
  );
}

function ApparitionLayer({ runtime, iconWidth }: { runtime: RuntimeRef; iconWidth: number }) {
  const texture = useTexture(`${BASE}spectral-apparition-sheet.png`);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uFrameCount: { value: 82 },
      uRows: { value: 9 },
      uHigh: { value: 0 },
    }),
    [texture],
  );

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.time * 0.72;
    materialRef.current.uniforms.uOpacity.value = clamp(state.weights.apparition * (0.46 + state.frame.high * 0.35 + state.onsetPulse * 0.18), 0, 0.62);
    materialRef.current.uniforms.uHigh.value = state.frame.high;
  });

  return (
    <mesh position={[0, -0.02, 0.04]} scale={[iconWidth, iconWidth, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: SPRITE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }]}
      />
    </mesh>
  );
}

function HaloRays({ runtime, radius }: { runtime: RuntimeRef; radius: number }) {
  const count = 9;
  const refs = useRef<THREE.Mesh[]>([]);
  const materials = useMemo(
    () =>
      Array.from({ length: count }, (_, i) =>
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? '#d82020' : '#f2ebdc',
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      ),
    [],
  );

  useFrame(() => {
    const state = runtime.current;
    for (let i = 0; i < count; i += 1) {
      const mesh = refs.current[i];
      const material = materials[i];
      if (!mesh || !material) continue;
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 19.17) * 0.32;
      const slow = Math.sin(state.time * (0.07 + (i % 7) * 0.006) + i * 1.7) * 0.5 + 0.5;
      const pulse = state.onsetPulse * (i % 9 === Math.floor(state.time * 1.7) % 9 ? 1 : 0.12);
      const length = radius * (0.18 + slow * 0.17 + state.frame.high * 0.26 + state.frame.sub * 0.06 + pulse * 0.2);
      const centerRadius = radius + length * 0.48;
      mesh.position.set(Math.cos(a) * centerRadius, Math.sin(a) * centerRadius, 0.06);
      mesh.rotation.z = a - Math.PI / 2;
      mesh.scale.set(1, length, 1);
      material.opacity = clamp(0.026 + state.weights.icon * 0.07 + state.frame.high * 0.12 + pulse * 0.2, 0, 0.32);
    }
  });

  return (
    <group>
      {materials.map((material, i) => (
        <mesh key={i} ref={(mesh) => { if (mesh) refs.current[i] = mesh; }} material={material}>
          <planeGeometry args={[0.008, 1]} />
        </mesh>
      ))}
    </group>
  );
}

function EyeOracle({ runtime, width }: { runtime: RuntimeRef; width: number }) {
  const texture = useTexture(`${BASE}heidi-eye.png`);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: 0 },
      uUseAlpha: { value: 0 },
      uBone: { value: 0.32 },
      uBlood: { value: 0.1 },
    }),
    [texture],
  );

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const silence = smoothstep(1400, 3200, state.frame.silenceMs);
    const finalPhase = state.phaseIndex === RITE_PHASES.length - 1 ? smoothstep(20_000, 75_000, state.phaseElapsedMs) : 0;
    materialRef.current.uniforms.uOpacity.value = clamp(state.weights.eye * 0.42 + silence * 0.7 + finalPhase * 0.8 + state.onsetPulse * 0.08, 0, 0.88);
  });

  return (
    <mesh position={[0, -0.02, 0.28]} scale={[width, width * 0.48, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: MASKED_TEXTURE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.NormalBlending }]}
      />
    </mesh>
  );
}

function Stations({ runtime, radius }: { runtime: RuntimeRef; radius: number }) {
  return (
    <group>
      <MaskedRelic runtime={runtime} src={`${BASE}snail-relic.png`} position={[-radius * 0.86, -radius * 0.66, 0.22]} scale={radius * 0.48} useAlpha opacityScale={0.72} bone={0.18} blood={0.16} />
      <MaskedRelic runtime={runtime} src={`${BASE}paw-sigil.png`} position={[radius * 0.76, -radius * 0.58, 0.34]} scale={radius * 0.82} useAlpha opacityScale={1.28} bone={0.03} blood={0.28} />
      <MaskedRelic runtime={runtime} src={`${BASE}paw-sigil.png`} position={[radius * 0.98, radius * 0.1, 0.26]} scale={radius * 0.5} useAlpha opacityScale={1.0} bone={0.05} blood={0.2} />
      <MaskedRelic runtime={runtime} src={`${BASE}paw-sigil.png`} position={[-radius * 0.46, radius * 0.72, 0.22]} scale={radius * 0.46} useAlpha opacityScale={0.9} bone={0.08} blood={0.14} />
    </group>
  );
}

function MaskedRelic({
  runtime,
  src,
  position,
  scale,
  useAlpha = false,
  opacityScale,
  bone,
  blood,
}: {
  runtime: RuntimeRef;
  src: string;
  position: [number, number, number];
  scale: number;
  useAlpha?: boolean;
  opacityScale: number;
  bone: number;
  blood: number;
}) {
  const texture = useTexture(src);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uMap: { value: texture },
      uOpacity: { value: 0 },
      uUseAlpha: { value: useAlpha ? 1 : 0 },
      uBone: { value: bone },
      uBlood: { value: blood },
    }),
    [texture, useAlpha, bone, blood],
  );

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }, [texture]);

  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const arrival = smoothstep(1_500, 12_000, state.phaseElapsedMs);
    const stamp = state.onsetPulse * state.weights.stations;
    materialRef.current.uniforms.uOpacity.value = clamp(state.weights.stations * opacityScale * arrival + stamp * 0.26, 0, 0.94);
    if (meshRef.current) {
      const pulseScale = 1 + stamp * 0.12 + state.frame.sub * 0.025;
      meshRef.current.scale.set(scale * pulseScale, scale * pulseScale, 1);
      meshRef.current.rotation.z = Math.sin(state.time * 0.04 + position[0]) * 0.045 + stamp * 0.08;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={[scale, scale, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: MASKED_TEXTURE_FRAGMENT, transparent: true, depthWrite: false }]}
      />
    </mesh>
  );
}

function GirasolBookend({ runtime, radius }: { runtime: RuntimeRef; radius: number }) {
  const { scene } = useGLTF(LOGO_SRC);
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const spinRingRefs = useRef<THREE.Mesh[]>([]);
  const spinRingMaterials = useMemo(
    () => [
      new THREE.MeshBasicMaterial({ color: '#f6e7bd', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: '#e12222', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
      new THREE.MeshBasicMaterial({ color: '#f6e7bd', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    ],
    [],
  );

  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    clone.position.sub(center);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    clone.scale.setScalar((radius * 2.25) / maxAxis);
    materialsRef.current = [];
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = new THREE.MeshBasicMaterial({ color: '#f7dfbd', transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.NormalBlending, side: THREE.DoubleSide });
        mesh.material = material;
        materialsRef.current.push(material);
      }
    });
    return clone;
  }, [scene, radius]);

  useFrame(() => {
    const state = runtime.current;
    const slate = state.phaseMix[0] ?? 0;
    const stations = state.phaseMix[5] ?? 0;
    const benediction = state.phaseMix[RITE_PHASES.length - 1] ?? 0;
    const bookendLock = smoothstep(0.12, 0.72, Math.max(slate, benediction));
    const stationLock = smoothstep(0.08, 0.72, stations) * (1 - bookendLock);
    const logoPresence = 0.32 + state.weights.logo * 0.58 + slate * 0.24 + stations * 0.24 + benediction * 0.32;
    const opacity = clamp(logoPresence + state.frame.high * 0.08 + state.onsetPulse * 0.08, 0.24, 0.96);
    if (groupRef.current) {
      const roamingX = -0.36 + Math.sin(state.time * 0.052) * 0.16;
      const roamingY = 0.83 + Math.cos(state.time * 0.043) * 0.07;
      const sideX = mix(roamingX, -0.22, stationLock);
      const sideY = mix(roamingY, 0.24, stationLock);
      const x = radius * mix(sideX, 0.0, bookendLock);
      const y = radius * mix(sideY, 0.08, bookendLock);
      groupRef.current.position.set(x, y, 0.86 + bookendLock * 0.26);
      groupRef.current.rotation.y = state.time * (1.42 + state.frame.lowMid * 0.8 + benediction * 0.55);
      groupRef.current.rotation.x = -0.42 + Math.sin(state.time * 0.11) * 0.12 + stations * 0.08;
      groupRef.current.rotation.z = Math.sin(state.time * 0.073) * 0.22 + state.onsetPulse * 0.08;
      const logoScale = 1 + stationLock * 0.62 + bookendLock * 0.68 + state.frame.sub * 0.04 + state.onsetPulse * 0.05;
      groupRef.current.scale.setScalar(logoScale);
      groupRef.current.visible = opacity > 0.01;
    }
    for (const material of materialsRef.current) material.opacity = opacity * 0.18;
    spinRingMaterials.forEach((material, index) => {
      material.opacity = clamp(opacity * (index === 1 ? 0.72 : 0.58) + state.onsetPulse * 0.1, 0, 0.96);
    });
    spinRingRefs.current.forEach((mesh, index) => {
      mesh.rotation.x = (index + 1) * 0.63 + state.time * (0.55 + index * 0.21);
      mesh.rotation.y = state.time * (0.82 + index * 0.18);
      mesh.rotation.z = state.time * (0.38 + index * 0.17);
      const s = 1 + Math.sin(state.time * (0.8 + index * 0.23)) * 0.04 + state.onsetPulse * 0.08;
      mesh.scale.setScalar(s);
    });
  });

  return (
    <group ref={groupRef} position={[-radius * 0.36, radius * 0.83, 0.68]}>
      <primitive object={prepared} />
      <mesh ref={(node) => { if (node) spinRingRefs.current[0] = node; }} material={spinRingMaterials[0]}>
        <torusGeometry args={[radius * 0.36, radius * 0.014, 8, 112]} />
      </mesh>
      <mesh ref={(node) => { if (node) spinRingRefs.current[1] = node; }} material={spinRingMaterials[1]} rotation={[Math.PI / 2.2, 0.2, 0.1]}>
        <torusGeometry args={[radius * 0.44, radius * 0.012, 8, 112]} />
      </mesh>
      <mesh ref={(node) => { if (node) spinRingRefs.current[2] = node; }} material={spinRingMaterials[2]} rotation={[0.2, Math.PI / 2.4, -0.15]}>
        <torusGeometry args={[radius * 0.28, radius * 0.01, 8, 96]} />
      </mesh>
    </group>
  );
}

useGLTF.preload(LOGO_SRC);
useTexture.preload(`${BASE}pattern-opart-sheet.png`);
useTexture.preload(`${BASE}spectral-apparition-sheet.png`);
useTexture.preload(`${BASE}heidi-halo-reference.png`);
useTexture.preload(`${BASE}heidi-eye.png`);
useTexture.preload(`${BASE}snail-relic.png`);
useTexture.preload(`${BASE}paw-sigil.png`);
useTexture.preload(`${BASE}scene-schematic-crt.png`);
useTexture.preload(`${BASE}scene-neural-map.png`);
useTexture.preload(`${BASE}scene-cybermap.png`);
