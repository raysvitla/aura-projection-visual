import { Environment, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { JSX, MutableRefObject } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AudioEngine, ReactiveState } from '../lib/AudioEngine';

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.glb`;
const BACKGROUND_BLEND_SECONDS = 60 * 7;

type BackgroundMode = 'auto' | 'legacy' | 'rose';

const screenVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const legacyFragmentShader = /* glsl */ `
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
uniform sampler2D uTextTex;
uniform float uOpacity;

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

vec3 sampleEmbeddedGlyphs(vec2 uv, vec2 cloth, float folds, float ridgeMask, float silk, float creamPeaks, vec3 gasolineTint, float t) {
  vec2 textUv = uv;
  textUv.x *= uResolution.x / uResolution.y;
  textUv *= vec2(0.84, 0.82);
  textUv += cloth * 0.075;
  textUv += vec2(t * 0.008, -t * 0.014);
  textUv += vec2(
    snoise(cloth * 2.0 + vec2(t * 0.12, -t * 0.08)),
    snoise(cloth * 2.2 + vec2(-t * 0.09, t * 0.11))
  ) * 0.016;

  float ca = 0.0025 + uShimmer * 0.002;
  vec2 textUv2 = textUv * vec2(1.37, 1.21) + vec2(0.18, -0.11);
  float textR = max(texture2D(uTextTex, textUv + vec2(ca, 0.0)).r, texture2D(uTextTex, textUv2 + vec2(ca * 0.6, 0.0)).r * 0.72);
  float textG = max(texture2D(uTextTex, textUv).r, texture2D(uTextTex, textUv2).r * 0.72);
  float textB = max(texture2D(uTextTex, textUv - vec2(ca, 0.0)).r, texture2D(uTextTex, textUv2 - vec2(ca * 0.6, 0.0)).r * 0.72);
  vec3 glyph = vec3(textR, textG, textB);

  float textLum = dot(glyph, vec3(0.3333));
  float midMask = smoothstep(0.1, 0.7, folds + silk * 0.22) * (1.0 - smoothstep(0.78, 1.05, creamPeaks + silk * 0.22));
  float shadowMask = smoothstep(0.98, 0.2, creamPeaks + ridgeMask * 0.14);
  float edgeMask = smoothstep(0.16, 0.88, ridgeMask + silk * 0.22 + uFlow * 0.12);
  float dissolve = smoothstep(0.24, 0.82, snoise(cloth * 4.1 + vec2(t * 0.18, -t * 0.12)) * 0.5 + 0.5);
  float emergence = smoothstep(0.04, 0.5, textLum);
  float visibility = emergence * midMask * shadowMask * edgeMask * dissolve;
  visibility = pow(visibility, 0.78);

  vec3 paleInk = mix(vec3(0.82, 0.99, 0.9), gasolineTint, 0.58);
  return paleInk * glyph * visibility * (0.62 + uShimmer * 0.18 + uImpulse * 0.12);
}

