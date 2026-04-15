import { Environment } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { MutableRefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AudioEngine, ReactiveState } from '../lib/AudioEngine';

const vertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uFlow;
uniform float uShimmer;
uniform float uEnergy;
uniform float uImpulse;

vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 x) {
  float value = 0.0;
  float amplitude = 0.58;
  mat2 rot = mat2(cos(0.58), sin(0.58), -sin(0.58), cos(0.58));
  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(x);
    x = rot * x * 2.0 + vec2(100.0);
    amplitude *= 0.52;
  }
  return value;
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * 0.042;
  float slowT = uTime * 0.014;

  vec2 center = vec2(sin(slowT * 0.7) * 0.035, cos(slowT * 0.5) * 0.025);
  vec2 pc = p - center;

  vec2 shaped = pc * vec2(0.88, 1.12);
  float r = length(shaped);
  float theta = atan(pc.y, pc.x);

  float breathe = 1.0 + uBass * 0.1 + uImpulse * 0.06;

  vec2 q = pc * 1.6;
  q += vec2(sin(slowT * 1.1), cos(slowT * 0.8)) * 0.12;

  vec2 warp1 = vec2(
    fbm(q + vec2(t * 0.1, t * 0.07)),
    fbm(q + vec2(-t * 0.08, t * 0.09) + 5.2)
  );

  vec2 warp2 = vec2(
    fbm(q + warp1 * 1.5 + vec2(t * 0.05, -t * 0.03) + 1.7),
    fbm(q + warp1 * 1.3 + vec2(-t * 0.04, t * 0.06) + 8.3)
  );

  vec2 warped = q + warp2 * (0.6 + uFlow * 0.12);
  float warpedR = length(warped * vec2(0.9, 1.1)) / breathe;

  float coreBloom = smoothstep(0.85, 0.0, warpedR);
  float midBloom = smoothstep(1.35, 0.15, warpedR);
  float outerBloom = smoothstep(1.9, 0.35, warpedR);
  float haze = smoothstep(2.6, 0.5, warpedR) * 0.25;

  float petalWarp = fbm(pc * 2.8 + vec2(t * 0.08));
  float petalTheta = theta + petalWarp * 0.7;

  float petals = 0.0;
  petals += sin(petalTheta * 5.0 + t * 0.18) * 0.28;
  petals += sin(petalTheta * 3.0 - t * 0.12 + 1.5) * 0.22;
  petals += sin(petalTheta * 8.0 + t * 0.08 + 3.0) * 0.1;
  petals += sin(petalTheta * 2.0 - t * 0.06 + 0.7) * 0.14;
  petals = petals * 0.5 + 0.5;

  float petalMask = smoothstep(1.4, 0.12, warpedR) * smoothstep(0.0, 0.2, warpedR);
  float petalIntensity = petals * petalMask;

  float veins = abs(sin(petalTheta * 13.0 + r * 10.0 + warp1.x * 3.5 + t * 0.25));
  veins = smoothstep(0.5, 0.92, veins) * petalMask * 0.5;

  float silk = fbm(warped * 2.0 + warp1 * 0.8 + vec2(t * 0.06, -t * 0.04));
  silk = smoothstep(-0.3, 0.8, silk) * midBloom;

  vec2 stippleUV = pc * 32.0 + warp1 * 2.5 + vec2(t * 0.4, -t * 0.25);
  float stipple = hash21(floor(stippleUV));
  float stippleThresh = 0.89 - uShimmer * 0.05 - uImpulse * 0.03;
  float stippleDots = smoothstep(stippleThresh, stippleThresh + 0.015, stipple);
  stippleDots *= smoothstep(2.0, 0.25, r) * smoothstep(0.0, 0.12, r);

  vec2 dustUV = pc * 14.0 + warp2 * 1.2 + vec2(-t * 0.15, t * 0.12);
  float dust = hash21(floor(dustUV));
  float dustDots = smoothstep(0.93, 0.95, dust) * smoothstep(2.3, 0.4, r);

  float apparition = exp(-warpedR * warpedR * 2.2);
  float coreShift = fbm(pc * 2.2 + vec2(t * 0.12, -t * 0.08));
  apparition *= (0.65 + coreShift * 0.35);

  vec3 voidColor = vec3(0.022, 0.01, 0.025);
  vec3 deepPurple = vec3(0.07, 0.02, 0.055);
  vec3 darkRose = vec3(0.16, 0.045, 0.08);
  vec3 dustyMauve = vec3(0.3, 0.13, 0.19);
  vec3 paleRose = vec3(0.52, 0.31, 0.36);
  vec3 cream = vec3(0.9, 0.83, 0.76);
  vec3 warmWhite = vec3(0.95, 0.9, 0.83);

  float warmth = 0.5 + 0.5 * sin(slowT * 0.55 + 1.0);
  vec3 tintedMauve = mix(dustyMauve, vec3(0.26, 0.11, 0.22), warmth);
  vec3 tintedRose = mix(paleRose, vec3(0.48, 0.26, 0.33), warmth);

  vec3 color = voidColor;
  color = mix(color, deepPurple, haze);
  color = mix(color, darkRose, outerBloom * 0.45);
  color = mix(color, tintedMauve, midBloom * 0.5 + silk * 0.15);
  color = mix(color, tintedRose, coreBloom * 0.4 + petalIntensity * 0.18);
  color = mix(color, cream, apparition * 0.35);
  color = mix(color, warmWhite, apparition * coreBloom * 0.18);

  color += tintedRose * veins * 0.12;

  color += cream * stippleDots * 0.18;
  color += paleRose * dustDots * 0.12;

  float shimmerNoise = snoise(warped * 3.0 + t * 1.5) * 0.5 + 0.5;
  float shimmerMask = veins * smoothstep(0.35, 0.8, shimmerNoise);
  color += warmWhite * shimmerMask * (0.06 + uShimmer * 0.2 + uImpulse * 0.12);

  float centerGlow = exp(-r * r * 0.7);
  color += vec3(0.055, 0.018, 0.035) * centerGlow;

  float vignette = smoothstep(1.9, 0.4, r);
  color *= 0.25 + vignette * 0.75;

  float grain = fract(sin(dot(uv + vec2(uTime * 0.0017, -uTime * 0.0011), vec2(12.9898, 78.233))) * 43758.5453);
  color -= grain * 0.02;

  color = max(color, 0.0);
  color = pow(color, vec3(0.97));
  color = smoothstep(vec3(0.012), vec3(1.0), color);

  gl_FragColor = vec4(color, 1.0);
}
`;

type VisualizerProps = {
  audio: AudioEngine;
  onReactiveState: (state: ReactiveState) => void;
};

function BackgroundPlane({ audio, onReactiveState, reactiveRef }: VisualizerProps & { reactiveRef: MutableRefObject<ReactiveState> }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const lastUiSyncRef = useRef(0);
  const { viewport, size } = useThree();

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uTime: { value: 0 },
      uBass: { value: 0.2 },
      uFlow: { value: 0.2 },
      uShimmer: { value: 0.12 },
      uEnergy: { value: 0.2 },
      uImpulse: { value: 0 },
    }),
    [size.height, size.width],
  );

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [size.height, size.width, uniforms]);

  useFrame((state) => {
    const reactive = audio.getReactiveState(state.clock.elapsedTime);
    reactiveRef.current = reactive;

    if (state.clock.elapsedTime - lastUiSyncRef.current > 0.12) {
      onReactiveState(reactive);
      lastUiSyncRef.current = state.clock.elapsedTime;
    }

    if (!materialRef.current) return;

    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uBass.value = reactive.bass;
    materialRef.current.uniforms.uFlow.value = reactive.flow;
    materialRef.current.uniforms.uShimmer.value = reactive.shimmer;
    materialRef.current.uniforms.uEnergy.value = reactive.energy;
    materialRef.current.uniforms.uImpulse.value = reactive.impulse;
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial ref={materialRef} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} depthWrite={false} />
    </mesh>
  );
}

function DustParticles({ reactiveRef }: { reactiveRef: MutableRefObject<ReactiveState> }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = 800;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 1.2) * 2.3;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2.8;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color('#ddb8c8'),
      size: 0.02,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    mat.toneMapped = false;
    return mat;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const reactive = reactiveRef.current;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.006;
    pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.004) * 0.03;
    material.opacity = 0.1 + reactive.shimmer * 0.15 + reactive.impulse * 0.08;
  });

  return <points ref={pointsRef} position={[0, 0, -0.5]} args={[geometry, material]} />;
}

function BloomVeil({ reactiveRef }: { reactiveRef: MutableRefObject<ReactiveState> }) {
  const spriteRef = useRef<THREE.Sprite>(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const grad = ctx.createRadialGradient(256, 256, 24, 256, 256, 256);
    grad.addColorStop(0, 'rgba(255,245,236,0.92)');
    grad.addColorStop(0.24, 'rgba(255,213,222,0.34)');
    grad.addColorStop(0.52, 'rgba(181,87,128,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color: new THREE.Color('#ffd6d1'),
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mat.toneMapped = false;
    return mat;
  }, [texture]);

  useEffect(() => () => {
    texture.dispose();
    material.dispose();
  }, [material, texture]);

  useFrame((state) => {
    if (!spriteRef.current) return;
    const reactive = reactiveRef.current;
    const breath = 1.0 + Math.sin(state.clock.elapsedTime * 0.22) * 0.025 + reactive.bass * 0.08;
    spriteRef.current.scale.set(4.2 * breath, 4.9 * breath, 1);
    spriteRef.current.position.set(Math.sin(state.clock.elapsedTime * 0.05) * 0.035, 0.06 + Math.cos(state.clock.elapsedTime * 0.04) * 0.025, 0.12);
    material.opacity = 0.17 + reactive.shimmer * 0.06 + reactive.impulse * 0.05;
  });

  return <sprite ref={spriteRef} material={material} position={[0, 0.06, 0.12]} scale={[4.2, 4.9, 1]} />;
}

function RoseCloud({ reactiveRef }: { reactiveRef: MutableRefObject<ReactiveState> }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = 4800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const c1 = new THREE.Color('#f6e4da');
    const c2 = new THREE.Color('#dba3b8');
    const c3 = new THREE.Color('#8c3d62');

    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2.0;
      const band = Math.random();
      const rose = 0.3 + Math.pow(Math.abs(Math.sin(a * 2.5)), 0.9) * 0.95;
      const radius = Math.pow(Math.random(), 0.72) * rose * (1.18 - band * 0.18);
      const swirl = (Math.random() - 0.5) * 0.12;
      const x = Math.cos(a + swirl) * radius * 0.95;
      const y = Math.sin(a) * radius * 1.18 - radius * 0.08 + (Math.random() - 0.5) * 0.08;
      const z = (Math.random() - 0.5) * 0.42 + (1.0 - radius) * 0.22;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const mixColor = c1.clone().lerp(c2, Math.min(1, radius * 0.85 + band * 0.2)).lerp(c3, Math.max(0, radius - 0.78) * 2.0);
      colors[i * 3] = mixColor.r;
      colors[i * 3 + 1] = mixColor.g;
      colors[i * 3 + 2] = mixColor.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, []);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: 0.026,
      transparent: true,
      opacity: 0.74,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });
    mat.toneMapped = false;
    return mat;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const reactive = reactiveRef.current;
    const breath = 1.0 + Math.sin(state.clock.elapsedTime * 0.16) * 0.018 + reactive.bass * 0.06;
    pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.045) * 0.1;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.015 + reactive.flow * 0.04;
    pointsRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.06) * 0.025;
    pointsRef.current.position.y = 0.03 + Math.cos(state.clock.elapsedTime * 0.05) * 0.02;
    pointsRef.current.scale.setScalar(breath);
    material.opacity = 0.68 + reactive.shimmer * 0.14 + reactive.impulse * 0.08;
    material.size = 0.024 + reactive.shimmer * 0.008 + reactive.impulse * 0.004;
  });

  return <points ref={pointsRef} args={[geometry, material]} position={[0, 0.03, 0.22]} />;
}

export default function Visualizer({ audio, onReactiveState }: VisualizerProps) {
  const reactiveRef = useRef<ReactiveState>({
    bass: 0.2,
    flow: 0.22,
    shimmer: 0.1,
    energy: 0.2,
    impulse: 0,
    mode: 'autopilot',
    micAvailable: false,
  });

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 38 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#080509']} />
      <fog attach="fog" args={['#080509', 5.5, 10.5]} />
      <Environment preset="night" />
      <ambientLight intensity={0.15} color="#2a1822" />
      <directionalLight position={[-2.5, 1.8, 2]} intensity={1.4} color="#ffe0d8" />
      <pointLight position={[0, 0.5, 2.5]} intensity={12} distance={7} color="#e8a0b8" />
      <pointLight position={[0.5, -0.2, 2.2]} intensity={6} distance={6} color="#ffe6d4" />
      <BackgroundPlane audio={audio} onReactiveState={onReactiveState} reactiveRef={reactiveRef} />
      <DustParticles reactiveRef={reactiveRef} />
      <BloomVeil reactiveRef={reactiveRef} />
      <RoseCloud reactiveRef={reactiveRef} />
    </Canvas>
  );
}
