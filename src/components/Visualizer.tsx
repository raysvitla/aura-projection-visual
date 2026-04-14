import { Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { JSX, MutableRefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AudioEngine, ReactiveState } from '../lib/AudioEngine';

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.glb`;

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
uniform float uSceneSpread;
uniform float uColorWarmth;
uniform float uFoldDensity;
uniform float uRidgeSharpness;

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

vec3 gasolinePalette(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(0.13, 0.37, 0.61) + x + vec3(0.0, 0.19, 0.43)));
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

float segment(vec2 uv, vec2 a, vec2 b, float width) {
  vec2 pa = uv - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return 1.0 - smoothstep(width, width + 0.012, length(pa - ba * h));
}

float glyphShape(vec2 uv, float id) {
  float shape = 0.0;
  if (id < 0.2) {
    shape = max(segment(uv, vec2(0.22, 0.2), vec2(0.78, 0.2), 0.018), segment(uv, vec2(0.22, 0.8), vec2(0.78, 0.8), 0.018));
    shape = max(shape, segment(uv, vec2(0.32, 0.28), vec2(0.68, 0.72), 0.014));
  } else if (id < 0.4) {
    shape = max(segment(uv, vec2(0.5, 0.18), vec2(0.5, 0.82), 0.018), segment(uv, vec2(0.2, 0.5), vec2(0.8, 0.5), 0.018));
  } else if (id < 0.6) {
    shape = max(segment(uv, vec2(0.28, 0.22), vec2(0.72, 0.78), 0.015), segment(uv, vec2(0.72, 0.22), vec2(0.28, 0.78), 0.015));
  } else if (id < 0.8) {
    shape = max(segment(uv, vec2(0.26, 0.2), vec2(0.26, 0.8), 0.016), segment(uv, vec2(0.74, 0.2), vec2(0.74, 0.8), 0.016));
    shape = max(shape, segment(uv, vec2(0.26, 0.2), vec2(0.74, 0.2), 0.016));
    shape = max(shape, segment(uv, vec2(0.26, 0.8), vec2(0.74, 0.8), 0.016));
  } else {
    shape = max(segment(uv, vec2(0.32, 0.2), vec2(0.68, 0.2), 0.016), segment(uv, vec2(0.32, 0.5), vec2(0.68, 0.5), 0.016));
    shape = max(shape, segment(uv, vec2(0.32, 0.8), vec2(0.68, 0.8), 0.016));
    shape = max(shape, segment(uv, vec2(0.32, 0.2), vec2(0.32, 0.8), 0.016));
  }
  return shape;
}

float ghostGlyphVeil(vec2 uv, vec2 flowUv, float shadowMask, float edgeMask, float t) {
  vec2 gridUv = uv * vec2(15.0, 9.0) + flowUv * 0.55;
  vec2 cell = floor(gridUv);
  vec2 local = fract(gridUv);
  float seed = hash21(cell + floor(t * 0.08));
  float presence = smoothstep(0.72, 0.95, seed);
  float glyph = glyphShape(local, fract(seed * 7.31 + floor(t * 0.02) * 0.17));
  float driftNoise = smoothstep(0.2, 0.78, snoise(cell * 0.37 + flowUv * 0.8 + t * 0.03));
  return glyph * presence * driftNoise * shadowMask * (0.28 + edgeMask * 0.72);
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float t = uTime * (0.045 + uFlow * 0.03);
  float longT = uTime * 0.013;
  vec2 drift = vec2(sin(longT * 1.2), cos(longT * 0.87)) * 0.42;

  vec2 q = p;
  q.y -= t * 0.34;
  q.x += sin(t * 0.43) * 0.32;
  q.x += sin(q.y * 1.15 + t * 0.52) * 0.28;
  q += drift;

  float pressure = 1.0 - uBass * 0.18 - uImpulse * 0.12;
  q *= pressure;

  float foldFrequency = 0.78 + uFoldDensity * 0.82;
  vec2 foldCoords = q * vec2(foldFrequency, foldFrequency * 0.58);
  vec2 warpA = vec2(fbm(foldCoords + vec2(t * 0.08, t * 0.17)), fbm(foldCoords + vec2(-t * 0.06, t * 0.11)));
  vec2 warpB = vec2(fbm(foldCoords + 2.1 * warpA + vec2(t * 0.14, -t * 0.04)), fbm(foldCoords + 2.4 * warpA + vec2(-t * 0.1, t * 0.09)));

  vec2 cloth = foldCoords + warpB * (0.8 + uFlow * 0.22);
  float folds = fbm(cloth + sin(foldCoords.x * (1.35 + uFoldDensity * 0.8) + t) * 0.18);
  float ridges = sin(cloth.x * (2.0 + uRidgeSharpness * 0.9) + warpA.x * 2.8 + t * 1.5) * cos(cloth.y * (1.85 + uRidgeSharpness * 0.8) + warpB.y * 2.6 - t * 1.1);
  float ridgeLow = 0.34 + (1.0 - uRidgeSharpness) * 0.18;
  float ridgeHigh = 0.76 + uRidgeSharpness * 0.2;
  float ridgeMask = smoothstep(ridgeLow, ridgeHigh, ridges * 0.5 + 0.5);

  float spread = 0.72 + uSceneSpread * 0.95;
  vec2 mass1P = q + vec2(0.74, 0.38) * spread;
  vec2 mass2P = q + vec2(-0.08, 0.02) * spread;
  vec2 mass3P = q + vec2(-0.72, -0.34) * spread;
  vec2 mass4P = q + vec2(0.18, -0.58) * spread;

  float mass1 = smoothstep(1.45, 0.12, length(mass1P * vec2(1.0, 0.86)) + fbm(cloth * 0.92) * 0.38);
  float mass2 = smoothstep(1.42, 0.2, length(mass2P * vec2(0.96, 0.82)) + fbm(cloth * 1.11 + 4.2) * 0.34);
  float mass3 = smoothstep(1.4, 0.22, length(mass3P * vec2(0.92, 0.88)) + fbm(cloth * 1.3 - 2.1) * 0.3);
  float mass4 = smoothstep(1.36, 0.18, length(mass4P * vec2(1.08, 0.8)) + fbm(cloth * 0.78 + 9.2) * 0.31);

  vec3 color = vec3(0.03, 0.015, 0.035);
  vec3 mass1Color = mix(vec3(0.15, 0.03, 0.18), vec3(0.23, 0.03, 0.06), uColorWarmth);
  vec3 mass2Color = mix(vec3(0.22, 0.12, 0.38), vec3(0.42, 0.16, 0.32), uColorWarmth);
  vec3 mass3Color = mix(vec3(0.56, 0.28, 0.62), vec3(0.78, 0.36, 0.48), uColorWarmth);
  vec3 mass4Color = mix(vec3(0.88, 0.82, 0.9), vec3(0.96, 0.89, 0.78), 0.35 + uColorWarmth * 0.65);
  color = mix(color, mass1Color, mass1 * 0.78);
  color = mix(color, mass2Color, mass2 * 0.72);
  color = mix(color, mass3Color, mass3 * 0.64);
  color = mix(color, mass4Color, mass4 * 0.48);

  float silk = smoothstep(-0.48, 0.96, folds + ridgeMask * 0.33 + uEnergy * 0.06);
  float creamPeaks = smoothstep(0.42, 0.94, folds * 0.75 + ridgeMask * 0.55 + uBass * 0.1);
  color = mix(color, vec3(0.66, 0.31, 0.46), silk * 0.22);
  color = mix(color, vec3(0.98, 0.93, 0.82), creamPeaks * 0.44);

  float edgeNoise = smoothstep(0.48, 0.94, snoise(cloth * 2.3 + uTime * 0.25));
  float shimmer = ridgeMask * edgeNoise * (0.18 + uShimmer * 0.7 + uImpulse * 0.4);
  color += shimmer * vec3(1.0, 0.96, 0.88);

  float acidMask = pow(ridgeMask, 1.45) * smoothstep(0.46, 1.0, creamPeaks + edgeNoise * 0.32);
  vec3 gasoline = gasolinePalette(folds * 0.18 + q.x * 0.09 - q.y * 0.07 + t * 0.12);
  vec3 gasolineTint = mix(vec3(0.64, 0.92, 0.82), gasoline, 0.72);
  color += gasolineTint * acidMask * (0.1 + uFlow * 0.075 + uImpulse * 0.045);

  float shadowMask = smoothstep(0.56, 0.16, creamPeaks + mass4 * 0.14 + ridgeMask * 0.08);
  float glyphField = ghostGlyphVeil(uv, cloth, shadowMask, ridgeMask, uTime);
  vec3 glyphColor = mix(vec3(0.58, 0.8, 0.74), gasolineTint, 0.38);
  color += glyphColor * glyphField * (0.058 + uShimmer * 0.024);

  float grain = fract(sin(dot(uv + vec2(uTime * 0.0017, -uTime * 0.0011), vec2(12.9898, 78.233))) * 43758.5453);
  color -= grain * 0.03;

  float centerGlow = smoothstep(1.22, 0.18, length((uv - 0.5) * vec2(1.1, 0.92)));
  color += vec3(0.026, 0.008, 0.02) * centerGlow;

  color = max(color - vec3(0.012), 0.0);
  color = pow(color, vec3(0.98));
  color = color * 1.03 + creamPeaks * 0.06;
  color = smoothstep(vec3(0.022), vec3(1.0), color);

  gl_FragColor = vec4(color, 1.0);
}
`;

type VisualizerProps = {
  audio: AudioEngine;
  onReactiveState: (state: ReactiveState) => void;
};

const INITIAL_REACTIVE_STATE: ReactiveState = {
  bass: 0.2,
  flow: 0.22,
  shimmer: 0.1,
  energy: 0.2,
  impulse: 0,
  mode: 'autopilot',
  micAvailable: false,
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
      uSceneSpread: { value: 0.5 },
      uColorWarmth: { value: 0.93 },
      uFoldDensity: { value: 0.82 },
      uRidgeSharpness: { value: 0.19 },
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

    const sceneSpread = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.00145);
    const colorWarmth = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.00098 + 2.1);
    const foldDensity = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.00183 + 0.7);
    const ridgeSharpness = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 0.00121 + 3.8);

    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uBass.value = reactive.bass;
    materialRef.current.uniforms.uFlow.value = reactive.flow;
    materialRef.current.uniforms.uShimmer.value = reactive.shimmer;
    materialRef.current.uniforms.uEnergy.value = reactive.energy;
    materialRef.current.uniforms.uImpulse.value = reactive.impulse;
    materialRef.current.uniforms.uSceneSpread.value = sceneSpread;
    materialRef.current.uniforms.uColorWarmth.value = colorWarmth;
    materialRef.current.uniforms.uFoldDensity.value = foldDensity;
    materialRef.current.uniforms.uRidgeSharpness.value = ridgeSharpness;
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial ref={materialRef} vertexShader={vertexShader} fragmentShader={fragmentShader} uniforms={uniforms} depthWrite={false} />
    </mesh>
  );
}