void main() {
  vec2 uv = vUv;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= uResolution.x / uResolution.y;

  float stableTime = mod(uTime, 900.0);
  float stableLongTime = mod(uTime, 3600.0);
  float t = stableTime * (0.045 + uFlow * 0.03);
  float longT = stableLongTime * 0.013;
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

  vec3 color = vec3(0.06, 0.028, 0.06);
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

  float edgeNoise = smoothstep(0.48, 0.94, snoise(cloth * 2.3 + stableTime * 0.25));
  float shimmer = ridgeMask * edgeNoise * (0.18 + uShimmer * 0.7 + uImpulse * 0.4);
  color += shimmer * vec3(1.0, 0.96, 0.88);

  float acidMask = pow(ridgeMask, 1.05) * smoothstep(0.34, 1.0, creamPeaks + edgeNoise * 0.5 + silk * 0.22);
  vec3 gasoline = gasolinePalette(folds * 0.24 + q.x * 0.16 - q.y * 0.12 + t * 0.18);
  vec3 gasolineTint = mix(vec3(0.78, 1.0, 0.88), gasoline, 0.9);
  color += gasolineTint * acidMask * (0.24 + uFlow * 0.1 + uImpulse * 0.08);
  color += gasolineTint * smoothstep(0.54, 0.96, ridgeMask + edgeNoise * 0.24 + silk * 0.08) * 0.08;

  color += sampleEmbeddedGlyphs(uv, cloth, folds, ridgeMask, silk, creamPeaks, gasolineTint, stableTime);

  float grain = fract(sin(dot(uv + vec2(stableTime * 0.0017, -stableTime * 0.0011), vec2(12.9898, 78.233))) * 43758.5453);
  color -= grain * 0.03;

  float centerGlow = smoothstep(1.22, 0.18, length((uv - 0.5) * vec2(1.1, 0.92)));
  color += vec3(0.026, 0.008, 0.02) * centerGlow;

  color = max(color - vec3(0.012), 0.0);
  color = pow(color, vec3(0.98));
  color = color * 1.03 + creamPeaks * 0.06;
  color = smoothstep(vec3(0.022), vec3(1.0), color);

  gl_FragColor = vec4(color, uOpacity);
}
`;

const roseFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uFlow;
uniform float uShimmer;
uniform float uEnergy;
uniform float uImpulse;
uniform float uOpacity;

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

  float stableTime = mod(uTime, 900.0);
  float stableSlowTime = mod(uTime, 3600.0);
  float t = stableTime * 0.042;
  float slowT = stableSlowTime * 0.014;

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

  vec2 stippleUV = pc * 58.0 + warp1 * 3.5 + vec2(t * 0.4, -t * 0.25);
  float stipple = hash21(floor(stippleUV));
  float stippleThresh = 0.84 - uShimmer * 0.05 - uImpulse * 0.03;
  float stippleDots = smoothstep(stippleThresh, stippleThresh + 0.03, stipple);
  stippleDots *= smoothstep(2.2, 0.22, r) * smoothstep(0.0, 0.1, r);

  vec2 dustUV = pc * 28.0 + warp2 * 1.8 + vec2(-t * 0.15, t * 0.12);
  float dust = hash21(floor(dustUV));
  float dustDots = smoothstep(0.86, 0.94, dust) * smoothstep(2.5, 0.35, r);

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

  float grain = fract(sin(dot(uv + vec2(stableTime * 0.0017, -stableTime * 0.0011), vec2(12.9898, 78.233))) * 43758.5453);
  color -= grain * 0.02;

  color = max(color, 0.0);
  color = pow(color, vec3(0.97));
  color = smoothstep(vec3(0.012), vec3(1.0), color);

  gl_FragColor = vec4(color, uOpacity);
}
`;

type VisualizerProps = {
  audio: AudioEngine;
  onReactiveState: (state: ReactiveState) => void;
  backgroundMode: BackgroundMode;
};

type QualityProfile = {
  tier: 'lite' | 'balanced' | 'strong';
  dpr: [number, number];
  roseCount: number;
  dustCount: number;
  roseSize: number;
  dustSize: number;
};

function detectQualityProfile(): QualityProfile {
  if (typeof window === 'undefined') {
    return {
      tier: 'balanced',
      dpr: [1, 1.35],
      roseCount: 42000,
      dustCount: 2400,
      roseSize: 0.009,
      dustSize: 0.012,
    };
  }

  const memory = 'deviceMemory' in navigator ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0) : 0;
  const cores = navigator.hardwareConcurrency ?? 4;
  const pixelRatio = window.devicePixelRatio || 1;
  const touch = matchMedia('(pointer: coarse)').matches;
  const mobileishViewport = Math.min(window.innerWidth, window.innerHeight) < 820;

  if (touch || (mobileishViewport && pixelRatio > 1.5) || (memory > 0 && memory <= 4) || cores <= 4) {
    return {
      tier: 'lite',
      dpr: [1, 1.1],
      roseCount: 18000,
      dustCount: 1200,
      roseSize: 0.0115,
      dustSize: 0.014,
    };
  }

  if (memory >= 8 && cores >= 8 && pixelRatio <= 2) {
    return {
      tier: 'strong',
      dpr: [1, 1.6],
      roseCount: 64000,
      dustCount: 3200,
      roseSize: 0.0082,
      dustSize: 0.0105,
    };
  }

  return {
    tier: 'balanced',
    dpr: [1, 1.35],
    roseCount: 42000,
    dustCount: 2400,
    roseSize: 0.009,
    dustSize: 0.012,
  };
}

function smoothPingPong(elapsed: number) {
  const fullCycle = BACKGROUND_BLEND_SECONDS * 2.0;
  const normalized = (elapsed % fullCycle) / BACKGROUND_BLEND_SECONDS;
  const linear = normalized <= 1.0 ? normalized : 2.0 - normalized;
  return THREE.MathUtils.smoothstep(linear, 0, 1);
}

function createTextTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallback = new THREE.Texture();
    fallback.needsUpdate = true;
    return fallback;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const fragments = ['0x0D', '2WD', '17 31', '100 0100', '2501', 'A', 'R', '::', '//', '[ ]', '01', '+', '<>', '{}'];
  const cols = 28;
  const rows = 34;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const seed = Math.sin(x * 93.17 + y * 17.31) * 43758.5453;
      const n = seed - Math.floor(seed);
      if (n < 0.68) continue;

      const fragment = fragments[Math.floor(n * fragments.length) % fragments.length];
      const alpha = 0.16 + ((n * 7.0) % 1.0) * 0.34;
      const size = 14 + ((n * 13.0) % 1.0) * 12;
      const hue = 108 + ((n * 23.0) % 1.0) * 44;
      const sat = 18 + ((n * 31.0) % 1.0) * 24;
      const light = 72 + ((n * 41.0) % 1.0) * 14;
      const offsetX = ((((n * 53.0) % 1.0) - 0.5) * cellW) * 0.22;
      const offsetY = ((((n * 67.0) % 1.0) - 0.5) * cellH) * 0.22;
      const rotation = ((((n * 79.0) % 1.0) - 0.5) * 0.1);

      ctx.save();
      ctx.translate(x * cellW + cellW * 0.5 + offsetX, y * cellH + cellH * 0.5 + offsetY);
      ctx.rotate(rotation);
      ctx.font = `600 ${size}px monospace`;
      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
      ctx.shadowBlur = 10;
      ctx.shadowColor = `hsla(${hue + 30}, ${sat + 10}%, 86%, ${alpha * 0.35})`;
      ctx.fillText(fragment, 0, 0);
      ctx.restore();
    }
  }

  const heroFragments = [
    { text: '0x0D', x: 0.18, y: 0.24, size: 44, alpha: 0.5, rot: -0.12 },
    { text: '2WD', x: 0.76, y: 0.33, size: 52, alpha: 0.52, rot: 0.08 },
    { text: '17 31', x: 0.58, y: 0.68, size: 42, alpha: 0.46, rot: -0.06 },
    { text: '100 0100', x: 0.34, y: 0.78, size: 38, alpha: 0.4, rot: 0.05 },
    { text: '2501', x: 0.7, y: 0.14, size: 34, alpha: 0.38, rot: 0.02 },
    { text: 'A', x: 0.42, y: 0.2, size: 58, alpha: 0.34, rot: -0.09 },
    { text: 'R', x: 0.84, y: 0.74, size: 56, alpha: 0.34, rot: 0.11 },
  ];

  for (const hero of heroFragments) {
    const hue = hero.text === 'A' || hero.text === 'R' ? 118 : 132;
    ctx.save();
    ctx.translate(canvas.width * hero.x, canvas.height * hero.y);
    ctx.rotate(hero.rot);
    ctx.font = `700 ${hero.size}px monospace`;
    ctx.fillStyle = `hsla(${hue}, 28%, 84%, ${hero.alpha})`;
    ctx.shadowBlur = 18;
    ctx.shadowColor = `hsla(${hue + 24}, 44%, 90%, ${hero.alpha * 0.46})`;
    ctx.fillText(hero.text, 0, 0);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function LegacyBackgroundPlane({
  audio,
  onReactiveState,
  reactiveRef,
  blendRef,
}: { audio: AudioEngine; onReactiveState: (state: ReactiveState) => void; reactiveRef: MutableRefObject<ReactiveState>; blendRef: MutableRefObject<number> }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const lastUiSyncRef = useRef(0);
  const { viewport, camera, size } = useThree();
  const textTexture = useMemo(() => createTextTexture(), []);
  const planeTarget = useMemo(() => new THREE.Vector3(0, 0, -2.15), []);
  const planeVp = viewport.getCurrentViewport(camera, planeTarget);

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
      uTextTex: { value: textTexture },
      uOpacity: { value: 1 },
    }),
    [size.height, size.width, textTexture],
  );

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [size.height, size.width, uniforms]);

  useEffect(() => {
    uniforms.uTextTex.value = textTexture;
    return () => {
      textTexture.dispose();
    };
  }, [textTexture, uniforms]);

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
    materialRef.current.uniforms.uTextTex.value = textTexture;
    materialRef.current.uniforms.uOpacity.value = 1.0 - blendRef.current;
  });

  return (
    <mesh position={[0, 0, -2.15]}>
      <planeGeometry args={[planeVp.width, planeVp.height]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={screenVertexShader}
        fragmentShader={legacyFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function RoseBackgroundPlane({ reactiveRef, blendRef }: { reactiveRef: MutableRefObject<ReactiveState>; blendRef: MutableRefObject<number> }) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { viewport, camera, size } = useThree();
  const planeTarget = useMemo(() => new THREE.Vector3(0, 0, -2), []);
  const planeVp = viewport.getCurrentViewport(camera, planeTarget);

  const uniforms = useMemo(
    () => ({
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uTime: { value: 0 },
      uBass: { value: 0.2 },
      uFlow: { value: 0.2 },
      uShimmer: { value: 0.12 },
      uEnergy: { value: 0.2 },
      uImpulse: { value: 0 },
      uOpacity: { value: 0 },
    }),
    [size.height, size.width],
  );

  useEffect(() => {
    uniforms.uResolution.value.set(size.width, size.height);
  }, [size.height, size.width, uniforms]);

  useFrame((state) => {
    const reactive = reactiveRef.current;
    if (!materialRef.current || !reactive) return;
    materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    materialRef.current.uniforms.uBass.value = reactive.bass;
    materialRef.current.uniforms.uFlow.value = reactive.flow;
    materialRef.current.uniforms.uShimmer.value = reactive.shimmer;
    materialRef.current.uniforms.uEnergy.value = reactive.energy;
    materialRef.current.uniforms.uImpulse.value = reactive.impulse;
    materialRef.current.uniforms.uOpacity.value = blendRef.current;
  });

  return (
    <mesh position={[0, 0, -2]}>
      <planeGeometry args={[planeVp.width, planeVp.height]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={screenVertexShader}
        fragmentShader={roseFragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

function DustParticles({ reactiveRef, quality, blendRef }: { reactiveRef: MutableRefObject<ReactiveState>; quality: QualityProfile; blendRef: MutableRefObject<number> }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = quality.dustCount;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 1.45) * 2.9;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 3.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2.4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [quality.dustCount]);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color('#ddb8c8'),
      size: quality.dustSize,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    mat.toneMapped = false;
    return mat;
  }, [quality.dustSize]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const reactive = reactiveRef.current;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.006;
    pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.004) * 0.03;
    material.opacity = (0.1 + reactive.shimmer * 0.15 + reactive.impulse * 0.08) * blendRef.current;
    material.size = quality.dustSize + reactive.shimmer * 0.0015 + reactive.impulse * 0.001;
  });

  return <points ref={pointsRef} position={[0, 0, -0.5]} args={[geometry, material]} />;
}

