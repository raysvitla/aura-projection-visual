import { Maximize2, Mic, MicOff, Radio, Sparkles } from 'lucide-react';

type BackgroundMode = 'auto' | 'legacy' | 'rose';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
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
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('auto');
  const [status, setStatus] = useState('Autopilot is always running. Mic adds soft movement; any key nudges the scene.');

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.key === '1') {
        setBackgroundMode('auto');
        setStatus('Background mode: auto. Slowly crossfading between scenes.');
        return;
      }

      if (event.key === '2') {
        setBackgroundMode('legacy');
        setStatus('Background mode: silk. Locked to the darker cloth scene.');
        return;
      }

      if (event.key === '3') {
        setBackgroundMode('rose');
        setStatus('Background mode: rose. Locked to the spectral bloom scene.');
        return;
      }

      audio.triggerImpulse(0.28);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      audio.disableMic();
    };
  }, [audio]);

  const toggleMic = async () => {
    if (audio.getMode() === 'mic') {
      audio.disableMic();
      setStatus('Mic off. Back to autopilot.');
      setReactive((previous) => ({ ...previous, mode: 'autopilot' }));
      return;
    }

    try {
      await audio.enableMic();
      setStatus('Mic on. Bass breathes, mids steer the fabric, highs tickle the edges.');
    } catch (error) {
      console.error(error);
      setStatus('Mic blocked or unavailable. Staying in autopilot.');
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

  const setMode = (mode: BackgroundMode) => {
    setBackgroundMode(mode);
    if (mode === 'auto') setStatus('Background mode: auto. Slowly crossfading between scenes.');
    if (mode === 'legacy') setStatus('Background mode: silk. Locked to the darker cloth scene.');
    if (mode === 'rose') setStatus('Background mode: rose. Locked to the spectral bloom scene.');
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#080509' }}>
      <Visualizer audio={audio} onReactiveState={setReactive} backgroundMode={backgroundMode} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          transition: 'opacity 420ms ease',
          opacity: isFullscreen ? 0 : 1,
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
            maxWidth: 440,
            padding: '14px 16px',
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(8,5,9,0.62)',
            backdropFilter: 'blur(18px)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.26)',
          }}
        >
          <div style={{ fontSize: 12, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgba(255,243,238,0.6)' }}>AURA</div>
          <div style={{ fontSize: 15, color: 'rgba(255,243,238,0.82)' }}>Dark, slow, audio-reactive projection visual.</div>
          <div style={{ fontSize: 12, color: 'rgba(255,243,238,0.48)', lineHeight: 1.5 }}>{status}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,243,238,0.42)' }}>1 auto · 2 silk · 3 rose</div>
        </div>

        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 12,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ModeButton active={backgroundMode === 'auto'} onClick={() => setMode('auto')} label="auto" />
            <ModeButton active={backgroundMode === 'legacy'} onClick={() => setMode('legacy')} label="silk" />
            <ModeButton active={backgroundMode === 'rose'} onClick={() => setMode('rose')} label="rose" />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <ControlButton onClick={toggleMic} title={reactive.mode === 'mic' ? 'Disable microphone' : 'Enable microphone'}>
              {reactive.mode === 'mic' ? <Mic size={18} /> : <MicOff size={18} />}
            </ControlButton>
            <ControlButton onClick={toggleFullscreen} title="Toggle fullscreen">
              <Maximize2 size={18} />
            </ControlButton>
          </div>
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

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? 'rgba(255,212,228,0.34)' : 'rgba(255,255,255,0.12)'}`,
        background: active ? 'rgba(255,169,204,0.16)' : 'rgba(14,10,16,0.4)',
        color: 'rgba(255,243,238,0.88)',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        backdropFilter: 'blur(16px)',
        cursor: 'pointer',
      }}
    >
      {label}
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
