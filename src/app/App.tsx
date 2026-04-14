import React, { useEffect, useRef, useState } from 'react';
import { ThemeProvider, Button, SidebarNavigation, SidebarButton, Avatar } from '@figma/astraui';
import { Mic, MicOff, Maximize, Home, Film, Book, Folder, Settings, Maximize2 } from 'lucide-react';

const LOGO_SRC = `${import.meta.env.BASE_URL}logo.glb`;

const vertexShaderSource = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_bass; 
  uniform float u_mids; 
  uniform float u_highs;
  uniform float u_keyBurst;

  // Hash function for noise
  float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // 2D Value Noise
  float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i + vec2(0.0,0.0)), hash(i + vec2(1.0,0.0)), u.x),
                 mix(hash(i + vec2(0.0,1.0)), hash(i + vec2(1.0,1.0)), u.x), u.y);
  }

  // Fractal Brownian Motion
  float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.5;
      for (int i = 0; i < 5; i++) {
          value += amplitude * noise(p);
          p *= 2.0;
          amplitude *= 0.5;
      }
      return value;
  }

  void main() {
      // Normalize coords and adjust for aspect ratio
      vec2 uv = gl_FragCoord.xy / u_resolution.xy;
      vec2 p = uv * 2.0 - 1.0;
      p.x *= u_resolution.x / u_resolution.y;

      // Slow elegant time
      float t = u_time * 0.12;
      
      // Long-duration evolution: very slow drift of focal area over hours
      float longTime = u_time * 0.01;
      vec2 focalShift = vec2(sin(longTime * 1.3), cos(longTime * 0.8)) * 0.7;
      
      // We apply focal shift to the base coordinates to gradually migrate the composition
      p += focalShift;

      // Audio reactive base pressure/bloom
      float bassBloom = u_bass * 0.3;

      // Domain warping for flowing currents
      // Mids affect flow speed and current strength
      float currentStrength = 0.4 + (u_mids * 0.2) + (u_keyBurst * 0.5);
      vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(t, 0.0)));
      vec2 r = vec2(fbm(p + q + vec2(1.7, 9.2) + 0.15 * t), fbm(p + q + vec2(8.3, 2.8) + 0.12 * t));
      
      // Apply the warping to the coordinates
      vec2 warpedP = p + r * currentStrength;

      // Dark warm intimate background - made darker for projector contrast
      vec3 bg = vec3(0.02, 0.01, 0.02); 
      vec3 color = bg;

      // === MASS 1: Deep Oxblood Base ===
      // "lower-left can sometimes be dominant"
      // Creates a deep foundational weight
      float d1 = length(warpedP + vec2(0.5, 0.5)) * 1.2;
      float fold1 = smoothstep(1.5, 0.0, d1 + fbm(warpedP * 2.0) * 0.8);
      vec3 col1 = vec3(0.29, 0.0, 0.0); // oxblood
      color = mix(color, col1, fold1 * 0.8);

      // === MASS 2: Dusty Plum Translucent Shawl ===
      // Drifts softly across the middle
      float d2 = fbm(warpedP * 1.2 + t * 0.5);
      float fold2 = smoothstep(0.1, 0.8, sin(d2 * 5.0 + t));
      vec3 col2 = vec3(0.44, 0.26, 0.39); // dusty plum
      color = mix(color, col2, fold2 * 0.6);

      // === MASS 3: Blush / Champagne Silk Fold ===
      // "translucent shawls or veils"
      float d3 = fbm(warpedP * 1.8 - t * 0.4 + q);
      // Bass pressure causes the folds to expand slightly internally
      float fold3_val = d3 * 4.0 - t + bassBloom;
      float fold3 = smoothstep(0.2, 0.9, sin(fold3_val));
      vec3 col3 = vec3(0.87, 0.55, 0.6); // blush
      color = mix(color, col3, fold3 * 0.55);

      // === MASS 4: Cream / Luminous Silk Highlight ===
      // "layered folds, soft blur"
      float d4 = fbm(warpedP * 1.4 + t * 0.3 - r * 0.5);
      float fold4 = smoothstep(0.4, 0.95, sin(d4 * 3.5 - 2.0));
      vec3 col4 = vec3(0.98, 0.95, 0.85); // cream
      color = mix(color, col4, fold4 * 0.45);

      // === SHIMMER / SPARKLE SYSTEM ===
      // "glitter-like highlights... appear mostly on edges, folds, and bright contours"
      // We detect edges of the top layers by finding where the sine wave is near 1.0 (the peak of the fold)
      float edge3 = smoothstep(0.95, 1.0, sin(fold3_val));
      float edge4 = smoothstep(0.95, 1.0, sin(d4 * 3.5 - 2.0));
      float edges = max(edge3, edge4);
      
      // Add fine noise grain for the tactile "shimmer" feeling
      float shimmerNoise = pow(noise(p * 80.0 + t * 5.0), 8.0);
      
      // Highs drive the intensity of the shimmer
      float shimmerIntensity = 0.2 + (u_highs * 2.0) + (u_keyBurst * 1.5);
      float shimmer = edges * shimmerNoise * shimmerIntensity;
      
      // Acid / Gasoline iridescence on the edges
      // A cosine palette to create that cyan/magenta/yellow oil slick effect
      vec3 gasolineColor = 0.5 + 0.5 * cos(6.28318 * (t * 0.15 + warpedP.xyx + vec3(0.0, 0.33, 0.67)));
      // Mix the natural highlight with the gasoline iridescence
      vec3 edgeHighlight = mix(vec3(1.0, 0.92, 0.8), gasolineColor, 0.6 + u_keyBurst * 0.4);
      
      color += edgeHighlight * shimmer;
      
      // Add a broader acidic rim-light on the peaks of the folds
      color += gasolineColor * edges * (0.15 + u_mids * 0.3 + u_keyBurst * 0.2);

      // Vignette to keep it intimate and projector-friendly (avoids hard screen borders)
      float vignette = smoothstep(2.5, 0.3, length(uv * 2.0 - 1.0));
      color *= vignette;

      // Projector Contrast Adjustment (S-curve)
      color = color * color * (3.0 - 2.0 * color);
      color = smoothstep(0.01, 0.98, color);

      // Tactile grain / noise overlay for mixed-media texture
      float grain = noise(p * 200.0 + u_time) * 0.05;
      color += grain;

      gl_FragColor = vec4(color, 1.0);
  }
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader) {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasError, setHasError] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const useMockAudioRef = useRef<boolean>(false);

  // Initialize WebGL and render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = canvas.getContext('webgl', { 
      preserveDrawingBuffer: false,
      alpha: false,
      depth: false,
      antialias: false
    });
    
    if (!gl) {
      console.error("WebGL not supported");
      setHasError(true);
      return;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!vs || !fs) return;
    
    const program = createProgram(gl, vs, fs);
    if (!program) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const timeLocation = gl.getUniformLocation(program, "u_time");
    const bassLocation = gl.getUniformLocation(program, "u_bass");
    const midsLocation = gl.getUniformLocation(program, "u_mids");
    const highsLocation = gl.getUniformLocation(program, "u_highs");
    const keyBurstLocation = gl.getUniformLocation(program, "u_keyBurst");

    gl.useProgram(program);

    const resize = () => {
      // Scale according to the container size, not the full window (since sidebar takes space when not fullscreen)
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = rect.width * dpr;
      const height = rect.height * dpr;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    window.addEventListener('resize', resize);
    // Initial resize needs a small delay to let layout settle
    setTimeout(resize, 0);

    const startTime = performance.now();

    // Audio and Input smoothing buffers
    let smoothBass = 0;
    let smoothMids = 0;
    let smoothHighs = 0;
    let currentKeyBurst = 0;

    const handleKeyDown = () => {
      currentKeyBurst = 1.0;
    };
    window.addEventListener('keydown', handleKeyDown);

    const render = (now: number) => {
      const time = (now - startTime) * 0.001;
      
      let rawBass = 0;
      let rawMids = 0;
      let rawHighs = 0;

      if (analyserRef.current && dataArrayRef.current) {
        analyserRef.current.getByteFrequencyData(dataArrayRef.current);
        const data = dataArrayRef.current;
        
        for(let i=0; i<6; i++) rawBass += data[i];
        rawBass = (rawBass / 6) / 255.0;

        for(let i=6; i<46; i++) rawMids += data[i];
        rawMids = (rawMids / 40) / 255.0;

        for(let i=46; i<150; i++) rawHighs += data[i];
        rawHighs = (rawHighs / 104) / 255.0;
      } else if (useMockAudioRef.current) {
        // Autopilot / Mock Audio Mode
        // Generate pseudo-random, pulsing values to simulate a low tempo atmospheric track
        const t1 = time * 0.8;
        const t2 = time * 1.5;
        const t3 = time * 2.3;

        rawBass = (Math.sin(t1) * 0.5 + 0.5) * 0.4 + (Math.sin(t1 * 2.1) * 0.5 + 0.5) * 0.3;
        rawMids = (Math.sin(t2) * 0.5 + 0.5) * 0.3 + (Math.sin(t2 * 1.3) * 0.5 + 0.5) * 0.2;
        rawHighs = (Math.sin(t3) * 0.5 + 0.5) * 0.2 + (Math.sin(t3 * 3.7) * 0.5 + 0.5) * 0.2;
        
        // Random "beat" impulses
        if (Math.random() > 0.98) rawBass += 0.5;
        if (Math.random() > 0.95) rawMids += 0.4;
        if (Math.random() > 0.90) rawHighs += 0.3;
      }

      // Smooth the audio values to prevent jitter
      smoothBass += (rawBass - smoothBass) * 0.05;
      smoothMids += (rawMids - smoothMids) * 0.08;
      smoothHighs += (rawHighs - smoothHighs) * 0.15;
      
      // Decay the key burst 
      currentKeyBurst += (0.0 - currentKeyBurst) * 0.05;

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform1f(timeLocation, time);
      gl.uniform1f(bassLocation, smoothBass);
      gl.uniform1f(midsLocation, smoothMids);
      gl.uniform1f(highsLocation, smoothHighs);
      gl.uniform1f(keyBurstLocation, currentKeyBurst);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render(performance.now());

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const initAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      
      useMockAudioRef.current = false;
      setAudioEnabled(true);
    } catch (err) {
      console.error("Audio access denied or unavailable:", err);
      alert("Microphone access is needed for real audio reactivity. Falling back to autopilot/mock mode.");
      useMockAudioRef.current = true;
      setAudioEnabled(true); // Act as if enabled to show the stop icon, which acts as "stop autopilot"
    }
  };

  const stopAudio = () => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
      analyserRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    useMockAudioRef.current = false;
    setAudioEnabled(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      // Let layout settle, then force resize on canvas
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (hasError) {
    return (
      <ThemeProvider>
        <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
          <p>WebGL initialization failed. This device may not support the required graphics features.</p>
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* Mandatory Astra UI Sidebar */}
        <SidebarNavigation
          footer={
            <>
              <SidebarButton icon={<Settings className="size-full" strokeWidth={1.5} />} />
              <Avatar type="text" fallback="DJ" size="medium" shape="circle" />
            </>
          }
        >
          <SidebarButton icon={<Home className="size-full" strokeWidth={1.5} />} active />
          <SidebarButton icon={<Film className="size-full" strokeWidth={1.5} />} />
          <SidebarButton icon={<Book className="size-full" strokeWidth={1.5} />} />
          <SidebarButton icon={<Folder className="size-full" strokeWidth={1.5} />} />
        </SidebarNavigation>

        {/* Main Content Area as required by Astra UI */}
        <main className="flex-1 bg-secondary flex flex-col items-center justify-center p-8 relative">
          
          <div className="absolute top-4 left-6 z-10 flex flex-col gap-2 opacity-50 pointer-events-none">
            <h1 className="text-xl font-medium tracking-tight text-foreground">Astra Visuals</h1>
            <p className="text-sm text-muted-foreground">Select "Fullscreen" for projection mode</p>
            <p className="text-xs text-muted-foreground mt-2">Type any key to trigger visual bursts</p>
          </div>

          {/* The Projection App Container */}
          <div 
            ref={containerRef}
            className="relative w-full max-w-6xl aspect-video rounded-lg overflow-hidden shadow-2xl bg-black border border-border flex-shrink-0"
            style={isFullscreen ? {
              maxWidth: '100%',
              width: '100vw',
              height: '100vh',
              borderRadius: '0',
              border: 'none',
              aspectRatio: 'auto'
            } : {}}
          >
            <canvas 
              ref={canvasRef} 
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
              <div
                className="relative flex h-[40%] w-[40%] min-h-[220px] min-w-[220px] max-h-[460px] max-w-[460px] items-center justify-center opacity-90"
                style={{ transform: 'translate3d(12%, -2%, 0)' }}
              >
                <model-viewer
                  src={LOGO_SRC}
                  camera-controls={false}
                  auto-rotate
                  auto-rotate-delay="0"
                  rotation-per-second="8deg"
                  interaction-prompt="none"
                  disable-zoom
                  disable-pan
                  shadow-intensity="0"
                  exposure="1.15"
                  environment-image="neutral"
                  style={{
                    width: '100%',
                    height: '100%',
                    background: 'transparent',
                    filter: 'drop-shadow(0 0 32px rgba(255,235,210,0.12)) drop-shadow(0 0 90px rgba(217,126,169,0.16))',
                    mixBlendMode: 'screen',
                    pointerEvents: 'none'
                  }}
                />
              </div>
            </div>
            
            {/* Always-visible UI layer */}
            <div 
              className="absolute bottom-6 right-6 flex items-center gap-4 transition-opacity duration-300"
              style={{ zIndex: 10, opacity: isFullscreen ? 0.3 : 1 }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = isFullscreen ? '0.3' : '1' }}
            >
              <div className="relative z-10 flex gap-4 bg-background/80 backdrop-blur-md px-4 py-2 rounded-full shadow-lg border border-border">
                <Button 
                  variant="subtle" 
                  onClick={audioEnabled ? stopAudio : initAudio}
                  className="!p-2 min-w-0"
                  title={audioEnabled ? "Disable audio reactivity" : "Enable microphone"}
                >
                  {audioEnabled ? <Mic className="h-5 w-5 text-primary" /> : <MicOff className="h-5 w-5 text-muted-foreground" />}
                </Button>
                
                <Button 
                  variant="subtle" 
                  onClick={toggleFullscreen}
                  className="!p-2 min-w-0"
                  title="Toggle fullscreen projection"
                >
                  {isFullscreen ? (
                    <Maximize2 className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  ) : (
                    <Maximize className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}