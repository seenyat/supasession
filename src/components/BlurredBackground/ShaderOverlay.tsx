import React, { useEffect, useRef } from 'react';

/**
 * Lightweight WebGL fragment shader overlay that runs the provided
 * animated gradient/noise shader. Alpha is low so it sits over the
 * blurred album art without overpowering it.
 */
const ShaderOverlay: React.FC<{ className?: string }> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false }) ||
      canvas.getContext('experimental-webgl', {
        alpha: true,
        premultipliedAlpha: false,
      });
    if (!gl) return;

    const vertexSrc = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragmentSrc = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;

      vec3 sampleColor(vec2 coord, float time, float freqMultiplier, vec3 offset) {
          return 0.5 + 0.5 * cos(time + coord.xyx * freqMultiplier + offset);
      }

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }

      float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for(int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.0;
              a *= 0.5;
          }
          return v;
      }

      void main() {
          vec2 uv = gl_FragCoord.xy / iResolution.xy;
          // keep aspect-stable distortion
          uv.x *= iResolution.x / iResolution.y;

          // gentle linear drift
          vec2 drift = vec2(0.018, -0.012) * iTime;
          vec2 coord = uv + drift;

          float t = iTime * 0.8;

          vec3 color1 = sampleColor(coord, t, 1.2, vec3(0.0, 2.0, 4.0));
          vec3 color2 = sampleColor(coord, t * 0.7, 2.4, vec3(1.0, 3.0, 5.0));

          // warp with fbm to sit nicely over the blurred art
          vec2 warp = vec2(
            fbm(coord * 2.5 + t * 0.2),
            fbm(coord * 2.5 - t * 0.15 + 31.0)
          );
          vec2 distorted = coord + (warp - 0.5) * 0.18;

          vec3 color3 = sampleColor(distorted, t * 1.1, 1.5, vec3(0.0, 2.0, 4.0));
          vec3 color4 = sampleColor(distorted, t * 0.6, 2.2, vec3(1.0, 3.0, 5.0));

          vec3 baseColor = mix(
            color1,
            color2,
            0.5 + 0.5 * sin(uv.x * 3.14159 + t)
          );

          vec3 finalColor = mix(
            mix(color3, color4, 0.5 + 0.5 * sin((distorted.x + distorted.y) * 1.6 + t)),
            baseColor,
            0.6
          );

          // subtle glow stripes moving vertically for extra parallax
          finalColor += 0.06 * vec3(
            0.5 + 0.5 * sin(uv.y * 8.0 + t * 1.3),
            0.5 + 0.5 * sin(uv.x * 7.0 - t * 1.05),
            0.5 + 0.5 * sin((uv.x + uv.y) * 6.5 + t * 0.9)
          );

          // desaturate slightly; keep alpha low so underlying art shows
          float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
          finalColor = mix(finalColor, vec3(luminance), 0.65);

          gl_FragColor = vec4(finalColor, 0.32);
      }
    `;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Failed to create shader');
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) || 'Shader compile error');
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn(gl.getProgramInfoLog(program));
      return;
    }

    const positionLoc = gl.getAttribLocation(program, 'position');
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // two triangles covering clipspace
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const iResolutionLoc = gl.getUniformLocation(program, 'iResolution');
    const iTimeLoc = gl.getUniformLocation(program, 'iTime');

    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      const nextW = Math.round(width * dpr);
      const nextH = Math.round(height * dpr);
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
        gl.viewport(0, 0, nextW, nextH);
      }
    };

    let start = performance.now();
    const loop = (now: number) => {
      frameRef.current = requestAnimationFrame(loop);
      resize();
      gl.useProgram(program);
      gl.uniform2f(iResolutionLoc, canvas.width, canvas.height);
      gl.uniform1f(iTimeLoc, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    frameRef.current = requestAnimationFrame(loop);

    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', handleResize);
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
};

export default ShaderOverlay;
