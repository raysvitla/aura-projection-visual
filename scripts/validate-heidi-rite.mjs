import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const requiredAssets = [
  'public/heidi-rite/heidi-halo-reference.png',
  'public/heidi-rite/heidi-eye.png',
  'public/heidi-rite/snail-relic.png',
  'public/heidi-rite/paw-frame.png',
  'public/heidi-rite/paw-sigil.png',
  'public/heidi-rite/pattern-opart-sheet.png',
  'public/heidi-rite/spectral-apparition-sheet.png',
  'public/heidi-rite/scene-schematic-crt.png',
  'public/heidi-rite/scene-neural-map.png',
  'public/heidi-rite/scene-cybermap.png',
  'public/heidi-rite/pattern-opart.gif',
  'public/heidi-rite/spectral-apparition.gif',
  'public/heidi-rite/altar-portal-reference.png',
  'public/logo.glb',
];

const files = {
  component: join(root, 'src/components/HeidiRiteVisualizer.tsx'),
  app: join(root, 'src/App.tsx'),
  css: join(root, 'src/heidi-rite.css'),
  audio: join(root, 'src/lib/AudioEngine.ts'),
  liturgy: join(root, 'src/lib/Liturgy.ts'),
  clock: join(root, 'src/lib/PhaseClock.ts'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const asset of requiredAssets) assert(existsSync(join(root, asset)), `Missing asset: ${asset}`);
for (const [name, path] of Object.entries(files)) assert(existsSync(path), `Missing ${name}: ${path}`);

const component = readFileSync(files.component, 'utf8');
const app = readFileSync(files.app, 'utf8');
const css = readFileSync(files.css, 'utf8');
const audio = readFileSync(files.audio, 'utf8');
const liturgy = readFileSync(files.liturgy, 'utf8');

const bannedTokens = [
  'ASCII_TAIL',
  'ascii-tail',
  'window-pack',
  'tracked-artifact',
  'vision-overlay',
  'rite-ui',
  'linear-gradient',
  'box-shadow',
  'border-radius',
  'BPM',
  'now playing',
  'WITNESSED',
];

for (const token of bannedTokens) {
  assert(!component.includes(token), `Banned component token remains: ${token}`);
  assert(!css.includes(token), `Banned CSS token remains: ${token}`);
}

for (const phase of ['SLATE', 'APPROACH', 'ICON', 'TUNNEL', 'APPARITION', 'STATIONS', 'BENEDICTION']) {
  assert(liturgy.includes(`id: '${phase}'`), `Missing liturgy phase: ${phase}`);
}

assert(component.includes('pattern-opart-sheet.png'), 'Op-art GIF must be pre-extracted into a controllable sprite sheet');
assert(component.includes('spectral-apparition-sheet.png'), 'Spectral GIF must be pre-extracted into a controllable sprite sheet');
assert(component.includes('heidi-halo-reference.png'), 'Heidi halo reference must be the central icon texture');
assert(component.includes('logo.glb') && component.includes('useGLTF'), 'GIRASOL GLB must be loaded as a spinning 3D relic');
assert(component.includes('WALL_LAYER_CONFIGS') && component.includes('uVariant'), 'Scenes must use distinct wall/background material variants');
assert(component.includes('scene-schematic-crt.png'), 'One phase must include the blinking CRT schematic reference');
assert(component.includes('scene-neural-map.png'), 'One phase must include the neural/node map reference');
assert(component.includes('scene-cybermap.png'), 'One phase must include the funny oldschool cybermap reference');
assert(component.includes('SCENE_POSES') && liturgy.includes('5 * minute') && liturgy.includes('7 * minute'), 'Scene rotations must be explicit 5–7 minute 3D pose changes');
assert(component.includes('Canvas'), 'Projection must render through a single R3F canvas');
assert(component.includes('orthographic'), 'Projection must use an orthographic camera');
assert(component.includes('PhaseClock'), 'Projection must use phase clock, not a 12-second switcher');
assert(component.includes('transitionMs') || liturgy.includes('transitionMs'), 'Slow transition durations must be explicit');
assert(audio.includes('sub') && audio.includes('lowMid') && audio.includes('silenceMs') && audio.includes('onset'), 'AudioEngine must expose the required ritual audio frame');
assert(!app.includes('lucide-react'), 'Projection app must not ship visible UI controls');
assert(css.split('\n').length <= 30, 'Heidi Rite CSS should stay minimal and projection-only');

console.log('Vespers for Heidi validation passed');