function BloomVeil({ reactiveRef, blendRef }: { reactiveRef: MutableRefObject<ReactiveState>; blendRef: MutableRefObject<number> }) {
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
    material.opacity = (0.17 + reactive.shimmer * 0.06 + reactive.impulse * 0.05) * blendRef.current;
  });

  return <sprite ref={spriteRef} material={material} position={[0, 0.06, 0.12]} scale={[4.2, 4.9, 1]} />;
}

function RoseCloud({ reactiveRef, quality, blendRef }: { reactiveRef: MutableRefObject<ReactiveState>; quality: QualityProfile; blendRef: MutableRefObject<number> }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const count = quality.roseCount;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const c1 = new THREE.Color('#fff0e4');
    const c2 = new THREE.Color('#f2c8d1');
    const c3 = new THREE.Color('#d889a8');
    const c4 = new THREE.Color('#7f3058');

    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2.0;
      const petalBand = Math.floor(Math.random() * 7.0);
      const shellType = Math.random();
      const petalCurve = 0.5 + Math.pow(Math.abs(Math.sin(a * 2.5 + petalBand * 0.52)), 0.78) * 1.38;
      const innerBias = Math.pow(Math.random(), petalBand < 2 ? 0.4 : 0.68);
      const outerBias = 0.58 + Math.pow(Math.random(), 1.8) * 0.92;
      const shellBias = shellType < 0.44 ? outerBias : innerBias;
      const radius = shellBias * petalCurve * (1.68 - petalBand * 0.07);
      const swirl = a * 0.2 + petalBand * 0.34 + (Math.random() - 0.5) * 0.2;
      const twist = Math.sin(a * 3.0 + petalBand * 0.92) * 0.14;
      const lateralSpread = 1.0 + petalBand * 0.032 + (shellType < 0.44 ? 0.1 : 0.0);
      const verticalSpread = 1.18 + petalBand * 0.035;
      const x = Math.cos(a + swirl) * radius * lateralSpread + Math.cos(swirl * 2.0) * 0.09;
      const y = Math.sin(a + twist) * radius * verticalSpread - radius * 0.1 + (Math.random() - 0.5) * 0.12;
      const z = (Math.random() - 0.5) * 0.88 + (1.35 - radius) * 0.3 + petalBand * 0.02;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const edgeMix = Math.min(1, radius * 0.32 + petalBand * 0.11);
      const depthMix = Math.max(0, (radius - 1.0) * 0.72 + petalBand * 0.05);
      const shadowMix = Math.max(0, radius - 1.78) * 0.55;
      const shimmerMix = Math.random() * 0.12;
      const mixColor = c1.clone().lerp(c2, edgeMix).lerp(c3, depthMix).lerp(c4, shadowMix + shimmerMix);
      colors[i * 3] = mixColor.r;
      colors[i * 3 + 1] = mixColor.g;
      colors[i * 3 + 2] = mixColor.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, [quality.roseCount]);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size: quality.roseSize,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
      vertexColors: true,
    });
    mat.toneMapped = false;
    return mat;
  }, [quality.roseSize]);

  useFrame((state) => {
    if (!pointsRef.current) return;
    const reactive = reactiveRef.current;
    const breath = 1.0 + Math.sin(state.clock.elapsedTime * 0.16) * 0.03 + reactive.bass * 0.1;
    pointsRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.045) * 0.11;
    pointsRef.current.rotation.y = state.clock.elapsedTime * 0.017 + reactive.flow * 0.045;
    pointsRef.current.position.x = Math.sin(state.clock.elapsedTime * 0.06) * 0.024;
    pointsRef.current.position.y = 0.04 + Math.cos(state.clock.elapsedTime * 0.05) * 0.02;
    pointsRef.current.scale.set(1.32 * breath, 1.46 * breath, 1.24 * breath);
    material.opacity = (0.88 + reactive.shimmer * 0.1 + reactive.impulse * 0.05) * blendRef.current;
    material.size = quality.roseSize + reactive.shimmer * 0.002 + reactive.impulse * 0.0012;
  });

  return <points ref={pointsRef} args={[geometry, material]} position={[0, 0.04, 0.22]} />;
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