function Logo({ reactiveRef }: { reactiveRef: MutableRefObject<ReactiveState> }) {
  const { scene } = useGLTF(LOGO_SRC);
  const groupRef = useRef<THREE.Group>(null);
  const shellMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  const preparedScene = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    cloned.position.sub(center);
    const maxAxis = Math.max(size.x, size.y, size.z) || 1;
    const scale = 2.45 / maxAxis;
    cloned.scale.setScalar(scale);
    cloned.rotation.x = 0.28;
    cloned.rotation.z = -0.12;

    cloned.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.computeVertexNormals();
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#ff9ad9'),
          emissive: new THREE.Color('#4f102f'),
          emissiveIntensity: 0.45,
          metalness: 0.82,
          roughness: 0.18,
          clearcoat: 1,
          clearcoatRoughness: 0.12,
          reflectivity: 1,
          iridescence: 1,
          iridescenceIOR: 1.36,
          transmission: 0.02,
          thickness: 0.7,
          envMapIntensity: 1.35,
        });
      }
    });

    return cloned;
  }, [scene]);

  const shell = useMemo(() => {
    shellMaterialsRef.current = [];
    const shells: JSX.Element[] = [];

    preparedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const shellMaterial = new THREE.MeshBasicMaterial({
          color: new THREE.Color('#8efff0'),
          transparent: true,
          opacity: 0.06,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        shellMaterial.toneMapped = false;
        shellMaterialsRef.current.push(shellMaterial);
        shells.push(
          <mesh
            key={`shell-${mesh.uuid}`}
            geometry={mesh.geometry}
            position={mesh.position.clone()}
            rotation={mesh.rotation.clone()}
            scale={mesh.scale.clone().multiplyScalar(1.025)}
            material={shellMaterial}
          />,
        );
      }
    });

    return shells;
  }, [preparedScene]);

  useFrame((state) => {
    const reactive = reactiveRef.current;
    if (!groupRef.current || !reactive) return;

    const rawDriftX = Math.sin(state.clock.elapsedTime * 0.0225);
    const rawDriftY = Math.sin(state.clock.elapsedTime * 0.0167 + 1.2);
    const shapedX = Math.sign(rawDriftX) * Math.pow(Math.abs(rawDriftX), 0.6);
    const shapedY = Math.sign(rawDriftY) * Math.pow(Math.abs(rawDriftY), 0.6);
    const breath = Math.sin(state.clock.elapsedTime * 0.009 + 0.7);

    groupRef.current.rotation.y = state.clock.elapsedTime * 0.018 + reactive.flow * 0.055;
    groupRef.current.rotation.x = 0.08 + Math.sin(state.clock.elapsedTime * 0.028) * 0.045 + reactive.bass * 0.025;
    groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.018) * 0.024;
    groupRef.current.position.x = shapedX * 0.92 + Math.sin(state.clock.elapsedTime * 0.12) * 0.025;
    groupRef.current.position.y = -0.04 + shapedY * 0.34 + Math.sin(state.clock.elapsedTime * 0.09) * 0.02;
    groupRef.current.position.z = 0.4 + breath * 0.18;
    groupRef.current.scale.setScalar(0.94 + breath * 0.018);

    preparedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshPhysicalMaterial;
        const hue = (0.88 + state.clock.elapsedTime * 0.003 + reactive.shimmer * 0.04) % 1;
        material.color.setHSL(hue, 0.84, 0.72 + reactive.energy * 0.08);
        material.emissive.setHSL((hue + 0.18) % 1, 0.72, 0.18 + reactive.impulse * 0.12);
        material.emissiveIntensity = 0.44 + reactive.impulse * 0.4 + reactive.shimmer * 0.55;
        material.iridescence = 0.75 + reactive.flow * 0.3;
        material.clearcoat = 0.9 + reactive.shimmer * 0.08;
      }
    });

    for (const material of shellMaterialsRef.current) {
      const hue = (0.49 + state.clock.elapsedTime * 0.004 + reactive.flow * 0.06) % 1;
      material.color.setHSL(hue, 0.95, 0.66);
      material.opacity = 0.08 + reactive.shimmer * 0.06 + reactive.impulse * 0.08;
    }
  });

  return (
    <group ref={groupRef} position={[0.22, 0.02, 0.4]}>
      <primitive object={preparedScene} />
      {shell}
    </group>
  );
}

useGLTF.preload(LOGO_SRC);

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
      <ambientLight intensity={0.2} color="#2c1627" />
      <directionalLight position={[-2.5, 1.8, 2]} intensity={1.9} color="#ffe6dc" />
      <pointLight position={[2.4, 1.2, 3.1]} intensity={20} distance={8} color="#ff8fef" />
      <pointLight position={[-2.8, -1.4, 2.6]} intensity={14} distance={8} color="#76fff2" />
      <pointLight position={[0.5, -0.2, 2.2]} intensity={8} distance={6} color="#fff2cf" />
      <BackgroundPlane audio={audio} onReactiveState={onReactiveState} reactiveRef={reactiveRef} />
      <Logo reactiveRef={reactiveRef} />
    </Canvas>
  );
}
