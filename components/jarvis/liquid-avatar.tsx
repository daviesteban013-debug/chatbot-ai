"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { AvatarState } from "@/types/jarvis";
import styles from "./liquid-avatar.module.css";

interface LiquidAvatarProps {
  powered: boolean;
  state: AvatarState;
  accent: string;
  onActivate: () => void;
}

/** A real deformable mesh, with a CSS avatar when WebGL is unavailable. */
export function JarvisLiquidAvatar({ powered, state, accent, onActivate }: LiquidAvatarProps) {
  const hostRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const presentation = useRef({ powered, state, accent });
  const update = useRef<() => void>(() => {});
  const touch = useRef<() => void>(() => {});
  useEffect(() => { presentation.current = { powered, state, accent }; update.current(); }, [powered, state, accent]);

  useEffect(() => {
    const host = hostRef.current, container = canvasRef.current;
    if (!host || !container) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = { x: 0, y: 0, currentX: 0, currentY: 0 };
    let impulse = 0, visible = true, frame: number | null = null, previous = 0, elapsed = 0;
    let renderer: THREE.WebGLRenderer | null = null, gpuLost = false;
    let environment: THREE.WebGLRenderTarget | null = null;
    let generator: THREE.PMREMGenerator | null = null;
    let room: RoomEnvironment | null = null;
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
    camera.position.z = 5.4;
    const body = new THREE.Group();
    scene.add(body);
    const time = { value: 0 }, amplitude = { value: .028 };
    const baseColor = new THREE.Color(presentation.current.accent);
    const metal = new THREE.MeshPhysicalMaterial({
      color: baseColor, metalness: .92, roughness: .16, clearcoat: 1,
      clearcoatRoughness: .08, envMapIntensity: 1.5,
      emissive: baseColor, emissiveIntensity: .035,
    });
    const eyeMaterial = new THREE.MeshStandardMaterial({
      color: "#fffbea", emissive: "#fff8d7", emissiveIntensity: 1.8, roughness: .2,
    });
    materials.push(metal, eyeMaterial);
    metal.onBeforeCompile = shader => {
      shader.uniforms.uLiquidTime = time;
      shader.uniforms.uLiquidAmplitude = amplitude;
      shader.vertexShader = `uniform float uLiquidTime; uniform float uLiquidAmplitude;\n${shader.vertexShader}`;
      shader.vertexShader = shader.vertexShader.replace("#include <beginnormal_vertex>", `
        #include <beginnormal_vertex>
        vec3 liquidDirection = normalize(position);
        vec3 liquidPhase = liquidDirection * vec3(3.1, 3.7, 3.4) + uLiquidTime * vec3(.7, -.55, .45);
        vec3 liquidSin = sin(liquidPhase);
        vec3 liquidCos = cos(liquidPhase);
        float liquidWave = liquidSin.x * liquidSin.y * liquidSin.z;
        vec3 liquidGradient = vec3(3.1 * liquidCos.x * liquidSin.y * liquidSin.z,
          3.7 * liquidSin.x * liquidCos.y * liquidSin.z, 3.4 * liquidSin.x * liquidSin.y * liquidCos.z);
        objectNormal = normalize(liquidDirection - uLiquidAmplitude *
          (liquidGradient - liquidDirection * dot(liquidDirection, liquidGradient)));
      `);
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        vec3 transformed = position * (1.0 + uLiquidAmplitude * liquidWave);
      `);
    };
    metal.customProgramCacheKey = () => "jarvis-liquid-v1";
    const sphereGeometry = new THREE.SphereGeometry(1.18, 64, 48);
    const eyeGeometry = new THREE.CapsuleGeometry(.105, .27, 8, 16);
    geometries.push(sphereGeometry, eyeGeometry);
    const sphere = new THREE.Mesh(sphereGeometry, metal);
    const face = new THREE.Group();
    body.add(sphere, face);
    const eyes = [-1, 1].map(side => {
      const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
      eye.position.set(side * .31, .06, 1.18);
      face.add(eye);
      return eye;
    });
    const droplets = [
      { radius: .1, x: -1.23, y: -.62, z: .05 },
      { radius: .065, x: 1.16, y: .86, z: -.05 },
    ].map((drop, index) => {
      const geometry = new THREE.SphereGeometry(drop.radius, 20, 16);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, metal);
      mesh.position.set(drop.x, drop.y, drop.z);
      mesh.userData.baseY = drop.y; mesh.userData.phase = index * 2;
      scene.add(mesh);
      return mesh;
    });
    const key = new THREE.DirectionalLight("#fff4d0", 4);
    key.position.set(-3, 4, 4);
    const rim = new THREE.DirectionalLight("#ffffff", 2.5);
    rim.position.set(4, 1, -2);
    scene.add(key, rim, new THREE.AmbientLight("#fff9e8", .7));

    const draw = (now = performance.now()) => {
      const dt = previous ? Math.min((now - previous) / 1000, .05) : 1 / 30;
      previous = now;
      const settings = presentation.current;
      const still = motion.matches;
      if (!still) elapsed += dt;
      const follow = still ? 1 : 1 - Math.exp(-dt * 7);
      pointer.currentX += (pointer.x - pointer.currentX) * follow;
      pointer.currentY += (pointer.y - pointer.currentY) * follow;
      const x = still ? 0 : pointer.currentX, y = still ? 0 : pointer.currentY;
      host.style.setProperty("--look-x", `${x * 12}px`);
      host.style.setProperty("--look-y", `${y * 9}px`);
      host.dataset.gaze = x < -.2 ? "left" : x > .2 ? "right" : "center";
      if (!renderer || gpuLost) return;
      const active = settings.powered;
      const speaking = active && settings.state === "SPEAKING";
      const processing = active && settings.state === "PROCESSING";
      const listening = active && settings.state === "LISTENING";
      impulse *= Math.exp(-dt * 4);
      const speed = processing ? 1.35 : speaking ? 1.1 : .55;
      time.value += still ? 0 : dt * speed;
      const desiredWave = !active ? .022 : processing ? .11 : speaking ? .078 : listening ? .055 : .038;
      amplitude.value += ((still ? .018 : desiredWave + impulse * .09) - amplitude.value) * follow;
      const squash = still ? 0 : Math.sin(impulse * Math.PI) * .11;
      sphere.scale.set(1 + squash, 1 - squash * .8, 1);
      body.position.set(x * .045, (still ? 0 : Math.sin(elapsed * .8) * .045) - y * .025, 0);
      body.rotation.set(y * .08, x * .13, still ? 0 : Math.sin(elapsed * .45) * .02);
      face.position.set(x * .17, -y * .13, 0);
      // Natural blink, without pretending to measure microphone or speech amplitude.
      const blinkPhase = elapsed % 5.2;
      const blink = !still && blinkPhase > 4.92 ? Math.max(.08, Math.abs(blinkPhase - 5.06) / .14) : 1;
      const openness = active ? processing ? .65 : listening ? 1.12 : 1 : .54;
      const talk = speaking && !still ? 1 + Math.sin(elapsed * 7) * .09 : 1;
      eyes.forEach((eye, index) => {
        eye.scale.y = openness * blink * talk;
        eye.rotation.z = processing ? (index ? -1 : 1) * .13 : x * -.035;
      });
      droplets.forEach(drop => { drop.position.y = drop.userData.baseY + (still ? 0 : Math.sin(elapsed * 1.15 + drop.userData.phase) * .055); });
      baseColor.set(settings.state === "ERROR" && active ? "#fb7185" : settings.accent);
      metal.color.lerp(baseColor, follow);
      metal.emissive.copy(metal.color);
      metal.emissiveIntensity = active ? .065 : .015;
      metal.roughness = active ? .14 : .22;
      eyeMaterial.emissiveIntensity = active ? 1.8 : .55;
      renderer.render(scene, camera);
    };
    const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; previous = 0; };
    const tick = (now: number) => {
      frame = null;
      if (!visible || document.hidden || motion.matches) return;
      if (!previous || now - previous >= 1000 / 30) draw(now);
      frame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      cancel();
      if (visible && !document.hidden) {
        draw();
        if (!motion.matches) frame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      if (renderer) {
        const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight);
        renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 600 ? 1.5 : 2));
        renderer.setSize(width, height);
        camera.aspect = width / height; camera.updateProjectionMatrix();
      }
      refresh();
    };
    const onPointer = (event: PointerEvent) => {
      if (motion.matches) return;
      const rect = host.getBoundingClientRect();
      pointer.x = THREE.MathUtils.clamp((event.clientX - rect.left - rect.width / 2) / Math.max(rect.width, 1), -1, 1);
      pointer.y = THREE.MathUtils.clamp((event.clientY - rect.top - rect.height / 2) / Math.max(rect.height, 1), -1, 1);
    };
    const resetPointer = () => { pointer.x = 0; pointer.y = 0; };
    const releaseTouch = (event: PointerEvent) => { if (event.pointerType !== "mouse") resetPointer(); };
    const contextLost = (event: Event) => { event.preventDefault(); gpuLost = true; delete host.dataset.renderer; refresh(); };
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.debug.onShaderError = () => { gpuLost = true; delete host.dataset.renderer; };
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      renderer.domElement.setAttribute("aria-hidden", "true");
      generator = new THREE.PMREMGenerator(renderer);
      room = new RoomEnvironment();
      environment = generator.fromScene(room, .04);
      scene.environment = environment.texture; scene.environmentIntensity = .8;
      room.dispose(); room = null; generator.dispose(); generator = null;
      container.appendChild(renderer.domElement);
      renderer.domElement.addEventListener("webglcontextlost", contextLost);
      resize();
      if (!gpuLost) host.dataset.renderer = "webgl";
    } catch {
      // The DOM eyes and glossy CSS sphere remain visible on devices without WebGL.
      renderer?.dispose(); renderer?.domElement.remove(); renderer = null;
      environment?.dispose(); environment = null; generator?.dispose(); generator = null; room?.dispose(); room = null;
    }
    update.current = refresh;
    touch.current = () => { if (!motion.matches) impulse = 1; refresh(); };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; refresh(); });
    intersection.observe(host);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerup", releaseTouch, { passive: true });
    window.addEventListener("pointercancel", resetPointer);
    window.addEventListener("blur", resetPointer);
    document.documentElement.addEventListener("pointerleave", resetPointer);
    document.addEventListener("visibilitychange", refresh);
    motion.addEventListener("change", refresh);
    refresh();
    return () => {
      cancel(); update.current = () => {}; touch.current = () => {};
      observer.disconnect(); intersection.disconnect();
      window.removeEventListener("pointermove", onPointer); window.removeEventListener("pointerup", releaseTouch);
      window.removeEventListener("pointercancel", resetPointer); window.removeEventListener("blur", resetPointer);
      document.documentElement.removeEventListener("pointerleave", resetPointer);
      document.removeEventListener("visibilitychange", refresh); motion.removeEventListener("change", refresh);
      renderer?.domElement.removeEventListener("webglcontextlost", contextLost);
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
      scene.environment = null; environment?.dispose();
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); delete host.dataset.renderer;
    };
  }, []);

  return (
    <button ref={hostRef} type="button" className={styles.avatar} data-powered={powered} data-state={state}
      style={{ "--liquid-accent": accent } as CSSProperties}
      aria-label={powered ? "Tocar a NEXO" : "Encender NEXO desde el avatar"}
      onClick={() => { touch.current(); if (!powered) onActivate(); }}>
      <span aria-hidden="true" className={styles.halo} />
      <span aria-hidden="true" className={styles.shadow} />
      <span aria-hidden="true" className={styles.fallback}>
        <span className={styles.reflection} />
        <span className={styles.eyes}><span /><span /></span>
      </span>
      <span ref={canvasRef} aria-hidden="true" className={styles.canvas} />
    </button>
  );
}
