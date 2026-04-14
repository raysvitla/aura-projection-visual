import { useEffect, useRef } from 'react';

type GlyphOverlayProps = {
  intensity: number;
};

const GLYPHS = ['+', '×', ':', '/', '[ ]', '01', 'A', 'R', '//', '::'];

function fract(value: number) {
  return value - Math.floor(value);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function noise(x: number, y: number, t: number) {
  const a = fract(Math.sin(x * 12.9898 + y * 78.233 + t * 0.12) * 43758.5453);
  const b = fract(Math.sin(x * 4.123 + y * 17.71 + t * 0.05) * 15731.743);
  return (a + b) * 0.5;
}

export default function GlyphOverlay({ intensity }: GlyphOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const t = performance.now() * 0.001;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const cell = Math.max(92, Math.min(148, width / 8));
      const cols = Math.ceil(width / cell) + 1;
      const rows = Math.ceil(height / cell) + 1;

      ctx.clearRect(0, 0, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < cols; x += 1) {
          const n = noise(x + 1.37, y + 2.11, t);
          const reveal = Math.sin((x * 0.82 + y * 1.17) + t * 0.11);
          if (n < 0.58 || reveal < -0.24) continue;

          const px = x * cell + Math.sin(t * 0.05 + y) * 18;
          const py = y * cell + Math.cos(t * 0.04 + x * 0.7) * 14;
          const glyph = GLYPHS[Math.floor(n * GLYPHS.length) % GLYPHS.length];
          const size = 18 + n * 26;
          const alpha = clamp((n - 0.58) * 1.9, 0.08, 0.42) * (0.55 + intensity * 0.7);

          const gradient = ctx.createLinearGradient(px - size, py - size, px + size, py + size);
          gradient.addColorStop(0, `rgba(170, 255, 232, ${alpha * 0.95})`);
          gradient.addColorStop(0.5, `rgba(255, 246, 210, ${alpha * 0.72})`);
          gradient.addColorStop(1, `rgba(255, 154, 224, ${alpha})`);

          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.sin(t * 0.03 + x * 0.4 + y * 0.3) * 0.18);
          ctx.font = `600 ${size}px "IBM Plex Mono", "Fira Code", monospace`;
          ctx.fillStyle = gradient;
          ctx.shadowBlur = 18;
          ctx.shadowColor = `rgba(140,255,230,${alpha * 0.6})`;
          ctx.fillText(glyph, 0, 0);
          ctx.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        opacity: 0.62,
      }}
    />
  );
}
