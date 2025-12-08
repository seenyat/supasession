import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { usePlayerStore } from "../stores/playerStore";

const SOURCE_SIZE = 512;

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

const float PAN_SPEED = 0.03;
const float PAN_AMOUNT = 0.08;  // How far to pan (UV units)

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 blur9(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 col = texture2D(tex, uv).rgb * 0.2270270270;
  col += texture2D(tex, uv + texel * vec2(0.0, 1.0)).rgb * 0.1945945946;
  col += texture2D(tex, uv + texel * vec2(0.0,-1.0)).rgb * 0.1945945946;
  col += texture2D(tex, uv + texel * vec2(1.0, 0.0)).rgb * 0.1216216216;
  col += texture2D(tex, uv + texel * vec2(-1.0,0.0)).rgb * 0.1216216216;
  col += texture2D(tex, uv + texel * vec2(1.0, 1.0)).rgb * 0.0540540541;
  col += texture2D(tex, uv + texel * vec2(-1.0,1.0)).rgb * 0.0540540541;
  col += texture2D(tex, uv + texel * vec2(1.0,-1.0)).rgb * 0.0540540541;
  col += texture2D(tex, uv + texel * vec2(-1.0,-1.0)).rgb * 0.0540540541;
  return col;
}

// Deep frosted blur: heavy multi-radius stacking
vec3 frostedBlur(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 c1 = blur9(tex, uv, texel * 8.0);
  vec3 c2 = blur9(tex, uv, texel * 14.0);
  vec3 c3 = blur9(tex, uv, texel * 22.0);
  vec3 c4 = blur9(tex, uv, texel * 30.0);
  return (c1 * 0.15 + c2 * 0.25 + c3 * 0.30 + c4 * 0.30);
}

void main() {
  vec2 uv = v_uv;

  // Gentle circular orbit - consistent slow pan
  float t = u_time * PAN_SPEED;
  
  // Simple circular motion for even, predictable drift
  float panX = sin(t) * PAN_AMOUNT;
  float panY = cos(t) * PAN_AMOUNT * 0.6;  // Slightly less vertical movement
  
  vec2 panOffset = vec2(panX, panY);
  vec2 distortedUv = clamp(uv + panOffset, 0.0, 1.0);

  vec2 texel = 1.0 / u_sourceSize;

  // Heavy multi-radius blur for deep frosted diffusion
  vec3 blurred = frostedBlur(u_texture, distortedUv, texel);

  // Chromatic aberration (subtle, blurred channels)
  vec2 center = vec2(0.5, 0.45);
  vec2 dir = distortedUv - center;
  float dist = length(dir);
  dir = normalize(dir + 0.0001);

  float caStrength = 0.008 + dist * 0.006;
  vec2 caOffset = dir * caStrength;

  float r = blur9(u_texture, clamp(distortedUv + caOffset, 0.0, 1.0), texel * 5.0).r;
  float g = blurred.g;
  float b = blur9(u_texture, clamp(distortedUv - caOffset, 0.0, 1.0), texel * 5.0).b;
  vec3 caColor = vec3(r, g, b);

  vec3 color = mix(blurred, caColor, 0.25);

  // Micro-texture via subtle noise (frosted glass surface irregularity)
  float n = hash(distortedUv * 80.0 + u_time * 0.02);
  float n2 = hash(distortedUv * 120.0 - u_time * 0.025);
  vec2 microOffset = (vec2(n, n2) - 0.5) * 0.004;
  vec3 microDetail = frostedBlur(u_texture, clamp(distortedUv + microOffset, 0.0, 1.0), texel);
  color = mix(color, microDetail, 0.3);

  // Specular highlight (glass catching light)
  vec2 lightPos = vec2(0.25, 0.15);
  float dLight = length(uv - lightPos);
  float highlight = pow(max(0.0, 1.0 - dLight * 2.0), 3.5);
  color += vec3(0.14, 0.15, 0.17) * highlight;

  // Vignette + vertical gradient
  float vignette = smoothstep(0.9, 0.4, length(uv - vec2(0.5, 0.5)));
  float topDarken = smoothstep(0.0, 0.3, uv.y);
  float bottomDarken = smoothstep(1.0, 0.7, uv.y);
  float grad = 1.0 - (topDarken * 0.25 + bottomDarken * 0.35);
  color *= vignette * grad;

  // Frosted glass tone: soft but colorful
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(luma);
  color = mix(gray, color, 1.15);  // Boost saturation
  color = mix(color, vec3(luma + 0.06), 0.12);  // Subtle milky lift
  color *= 1.08;

  // Grain
  float grain = (hash(gl_FragCoord.xy + u_time * 60.0) - 0.5) * 0.06;
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

  const initWebGL = (canvas: HTMLCanvasElement): boolean => {
    if (glRef.current) return true;

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

    attribsRef.current = {
      position: gl.getAttribLocation(program, "a_position"),
      uv: gl.getAttribLocation(program, "a_uv"),
    };

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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

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

      uploadTexture(sourceCanvas);
      setIsLoaded(true);
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
      }
    };
  }, [albumArtData, albumArtUrl]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && glRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        glRef.current.viewport(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const render = () => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    const uniforms = uniformsRef.current;
    const attribs = attribsRef.current;
    const vbo = vboRef.current;
    const texture = textureRef.current;

    if (!canvas || !gl || !program || !uniforms || !attribs || !vbo || !texture) {
      animationRef.current = requestAnimationFrame(render);
      return;
    }

    const now = performance.now() / 1000;
    const elapsed = now - startTimeRef.current;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.02, 0.03, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.tempo, tempo ?? 120);
    gl.uniform2f(uniforms.sourceSize, SOURCE_SIZE, SOURCE_SIZE);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.texture, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(attribs.position);
    gl.vertexAttribPointer(attribs.position, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(attribs.uv);
    gl.vertexAttribPointer(attribs.uv, 2, gl.FLOAT, false, 16, 8);

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
      <div className="absolute inset-0 bg-black/20" />
    </motion.div>
  );
};
