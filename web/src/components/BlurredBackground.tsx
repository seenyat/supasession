import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { usePlayerStore } from "../stores/playerStore";

const SOURCE_SIZE = 512;
const FRAME_INTERVAL_MS = 1000 / 30; // target ~30fps to cut fragment work
const DPR_CAP = 1.4; // blur tolerates slight upscaling; cap fill-rate

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_tempo;
uniform vec2 u_sourceSize;

varying vec2 v_uv;

const float PAN_SPEED = 0.022;
const float PAN_AMOUNT = 0.085;  // How far to pan (UV units)

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Poisson-disc blur: far fewer taps than stacked blur9, close visual match
vec3 poissonBlur(vec2 uv, vec2 texel, float radius) {
  vec2 offsets[8];
  offsets[0] = vec2(-0.326, -0.406);
  offsets[1] = vec2(-0.840, -0.074);
  offsets[2] = vec2(-0.696,  0.457);
  offsets[3] = vec2(-0.203,  0.621);
  offsets[4] = vec2( 0.962, -0.195);
  offsets[5] = vec2( 0.473, -0.480);
  offsets[6] = vec2( 0.519,  0.767);
  offsets[7] = vec2(-0.173, -0.770);

  vec3 col = texture2D(u_texture, uv).rgb * 0.28;
  for (int i = 0; i < 8; i++) {
    col += texture2D(u_texture, uv + offsets[i] * texel * radius).rgb * 0.09;
  }
  return col;
}

