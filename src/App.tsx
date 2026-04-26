import { useEffect, useMemo } from 'react';
import HeidiRiteVisualizer from './components/HeidiRiteVisualizer';
import { AudioEngine } from './lib/AudioEngine';

export default function App() {
  const audio = useMemo(() => new AudioEngine(), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
        else void document.exitFullscreen();
      }

      if (event.key.toLowerCase() === 'm') {
        if (audio.getMode() === 'mic') audio.disableMic();
        else void audio.enableMic().catch(() => audio.disableMic());
      }

      if (event.key === ' ') audio.triggerImpulse(0.5);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      audio.disableMic();
    };
  }, [audio]);

  return <HeidiRiteVisualizer audio={audio} />;
}
