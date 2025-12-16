import { useEffect, useRef } from "react";

/**
 * WebGL overlay with cosine/FBM gradient plus output dithering.
 * - If WebGL2 + EXT_color_buffer_float are available, it renders into a RGBA16F
 *   offscreen target and then blits with blue-noise dither to mask 8‑bit banding.
 * - Falls back to a single-pass WebGL(1/2) shader with inline dither.
 */
export const ShaderOverlay = ({ className }: { className?: string }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number>();
  const lastFrameMsRef = useRef(0);
  const elapsedRef = useRef(0);
  const isVisibleRef = useRef(true);

  const FRAME_INTERVAL_MS = 1000 / 30;
  const DPR_CAP = 1.6;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl2 = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: false,
    }) as WebGL2RenderingContext | null;

    const gl1 =
      gl2 ||
      (canvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
      }) as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl", {
        alpha: true,
        premultipliedAlpha: false,
      }) as WebGLRenderingContext | null);

    if (!gl1) return;

    const supportsFloat =
      gl2 !== null && !!gl2.getExtension("EXT_color_buffer_float");

    let startTimeMs = performance.now();
    let renderFn: ((time: number) => void) | null = null;

    // Shared vertex shader (position + uv)
    const vertexSrc = `
      attribute vec2 a_position;
      attribute vec2 a_uv;
      varying vec2 v_uv;
      void main() {
        v_uv = a_uv;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    // Scene shader (no dither; draws into offscreen when available)
    const sceneFragment = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      varying vec2 v_uv;

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
          uv.x *= iResolution.x / iResolution.y;

          vec2 drift = vec2(0.02, -0.01) * iTime;
          vec2 coord = uv + drift;
          float t = iTime * 0.85;

          vec3 color1 = sampleColor(coord, t, 1.0, vec3(0.0, 2.0, 4.0));
          vec3 color2 = sampleColor(coord, t * 0.7, 2.0, vec3(1.0, 3.0, 5.0));

          vec2 distortedUV = coord * 0.5 + 0.5 * vec2(
              fbm(coord + t * 0.2),
              fbm(coord + t * 0.2 + 31.0)
          );

          vec3 color3 = sampleColor(distortedUV, t, 1.0, vec3(0.0, 2.0, 4.0));
          vec3 color4 = sampleColor(distortedUV, t * 0.7, 2.0, vec3(1.0, 3.0, 5.0));

          vec3 baseColor = mix(
              color1,
              color2,
              0.5 + 0.5 * sin(uv.x * 3.14159 + t)
          );

          vec3 finalColor = mix(
              mix(color3, color4, 0.5 + 0.5 * sin((distortedUV.x + distortedUV.y) * 1.5 + t)),
              baseColor,
              0.7
          );

          finalColor += 0.05 * vec3(
              0.5 + 0.5 * sin(uv.y * 10.0 + t),
              0.5 + 0.5 * sin(uv.x * 8.0 + t * 1.1),
              0.5 + 0.5 * sin((uv.x + uv.y) * 9.0 + t * 0.9)
          );

          float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
          finalColor = mix(finalColor, vec3(luminance), 0.65);

          gl_FragColor = vec4(finalColor, 0.55);
      }
    `;

    // Blit shader (adds blue-noise dither on output)
    const blitFragment = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform float u_time;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

      void main() {
        vec3 color = texture2D(u_texture, v_uv).rgb;
        // 1–1.5 LSB of 8-bit to mask banding
        float dither = (hash(gl_FragCoord.xy + u_time * 60.0) - 0.5) * (1.5 / 255.0);
        color += dither;
        gl_FragColor = vec4(color, 0.55);
      }
    `;

    // Fallback single-pass shader with inline dither
    const fallbackFragment = `
      precision mediump float;
      uniform vec2 iResolution;
      uniform float iTime;
      varying vec2 v_uv;

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
          uv.x *= iResolution.x / iResolution.y;
          vec2 drift = vec2(0.02, -0.01) * iTime;
          vec2 coord = uv + drift;
          float t = iTime * 0.85;

          vec3 color1 = sampleColor(coord, t, 1.0, vec3(0.0, 2.0, 4.0));
          vec3 color2 = sampleColor(coord, t * 0.7, 2.0, vec3(1.0, 3.0, 5.0));

          vec2 distortedUV = coord * 0.5 + 0.5 * vec2(
              fbm(coord + t * 0.2),
              fbm(coord + t * 0.2 + 31.0)
          );

          vec3 color3 = sampleColor(distortedUV, t, 1.0, vec3(0.0, 2.0, 4.0));
          vec3 color4 = sampleColor(distortedUV, t * 0.7, 2.0, vec3(1.0, 3.0, 5.0));

          vec3 baseColor = mix(
              color1,
              color2,
              0.5 + 0.5 * sin(uv.x * 3.14159 + t)
          );

          vec3 finalColor = mix(
              mix(color3, color4, 0.5 + 0.5 * sin((distortedUV.x + distortedUV.y) * 1.5 + t)),
              baseColor,
              0.7
          );

          finalColor += 0.05 * vec3(
              0.5 + 0.5 * sin(uv.y * 10.0 + t),
              0.5 + 0.5 * sin(uv.x * 8.0 + t * 1.1),
              0.5 + 0.5 * sin((uv.x + uv.y) * 9.0 + t * 0.9)
          );

          float luminance = dot(finalColor, vec3(0.299, 0.587, 0.114));
          finalColor = mix(finalColor, vec3(luminance), 0.65);

          float dither = (hash(gl_FragCoord.xy + iTime * 60.0) - 0.5) * (1.5 / 255.0);
          finalColor += dither;

          gl_FragColor = vec4(finalColor, 0.55);
      }
    `;

    const compile = (gl: WebGLRenderingContext, type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Failed to create shader");
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile error");
      }
      return shader;
    };

    const createProgram = (
      gl: WebGLRenderingContext,
      vsSource: string,
      fsSource: string
    ) => {
      const program = gl.createProgram();
      if (!program) throw new Error("Failed to create program");
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vsSource));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fsSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? "Program link error");
      }
      return program;
    };

    // Geometry: two triangles with UVs
    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]);

    let cleanup = () => {};

    if (supportsFloat && gl2) {
      const gl = gl2;

      const sceneProgram = createProgram(gl, vertexSrc, sceneFragment);
      const blitProgram = createProgram(gl, vertexSrc, blitFragment);

      const sceneUniforms = {
        resolution: gl.getUniformLocation(sceneProgram, "iResolution"),
        time: gl.getUniformLocation(sceneProgram, "iTime"),
      };
      const blitUniforms = {
        texture: gl.getUniformLocation(blitProgram, "u_texture"),
        resolution: gl.getUniformLocation(blitProgram, "u_resolution"),
        time: gl.getUniformLocation(blitProgram, "u_time"),
      };

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const tex = gl.createTexture();
      const fbo = gl.createFramebuffer();

      const resizeTexture = (w: number, h: number) => {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA16F,
          w,
          h,
          0,
          gl.RGBA,
          gl.FLOAT,
          null
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          tex,
          0
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };

      // Attribute setup is static; compute once per program.
      const setupAttributes = (program: WebGLProgram) => {
        const posLoc = gl.getAttribLocation(program, "a_position");
        const uvLoc = gl.getAttribLocation(program, "a_uv");
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        if (posLoc !== -1) {
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        }
        if (uvLoc !== -1) {
          gl.enableVertexAttribArray(uvLoc);
          gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
        }
      };
      setupAttributes(sceneProgram);
      setupAttributes(blitProgram);

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          resizeTexture(w, h);
        }
      };

      startTimeMs = performance.now();
      lastFrameMsRef.current = 0;
      const render = (now: number) => {
        if (!isVisibleRef.current) return;
        if (now - lastFrameMsRef.current < FRAME_INTERVAL_MS) {
          frameRef.current = requestAnimationFrame(render);
          return;
        }
        lastFrameMsRef.current = now;
        resize();
        const time = (now - startTimeMs) / 1000;
        elapsedRef.current = time;

        // Scene into float FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.useProgram(sceneProgram);
        gl.uniform2f(sceneUniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(sceneUniforms.time, time);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Blit with dither to screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(blitProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(blitUniforms.texture, 0);
        gl.uniform2f(blitUniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(blitUniforms.time, time);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        frameRef.current = requestAnimationFrame(render);
      };

      renderFn = render;
      frameRef.current = requestAnimationFrame(render);
      window.addEventListener("resize", resize);
      resize(); // allocate texture immediately

      cleanup = () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        window.removeEventListener("resize", resize);
        gl.deleteProgram(sceneProgram);
        gl.deleteProgram(blitProgram);
        gl.deleteBuffer(buffer);
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
      };
    } else {
      // Fallback single-pass with inline dither
      const gl = gl1;
      const program = createProgram(gl, vertexSrc, fallbackFragment);
      const uniforms = {
        resolution: gl.getUniformLocation(program, "iResolution"),
        time: gl.getUniformLocation(program, "iTime"),
      };
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const posLoc = gl.getAttribLocation(program, "a_position");
      const uvLoc = gl.getAttribLocation(program, "a_uv");
      if (posLoc !== -1) {
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      }
      if (uvLoc !== -1) {
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
      }

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          gl.viewport(0, 0, w, h);
        }
      };

      startTimeMs = performance.now();
      lastFrameMsRef.current = 0;
      const render = (now: number) => {
        if (!isVisibleRef.current) return;
        if (now - lastFrameMsRef.current < FRAME_INTERVAL_MS) {
          frameRef.current = requestAnimationFrame(render);
          return;
        }
        lastFrameMsRef.current = now;
        resize();
        const time = (now - startTimeMs) / 1000;
        elapsedRef.current = time;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniforms.time, time);
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        frameRef.current = requestAnimationFrame(render);
      };

      renderFn = render;
      frameRef.current = requestAnimationFrame(render);
      window.addEventListener("resize", resize);
      resize();

      cleanup = () => {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        window.removeEventListener("resize", resize);
        gl.deleteProgram(program);
        gl.deleteBuffer(buffer);
      };
    }

    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (!isVisibleRef.current) {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = undefined;
        return;
      }
      lastFrameMsRef.current = 0;
      startTimeMs = performance.now() - elapsedRef.current * 1000;
      if (!frameRef.current && renderFn) {
        frameRef.current = requestAnimationFrame(renderFn);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      cleanup();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
};
