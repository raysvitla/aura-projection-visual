import { Maximize2, Mic, MicOff, Radio, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import GlyphOverlay from './components/GlyphOverlay';
import Visualizer from './components/Visualizer';
import { AudioEngine, ReactiveState } from './lib/AudioEngine';

const initialReactiveState: ReactiveState = {
  bass: 0.2,
  flow: 0.22,
  shimmer: 0.1,
  energy: 0.18,
  impulse: 0,
  mode: 'autopilot',
  micAvailable: false,
};

export default function App() {
  const audio = useMemo(() => new AudioEngine(), []);
  const [reactive, setReactive] = useState<ReactiveState>(initialReactiveState);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [status, setStatus] = useState('Autopilot running. Mic adds soft movement; keys add little nudges.');
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const showUi = () => {
      setUiVisible(true);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setUiVisible(false), 2600);
    };

    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      audio.triggerImpulse(0.28);
      showUi();
    };

    window.addEventListener('mousemove', showUi);
    window.addEventListener('pointerdown', showUi);
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    showUi();

    return () => {
      window.removeEventListener('mousemove', showUi);
      window.removeEventListener('pointerdown', showUi);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (idleTimer.current) window.clearTimeout(idleTimer.current);
      audio.disableMic();
    };
  }, [audio]);

  const toggleMic = async () => {
    if (audio.getMode() === 'mic') {
      audio.disableMic();
      setStatus('Mic off. Back to autopilot — still sexy, just less obedient.');
      setReactive((previous) => ({ ...previous, mode: 'autopilot' }));
      return;
    }

    try {
      await audio.enableMic();
      setStatus('Mic on. Bass breathes, mids steer the fabric, highs tickle the edges.');
    } catch (error) {
      console.error(error);
      setStatus('Mic blocked or unavailable. Staying in autopilot instead of dying like a dumb app.');
      audio.disableMic();
    }
  };

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }

    await document.exitFullscreen();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#090509' }}>
      <Visualizer audio={audio} onReactiveState={setReactive} />
      <GlyphOverlay intensity={reactive.shimmer + reactive.impulse * 0.8} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transition: 'opacity 420ms ease',
          opacity: uiVisible ? 1 : 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(8,5,9,0.42) 0%, rgba(8,5,9,0.0) 18%, rgba(8,5,9,0.0) 76%, rgba(8,5,9,0.36) 100%)',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            maxWidth: 420,
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,243,238,0.6)' }}>AURA</div>
          <div style={{ fontSize: 15, color: 'rgba(255,243,238,0.82)' }}>Dark, slow, projector-safe. A little toxic, in a good way.</div>
          <div style={{ fontSize: 12, color: 'rgba(255,243,238,0.48)', lineHeight: 1.5 }}>{status}</div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 24,
            display: 'flex',
            gap: 12,
            pointerEvents: 'auto',
          }}
        >
          <ControlButton onClick={toggleMic} title={reactive.mode === 'mic' ? 'Disable microphone' : 'Enable microphone'}>
            {reactive.mode === 'mic' ? <Mic size={18} /> : <MicOff size={18} />}
          </ControlButton>
          <ControlButton onClick={toggleFullscreen} title="Toggle fullscreen">
            <Maximize2 size={18} />
          </ControlButton>
        </div>

        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 22,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            fontSize: 11,
            color: 'rgba(255,243,238,0.54)',
          }}
        >
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip icon={<Radio size={12} />} label={reactive.mode === 'mic' ? 'mic reactive' : 'autopilot'} active={reactive.mode === 'mic'} />
            <Chip icon={<Sparkles size={12} />} label="any key = soft impulse" active={reactive.impulse > 0.05} />
            {isFullscreen && <Chip label="fullscreen" active />}
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Metric label="bass" value={reactive.bass} />
            <Metric label="flow" value={reactive.flow} />
            <Metric label="acid" value={reactive.shimmer} />
          </div>
        </div>
      </div>
    </div>
  );
}

type ControlButtonProps = {
  children: ReactNode;
  title: string;
  onClick: () => void | Promise<void>;
};

function ControlButton({ children, title, onClick }: ControlButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      title={title}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(14,10,16,0.46)',
        color: 'rgba(255,243,238,0.9)',
        display: 'grid',
        placeItems: 'center',
        backdropFilter: 'blur(18px)',
        cursor: 'pointer',
        boxShadow: '0 10px 30px rgba(0,0,0,0.24)',
      }}
    >
      {children}
    </button>
  );
}

type ChipProps = {
  label: string;
  active?: boolean;
  icon?: ReactNode;
};

function Chip({ label, active = false, icon }: ChipProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 11px',
        borderRadius: 999,
        border: `1px solid ${active ? 'rgba(145,255,244,0.32)' : 'rgba(255,255,255,0.1)'}`,
        background: active ? 'rgba(76, 226, 199, 0.12)' : 'rgba(14,10,16,0.34)',
        backdropFilter: 'blur(16px)',
      }}
    >
      {icon}
      <span>{label}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const width = `${Math.round(Math.max(10, Math.min(100, value * 100)))}%`;

  return (
    <div style={{ minWidth: 84, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <span>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <div style={{ width: 84, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.09)', overflow: 'hidden' }}>
        <div
          style={{
            width,
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(255,158,201,0.9), rgba(117,255,235,0.95))',
            boxShadow: '0 0 14px rgba(122,255,232,0.32)',
          }}
        />
      </div>
    </div>
  );
}
