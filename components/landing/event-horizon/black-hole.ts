/**
 * The intro's black hole, ray-traced in one WebGL2 pass: each pixel's ray bends around a
 * Schwarzschild hole (radius 1), lights up where it crosses the golden accretion disk and
 * otherwise picks up the lensed stars behind it. The disk's near side is Doppler-boosted.
 * With `reveal`, rays that fall into the hole turn transparent: whatever sits under the canvas
 * shows through the event horizon, with the disk still passing in front of it.
 */

export type HoleView = {
  /** Seconds since the intro started. */
  time: number;
  /** Camera distance, in horizon radii. */
  distance: number;
  /** Focal length; raising it zooms into the shadow. */
  focal: number;
  /** Camera height over the disk, in radians. */
  tilt: number;
  /** Disk light, 0 to 1. */
  disk: number;
  /** How see-through the shadow is, 0 to 1. */
  reveal: number;
  exposure: number;
  /** Pointer offset from the center, -1 to 1, for a slight parallax. */
  lookX: number;
  lookY: number;
};

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDistance;
uniform float uFocal;
uniform float uTilt;
uniform float uDisk;
uniform float uReveal;
uniform float uExposure;
uniform vec2 uLook;
out vec4 outColor;

const float INNER = 2.35;
const float OUTER = 11.0;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amp *= 0.5;
  }
  return sum;
}

vec3 sky(vec3 d) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = 70.0 + float(layer) * 85.0;
    vec3 p = d * scale;
    vec3 cell = floor(p);
    float h = hash13(cell + float(layer) * 37.0);
    if (h > 0.965) {
      vec3 jitter = vec3(hash13(cell + 1.3), hash13(cell + 2.9), hash13(cell + 4.7)) - 0.5;
      float dist = length(fract(p) - 0.5 - jitter * 0.55);
      float size = 0.05 + 0.11 * hash13(cell + 6.1);
      float glint = smoothstep(size, 0.0, dist);
      vec3 tint = mix(vec3(1.0, 0.84, 0.58), vec3(0.78, 0.86, 1.0), hash13(cell + 8.3));
      float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h) + h * 40.0);
      col += tint * glint * twinkle * (0.35 + 1.6 * (h - 0.965) / 0.035);
    }
  }
  float dust = fbm(d * 2.4 + vec3(0.0, 3.0, uTime * 0.015));
  col += vec3(0.22, 0.13, 0.04) * pow(dust, 3.5) * 0.9;
  return col;
}

vec4 disk(vec3 hit, vec3 dir) {
  float r = length(hit.xz);
  float x = (r - INNER) / (OUTER - INNER);
  float a = atan(hit.z, hit.x) + uTime * 2.2 / pow(r, 1.5);
  vec2 ring = vec2(cos(a), sin(a)) * 1.4;
  float gas = fbm(vec3(ring, r * 2.6 - uTime * 0.12));
  float streak = fbm(vec3(ring * 3.0, r * 9.0));
  float density = smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.3, 1.0, x));
  density *= 0.35 + 1.1 * gas * (0.6 + 0.8 * streak);

  vec3 hot = vec3(1.0, 0.96, 0.84);
  vec3 col = mix(hot, vec3(0.98, 0.8, 0.09), smoothstep(0.0, 0.18, x));
  col = mix(col, vec3(0.92, 0.5, 0.05), smoothstep(0.18, 0.5, x));
  col = mix(col, vec3(0.45, 0.13, 0.02), smoothstep(0.5, 1.0, x));

  // The side that turns toward the camera is brighter and whiter.
  vec3 flow = normalize(vec3(-hit.z, 0.0, hit.x));
  float shift = 1.0 / max(1.0 - 0.5 / sqrt(r) * dot(flow, -normalize(dir)), 0.25);
  col = mix(col * vec3(1.0, 0.72, 0.42), mix(col, hot, 0.35), smoothstep(0.7, 1.4, shift));
  float heat = 2.6 * (1.0 - 0.75 * x) * sqrt(max(1.0 - 1.0 / r, 0.0)) * pow(shift, 2.6);
  return vec4(col * density * heat, clamp(density * 1.15, 0.0, 0.96));
}

