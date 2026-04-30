# AURA — Projection Visual

A dark, slow, projector-safe WebGL visual for DJ sets and room installations.

AURA runs beautifully without setup in autopilot mode, then adds optional microphone reactivity for bass, flow, shimmer, and soft keyboard impulses. It is built as a lean Vite/React/Three.js app — no generated product-demo shell or UI-kit baggage.

Live site: https://raysvitla.github.io/aura-projection-visual/

## Controls

- `1` — auto mode: slow crossfade between scenes
- `2` — silk mode: darker cloth/glyph scene
- `3` — rose mode: spectral bloom scene
- any other key — soft visual impulse
- mic button — optional audio reactivity
- fullscreen button — projection mode

## Ray Svitla

- Embassy: https://embassy.svit.la
- Studio: https://svit.la
- GitHub: https://github.com/raysvitla
- X: https://x.com/ray_svitla

## Development

```bash
npm install
npm run dev
npm run build
```

The app is configured for GitHub Pages under `/aura-projection-visual/` via `vite.config.ts`.
