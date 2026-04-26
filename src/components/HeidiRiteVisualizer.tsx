import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { AudioEngine, AudioFrame } from '../lib/AudioEngine';
import { PhaseClock } from '../lib/PhaseClock';
import { RITE_PHASES, clamp, mixWeights, smoothstep } from '../lib/Liturgy';
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
    float r = length(p * vec2(1.05, 1.22));
    float portal = 1.0 - smoothstep(0.46, 0.74, r);
    float outer = smoothstep(0.22, 0.68, r);
    float frame = floor(mod(uTime * (4.0 + uLowMid * 9.0 + uSub * 5.0), 79.0));
    vec2 q = rot(uTime * (0.015 + uLowMid * 0.045)) * p;
    float zoom = mix(1.2, 0.62, uWall) - uSub * 0.05;
    q = q / max(0.28, zoom) + 0.5;
    vec4 sampleA = atlasSample(q, frame);
    vec4 sampleB = atlasSample(q * (1.0 + uLowMid * 0.18) + vec2(0.11, -0.07), mod(frame + 13.0, 79.0));
    float lum = dot(mix(sampleA.rgb, sampleB.rgb, 0.42), vec3(0.299, 0.587, 0.114));
    float line = smoothstep(0.22 - uLowMid * 0.08, 0.72, lum);
    vec3 bone = vec3(0.92, 0.86, 0.74);
    vec3 blood = vec3(0.68, 0.05, 0.04);
    vec3 ink = vec3(0.01, 0.008, 0.006);
    vec3 color = mix(ink, bone, line);
    color = mix(color, blood, uBlood * (0.18 + outer * 0.28));
    color = mix(color, bone, uCream * 0.16);
    float alpha = portal * uWall * (0.46 + uLowMid * 0.48 + uHigh * 0.18);
    alpha += smoothstep(0.54, 0.68, r) * (1.0 - smoothstep(0.68, 0.78, r)) * uBlood * 0.58;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
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