export default function Visualizer({ audio, onReactiveState, backgroundMode }: VisualizerProps) {
  const reactiveRef = useRef<ReactiveState>({
    bass: 0.2,
    flow: 0.22,
    shimmer: 0.1,
    energy: 0.2,
    impulse: 0,
    mode: 'autopilot',
    micAvailable: false,
  });
  const quality = useMemo(() => detectQualityProfile(), []);
  const blendRef = useRef(0);

  return (
    <Canvas camera={{ position: [0, 0, 5], fov: 38 }} dpr={quality.dpr} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}>
      <BlendClock blendRef={blendRef} backgroundMode={backgroundMode} />
      <color attach="background" args={['#080509']} />
      <fog attach="fog" args={['#080509', 5.5, 10.5]} />
      <Environment preset="night" />
      <ambientLight intensity={0.19} color="#2b1724" />
      <directionalLight position={[-2.5, 1.8, 2]} intensity={1.65} color="#ffe6dc" />
      <pointLight position={[2.4, 1.2, 3.1]} intensity={16} distance={8} color="#ff8fef" />
      <pointLight position={[-2.8, -1.4, 2.6]} intensity={11} distance={8} color="#76fff2" />
      <pointLight position={[0.5, -0.2, 2.2]} intensity={7} distance={6} color="#ffe6d4" />
      <LegacyBackgroundPlane audio={audio} onReactiveState={onReactiveState} reactiveRef={reactiveRef} blendRef={blendRef} />
      <RoseBackgroundPlane reactiveRef={reactiveRef} blendRef={blendRef} />
      <DustParticles reactiveRef={reactiveRef} quality={quality} blendRef={blendRef} />
      <BloomVeil reactiveRef={reactiveRef} blendRef={blendRef} />
      <RoseCloud reactiveRef={reactiveRef} quality={quality} blendRef={blendRef} />
      <Logo reactiveRef={reactiveRef} />
    </Canvas>
  );
}

function BlendClock({ blendRef, backgroundMode }: { blendRef: MutableRefObject<number>; backgroundMode: BackgroundMode }) {
  useFrame((state) => {
    if (backgroundMode === 'legacy') {
      blendRef.current = 0;
      return;
    }

    if (backgroundMode === 'rose') {
      blendRef.current = 1;
      return;
    }

    blendRef.current = smoothPingPong(state.clock.elapsedTime);
  });
  return null;
}