void main() {
  vec2 uv = v_uv;

  float tempoFactor = clamp(u_tempo / 120.0, 0.7, 1.5);
  float t = u_time * PAN_SPEED * tempoFactor;

  float panX = sin(t) * PAN_AMOUNT;
  float panY = cos(t) * PAN_AMOUNT * 0.6;  // Slightly less vertical movement

  vec2 panOffset = vec2(panX, panY);
  vec2 distortedUv = clamp(uv + panOffset, 0.0, 1.0);

  vec2 texel = 1.0 / u_sourceSize;

  vec3 nearBlur = poissonBlur(distortedUv, texel * 4.0, 1.0);
  vec3 farBlur = poissonBlur(distortedUv, texel * 12.0, 1.0);

  vec2 center = vec2(0.5, 0.45);
  vec2 dir = distortedUv - center;
  float dist = length(dir) + 1e-5;
  dir /= dist;

  float caStrength = 0.006 + dist * 0.004;
  vec2 caOffset = dir * caStrength;

  vec3 caColor = vec3(
    texture2D(u_texture, clamp(distortedUv + caOffset, 0.0, 1.0)).r,
    farBlur.g,
    texture2D(u_texture, clamp(distortedUv - caOffset, 0.0, 1.0)).b
  );

  vec3 color = mix(mix(nearBlur, farBlur, 0.55), caColor, 0.28);

  // Micro-texture via subtle noise (frosted glass surface irregularity)
  float micro = hash(distortedUv * 96.0 + u_time * 0.03) - 0.5;
  color += micro * 0.016;

  // Specular highlight (glass catching light)
  vec2 lightPos = vec2(0.25, 0.15);
  float dLight = length(uv - lightPos);
  float highlight = pow(max(0.0, 1.0 - dLight * 2.3), 3.2);
  color += vec3(0.12, 0.13, 0.15) * highlight;

  // Vignette + vertical gradient
  float vignette = smoothstep(0.95, 0.55, length(uv - vec2(0.5, 0.5)));
  float grad = 1.0 - (smoothstep(0.0, 0.28, uv.y) * 0.18 + smoothstep(1.0, 0.72, uv.y) * 0.26);
  color *= vignette * grad;

  // Frosted glass tone: soft but colorful
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(luma);
  color = mix(gray, color, 1.08);  // Boost saturation
  color = mix(color, vec3(luma + 0.05), 0.12);  // Subtle milky lift

  // Grain
  float grain = (hash(gl_FragCoord.xy + u_time * 55.0) - 0.5) * 0.045;
  color += grain;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export const BlurredBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const lastFrameMsRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);
  const isRunningRef = useRef(false);
  const isVisibleRef = useRef(true);

  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const vboRef = useRef<WebGLBuffer | null>(null);

  const uniformsRef = useRef<{
    resolution: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    tempo: WebGLUniformLocation | null;
    sourceSize: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
  } | null>(null);

  const attribsRef = useRef<{
    position: number;
    uv: number;
  } | null>(null);

  const currentTrack = usePlayerStore((s) => s.playerState.currentTrack);
  const tempo = usePlayerStore((s) => s.playerState.tempo);
  const albumArtData = currentTrack?.albumArtData;
  const albumArtUrl = currentTrack?.albumArtUrl;
  const [isLoaded, setIsLoaded] = useState(false);
  const tempoRef = useRef<number>(tempo ?? 120);

  useEffect(() => {
    tempoRef.current = tempo ?? 120;
  }, [tempo]);

  const initWebGL = (canvas: HTMLCanvasElement): boolean => {
    if (glRef.current) return true;

    // Ensure canvas has valid dimensions before getting context
    if (canvas.width < 1 || canvas.height < 1) {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
    }

    const gl = canvas.getContext("webgl", { premultipliedAlpha: false });
    if (!gl) {
      console.warn("[BlurredBackground] WebGL not supported");
      return false;
    }
    glRef.current = gl;

    const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    if (!program) return false;
    programRef.current = program;

    uniformsRef.current = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      tempo: gl.getUniformLocation(program, "u_tempo"),
      sourceSize: gl.getUniformLocation(program, "u_sourceSize"),
      texture: gl.getUniformLocation(program, "u_texture"),
    };

    const attribs = {
      position: gl.getAttribLocation(program, "a_position"),
      uv: gl.getAttribLocation(program, "a_uv"),
    };
    attribsRef.current = attribs;

    const vertices = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1,  1, 1, 1,
    ]);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    vboRef.current = vbo;

    // Vertex attrib setup is static; avoid re-applying every frame.
    gl.enableVertexAttribArray(attribs.position);
    gl.vertexAttribPointer(attribs.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(attribs.uv);
    gl.vertexAttribPointer(attribs.uv, 2, gl.FLOAT, false, 16, 8);

    return true;
  };

  const uploadTexture = (sourceCanvas: HTMLCanvasElement) => {
    const gl = glRef.current;
    if (!gl) return;

    let tex = textureRef.current;
    if (!tex) {
      tex = gl.createTexture();
      textureRef.current = tex;
    }

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  useEffect(() => {
    const imageSource = albumArtData || albumArtUrl;
    if (!imageSource || !canvasRef.current) return;

    const canvas = canvasRef.current;
    setIsLoaded(false);

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (!initWebGL(canvas)) return;

    const img = new Image();
    if (!albumArtData) {
      img.crossOrigin = "anonymous";
    }

    img.onload = () => {
      const resizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
        const w = Math.max(1, Math.round(window.innerWidth * dpr));
        const h = Math.max(1, Math.round(window.innerHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
          glRef.current?.viewport(0, 0, w, h);
        }
      };
      resizeCanvas();

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = SOURCE_SIZE;
      sourceCanvas.height = SOURCE_SIZE;
      const sourceCtx = sourceCanvas.getContext("2d");

      if (sourceCtx) {
        const scale = Math.max(SOURCE_SIZE / img.width, SOURCE_SIZE / img.height);
        const x = (SOURCE_SIZE - img.width * scale) / 2;
        const y = (SOURCE_SIZE - img.height * scale) / 2;
        sourceCtx.drawImage(img, x, y, img.width * scale, img.height * scale);
      }

      sourceCanvasRef.current = sourceCanvas;
      startTimeRef.current = performance.now() / 1000;
      lastFrameMsRef.current = 0;
      elapsedRef.current = 0;

      uploadTexture(sourceCanvas);
      setIsLoaded(true);
      isRunningRef.current = true;
      render();
    };

    img.onerror = () => {
      console.warn("[BlurredBackground] Failed to load image");
      setIsLoaded(false);
    };

    img.src = imageSource;

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
      }
      isRunningRef.current = false;
    };
  }, [albumArtData, albumArtUrl]);

  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current || !glRef.current) return;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      const w = Math.max(1, Math.round(window.innerWidth * dpr));
      const h = Math.max(1, Math.round(window.innerHeight * dpr));
      if (canvasRef.current.width !== w || canvasRef.current.height !== h) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
        glRef.current.viewport(0, 0, w, h);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = !document.hidden;
      if (!isVisibleRef.current) {
        isRunningRef.current = false;
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = 0;
        }
        return;
      }
      // keep phase continuous after resume
      startTimeRef.current = performance.now() / 1000 - elapsedRef.current;
      lastFrameMsRef.current = 0;
      if (!animationRef.current) {
        isRunningRef.current = true;
        animationRef.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const render = () => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    const uniforms = uniformsRef.current;
    const attribs = attribsRef.current;
    const vbo = vboRef.current;
    const texture = textureRef.current;

    if (!canvas || !gl || !program || !uniforms || !attribs || !vbo || !texture || !isRunningRef.current) {
      if (isRunningRef.current) {
        animationRef.current = requestAnimationFrame(render);
      }
      return;
    }
    
    // Prevent GL errors when canvas has zero dimensions
    if (canvas.width < 1 || canvas.height < 1) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    const nowMs = performance.now();
    if (nowMs - lastFrameMsRef.current < FRAME_INTERVAL_MS) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }
    lastFrameMsRef.current = nowMs;

    const now = nowMs / 1000;
    const elapsed = now - startTimeRef.current;
    elapsedRef.current = elapsed;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.03, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.tempo, tempoRef.current);
    gl.uniform2f(uniforms.sourceSize, SOURCE_SIZE, SOURCE_SIZE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationRef.current = requestAnimationFrame(render);
  };

  return (
    <motion.div
      className="fixed inset-0 overflow-hidden z-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: isLoaded ? 1 : 0 }}
      transition={{ duration: 0.8 }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />
      <div className="absolute inset-0 bg-black/25" />
    </motion.div>
  );
};