void main() {
  float unit = min(uResolution.x, uResolution.y);
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / unit;
  float roll = -0.14;
  vec2 view = mat2(cos(roll), sin(roll), -sin(roll), cos(roll)) * uv;
  float tilt = uTilt + uLook.y * 0.025;
  float yaw = uLook.x * 0.06;
  vec3 eye = uDistance * vec3(sin(yaw) * cos(tilt), sin(tilt), -cos(yaw) * cos(tilt));
  vec3 forward = normalize(-eye);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
  vec3 up = cross(forward, right);
  vec3 dir = normalize(forward * uFocal + view.x * right + view.y * up);

  vec3 pos = eye;
  vec3 momentum = cross(pos, dir);
  float h2 = dot(momentum, momentum);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool captured = false;
  for (int i = 0; i < 220; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    if (r < 1.0) {
      captured = true;
      break;
    }
    float dt = clamp(0.065 * r, 0.012, 1.0);
    vec3 next = pos + dir * dt;
    dir += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    if (pos.y * next.y < 0.0) {
      vec3 hit = mix(pos, next, pos.y / (pos.y - next.y));
      float hr = length(hit.xz);
      if (hr > INNER && hr < OUTER) {
        vec4 light = disk(hit, dir);
        col += (1.0 - alpha) * light.rgb * uDisk;
        alpha += (1.0 - alpha) * light.a * uDisk;
        if (alpha > 0.985) break;
      }
    }
    pos = next;
    if (r > OUTER + 2.0 && r > uDistance * 0.5 && dot(pos, dir) > 0.0) break;
  }
  if (!captured && length(pos) < 2.6) captured = true;
  if (!captured) col += (1.0 - alpha) * sky(normalize(dir));

  // Bloom of the photon ring, sized to the shadow so it follows the zoom.
  float shadow = tan(asin(min(0.999, 2.598 / uDistance * sqrt(max(1.0 - 1.0 / uDistance, 0.0))))) * uFocal;
  float edge = length(view) - shadow;
  col += vec3(1.0, 0.78, 0.32) * uDisk * (0.5 * exp(-abs(edge) / (shadow * 0.035)) + 0.1 * exp(-max(edge, 0.0) / (shadow * 0.9)));

  // Premultiplied: inside a revealed shadow only the disk in front and the ring's glow remain.
  float cover = captured ? mix(1.0, alpha, uReveal) : 1.0;
  col = vec3(1.0) - exp(-col * uExposure);
  col += (hash13(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5) * 0.025 * cover;
  col *= 1.0 - 0.35 * cover * smoothstep(0.4, 1.2, length((gl_FragCoord.xy / uResolution - 0.5) * vec2(1.6, 1.0)));
  outColor = vec4(max(col, 0.0), cover);
}`;

const UNIFORMS = ["uResolution", "uTime", "uDistance", "uFocal", "uTilt", "uDisk", "uReveal", "uExposure", "uLook"] as const;

/** Radius of the hole's shadow on screen, as a fraction of the shorter side of the canvas. */
export function shadowRadius(distance: number, focal: number) {
  const sine = Math.min(0.999, (2.598 / distance) * Math.sqrt(Math.max(1 - 1 / distance, 0)));
  return Math.tan(Math.asin(sine)) * focal;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/** Draws on `canvas`, or returns null when the browser has no WebGL2 or the shader fails. */
export function createBlackHole(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
  if (!gl) return null;
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const u = Object.fromEntries(UNIFORMS.map(name => [name, gl.getUniformLocation(program, name)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(program);

  return {
    draw(view: HoleView) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, view.time);
      gl.uniform1f(u.uDistance, view.distance);
      gl.uniform1f(u.uFocal, view.focal);
      gl.uniform1f(u.uTilt, view.tilt);
      gl.uniform1f(u.uDisk, view.disk);
      gl.uniform1f(u.uReveal, view.reveal);
      gl.uniform1f(u.uExposure, view.exposure);
      gl.uniform2f(u.uLook, view.lookX, view.lookY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteProgram(program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