function emptyRuntime(): RuntimeState {
  return {
    time: 0,
    frame: INITIAL_FRAME,
    weights: RITE_PHASES[0].weights,
    phaseIndex: 0,
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

    runtimeRef.current = {
      time,
      frame,
      weights,
      phaseIndex: snapshot.phaseIndex,
      phaseElapsedMs: snapshot.phaseElapsedMs,
      transitionProgress: snapshot.transitionProgress,
      cameraDepth: from.cameraDepth + (to.cameraDepth - from.cameraDepth) * snapshot.transitionProgress,
      cameraOrbit: from.cameraOrbit + (to.cameraOrbit - from.cameraOrbit) * snapshot.transitionProgress,
      onsetPulse,
    };

    if (chamberRef.current) {
      const orbit = runtimeRef.current.cameraOrbit;
      const depth = runtimeRef.current.cameraDepth;
      chamberRef.current.rotation.x = Math.sin(time * 0.011) * orbit + depth * 0.018;
      chamberRef.current.rotation.y = Math.cos(time * 0.013) * orbit;
      chamberRef.current.position.z = -depth * 0.85;
      chamberRef.current.scale.setScalar(1 + depth * 0.035 + frame.lowMid * 0.01);
    }
  }, -100);

  return (
    <>
      <color attach="background" args={['#030201']} />
      <ambientLight intensity={0.55} color="#f2ebdc" />
      <group ref={chamberRef}>
        <VoidPlane runtime={runtimeRef} />
        <WallPortal runtime={runtimeRef} />
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
  const texture = useTexture(`${BASE}pattern-opart-sheet.png`);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
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
      uSub: { value: 0 },
      uLowMid: { value: 0 },
      uHigh: { value: 0 },
      uAspect: { value: 1 },
      uCream: { value: 0 },
      uBlood: { value: 0 },
    }),
    [texture],
  );

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    materialRef.current.uniforms.uTime.value = state.time;
    materialRef.current.uniforms.uWall.value = state.weights.wall;
    materialRef.current.uniforms.uSub.value = state.frame.sub;
    materialRef.current.uniforms.uLowMid.value = state.frame.lowMid;
    materialRef.current.uniforms.uHigh.value = state.frame.high;
    materialRef.current.uniforms.uAspect.value = viewport.width / viewport.height;
    materialRef.current.uniforms.uCream.value = state.weights.cream;
    materialRef.current.uniforms.uBlood.value = state.weights.blood;
  });

  return (
    <mesh position={[0, 0.04, -1.55]} scale={[viewport.width * 0.98, viewport.height * 0.98, 1]}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial
        ref={materialRef}
        args={[{ uniforms, vertexShader: VERTEX_SHADER, fragmentShader: WALL_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.NormalBlending }]}
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
  const count = 31;
  const refs = useRef<THREE.Mesh[]>([]);
  const materials = useMemo(
    () =>
      Array.from({ length: count }, () =>
        new THREE.MeshBasicMaterial({ color: '#f2ebdc', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }),
      ),
    [],
  );

  useFrame(() => {
    const state = runtime.current;
    for (let i = 0; i < count; i += 1) {
      const mesh = refs.current[i];
      const material = materials[i];
      if (!mesh || !material) continue;
      const a = (i / count) * Math.PI * 2;
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
      <MaskedRelic runtime={runtime} src={`${BASE}snail-relic.png`} position={[-radius * 0.78, -radius * 0.7, 0.24]} scale={radius * 0.5} useAlpha opacityScale={0.86} bone={0.18} blood={0.18} />
      <MaskedRelic runtime={runtime} src={`${BASE}paw-sigil.png`} position={[radius * 0.86, -radius * 0.68, 0.24]} scale={radius * 0.44} useAlpha opacityScale={0.76} bone={0.08} blood={0.08} />
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

  useFrame(() => {
    const state = runtime.current;
    if (!materialRef.current) return;
    const arrival = smoothstep(6_000, 45_000, state.phaseElapsedMs);
    materialRef.current.uniforms.uOpacity.value = clamp(state.weights.stations * opacityScale * arrival + state.onsetPulse * 0.08, 0, 0.72);
  });

  return (
    <mesh position={position} scale={[scale, scale, 1]}>
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

  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    clone.position.sub(center);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    clone.scale.setScalar((radius * 0.82) / maxAxis);
    materialsRef.current = [];
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = new THREE.MeshBasicMaterial({ color: '#f2ebdc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
        mesh.material = material;
        materialsRef.current.push(material);
      }
    });
    return clone;
  }, [scene, radius]);

  useFrame(() => {
    const state = runtime.current;
    const firstBookend = state.phaseIndex === 0 ? 1 - smoothstep(8_000, 24_000, state.phaseElapsedMs) : 0;
    const finalBookend = state.phaseIndex === RITE_PHASES.length - 1 ? smoothstep(45_000, 100_000, state.phaseElapsedMs) : 0;
    const opacity = clamp(state.weights.logo * Math.max(firstBookend, finalBookend), 0, 0.62);
    if (groupRef.current) {
      groupRef.current.rotation.y = state.time * (0.08 + finalBookend * 0.22);
      groupRef.current.rotation.x = -0.2 + Math.sin(state.time * 0.07) * 0.04;
      groupRef.current.visible = opacity > 0.01;
    }
    for (const material of materialsRef.current) material.opacity = opacity;
  });

  return (
    <group ref={groupRef} position={[0, radius * 1.22, 0.3]}>
      <primitive object={prepared} />
    </group>
  );
}

useGLTF.preload(LOGO_SRC);
useTexture.preload(`${BASE}pattern-opart-sheet.png`);
useTexture.preload(`${BASE}spectral-apparition-sheet.png`);
useTexture.preload(`${BASE}heidi-halo-reference.png`);
useTexture.preload(`${BASE}heidi-eye.png`);
useTexture.preload(`${BASE}snail-relic.png`);
useTexture.preload(`${BASE}paw-frame.png`);
