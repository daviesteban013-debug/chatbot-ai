"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Cpu, ShieldCheck, Sparkles, Zap, AlertTriangle, Radio } from "lucide-react";
import { useJarvisAvatar } from "@/context/JarvisAvatarContext";
import type { AvatarState } from "@/types/jarvis";

export function JarvisHeroOrb3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<"synapse" | "quantum" | "guardian">("synapse");

  const {
    state,
    audioLevel,
    glowIntensity,
    statusLabel,
    accentColor,
    setState,
  } = useJarvisAvatar();

  // Refs para que el animation loop de Three.js lea los estados más recientes sin recrear la escena
  const stateRef = useRef<AvatarState>(state);
  const audioLevelRef = useRef<number>(audioLevel);
  const glowIntensityRef = useRef<number>(glowIntensity);
  const accentColorRef = useRef<string>(accentColor);

  useEffect(() => {
    stateRef.current = state;
    audioLevelRef.current = audioLevel;
    glowIntensityRef.current = glowIntensity;
    accentColorRef.current = accentColor;
  }, [state, audioLevel, glowIntensity, accentColor]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Dimensions
    const width = container.clientWidth || 380;
    const height = container.clientHeight || 380;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 18;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Root Hologram Group
    const hologramGroup = new THREE.Group();
    scene.add(hologramGroup);

    // 1. Central Core Sphere (Dense wireframe icosahedron)
    const coreGeom = new THREE.IcosahedronGeometry(3.2, 2);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.6,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    hologramGroup.add(coreMesh);

    // Inner Glowing Core (Additive blending glowing solid)
    const innerGeom = new THREE.IcosahedronGeometry(2.1, 1);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
    });
    const innerMesh = new THREE.Mesh(innerGeom, innerMat);
    hologramGroup.add(innerMesh);

    // 2. Quantum Gimbal Rings
    const ring1Geom = new THREE.TorusGeometry(4.7, 0.05, 16, 80);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.7,
    });
    const ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    hologramGroup.add(ring1);

    const ring2Geom = new THREE.TorusGeometry(5.4, 0.04, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.6,
    });
    const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.x = Math.PI / 6;
    hologramGroup.add(ring2);

    const ring3Geom = new THREE.TorusGeometry(6.2, 0.03, 16, 90);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
    });
    const ring3 = new THREE.Mesh(ring3Geom, ring3Mat);
    ring3.rotation.z = Math.PI / 2.5;
    hologramGroup.add(ring3);

    // 3. Orbiting Data Satellites
    const satellites: THREE.Mesh[] = [];
    const satCount = 4;
    const satGeom = new THREE.OctahedronGeometry(0.32, 0);
    const satMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      wireframe: true,
    });

    for (let s = 0; s < satCount; s++) {
      const sat = new THREE.Mesh(satGeom, satMat);
      hologramGroup.add(sat);
      satellites.push(sat);
    }

    // 4. Orbiting Synapse Particle Cloud
    const swarmCount = reducedMotion ? 40 : 90;
    const swarmGeom = new THREE.BufferGeometry();
    const swarmPos = new Float32Array(swarmCount * 3);
    const swarmRadius = 5.2;

    for (let i = 0; i < swarmCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = swarmRadius + (Math.random() - 0.5) * 2.2;
      swarmPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      swarmPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      swarmPos[i * 3 + 2] = r * Math.cos(phi);
    }

    swarmGeom.setAttribute("position", new THREE.BufferAttribute(swarmPos, 3));
    const swarmMat = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 0.28,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const swarm = new THREE.Points(swarmGeom, swarmMat);
    hologramGroup.add(swarm);

    // 5. Lighting
    const pointLight = new THREE.PointLight(0xfacc15, 3.5, 30);
    pointLight.position.set(5, 5, 8);
    scene.add(pointLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Paletas de color por estado
    const colorTargets: Record<AvatarState, THREE.Color> = {
      IDLE: new THREE.Color(accentColorRef.current || 0xfacc15),
      LISTENING: new THREE.Color(0x38bdf8),
      PROCESSING: new THREE.Color(0x60a5fa),
      SPEAKING: new THREE.Color(0x34d399),
      ERROR: new THREE.Color(0xef4444),
    };

    const currentColor = new THREE.Color(0xfacc15);

    // Mouse Interaction
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0;
    let currentRotY = 0;

    const handleMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotX = y * 0.45;
      targetRotY = x * 0.65;
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("resize", handleResize);

    // Animation Loop
    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      const currentState = stateRef.current;
      const currentAudio = audioLevelRef.current;
      const currentGlow = glowIntensityRef.current;

      // Color target dinámico
      colorTargets.IDLE.set(accentColorRef.current || 0xfacc15);
      const targetColor = colorTargets[currentState] || colorTargets.IDLE;
      currentColor.lerp(targetColor, 0.08);

      coreMat.color.copy(currentColor);
      coreMat.emissive.copy(currentColor);
      coreMat.emissiveIntensity = currentGlow;

      innerMat.color.copy(currentColor);
      pointLight.color.copy(currentColor);
      ring1Mat.color.copy(currentColor);

      // Velocidad y escalas dinámicas según estado
      let speedMult = 1.0;
      let pulseScale = 1.0;

      if (currentState === "IDLE") {
        speedMult = 1.0;
        pulseScale = 1 + Math.sin(elapsed * 2.2) * 0.04;
        pointLight.intensity = 3.5;
      } else if (currentState === "LISTENING") {
        speedMult = 1.6;
        pulseScale = 1 + Math.sin(elapsed * 6.0) * 0.06;
        pointLight.intensity = 4.2;
      } else if (currentState === "PROCESSING") {
        // Carga/pensamiento intenso con giros rápidos
        speedMult = 3.4;
        pulseScale = 1 + Math.sin(elapsed * 10.0) * 0.09;
        pointLight.intensity = 5.8;
      } else if (currentState === "SPEAKING") {
        // Reactividad de voz: amplitud modulada
        speedMult = 2.0;
        const voiceMod = currentAudio * 0.28;
        pulseScale = 1 + Math.sin(elapsed * 4.5) * 0.05 + voiceMod;
        pointLight.intensity = 4.0 + currentAudio * 4.0;
      } else if (currentState === "ERROR") {
        speedMult = 0.5;
        // Jitter glitch
        pulseScale = 1 + Math.sin(elapsed * 25.0) * 0.05;
        pointLight.intensity = 2.5 + Math.sin(elapsed * 12.0) * 1.5;
      }

      // Smooth mouse follow (lerp)
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      hologramGroup.rotation.x = currentRotX + Math.sin(elapsed * 0.4) * 0.08;
      hologramGroup.rotation.y = currentRotY + elapsed * (0.22 * speedMult);

      coreMesh.scale.set(pulseScale, pulseScale, pulseScale);
      innerMesh.scale.set(pulseScale * 0.95, pulseScale * 0.95, pulseScale * 0.95);

      // Rings differential spin
      ring1.rotation.z = elapsed * (0.45 * speedMult);
      ring2.rotation.x = elapsed * (-0.35 * speedMult);
      ring3.rotation.y = elapsed * (0.28 * speedMult);

      // Satellites orbiting in 3D
      satellites.forEach((sat, idx) => {
        const angle = elapsed * (0.8 * speedMult) + (idx * Math.PI * 2) / satCount;
        const orbitR = 5.2 + (currentState === "SPEAKING" ? currentAudio * 0.8 : 0);
        sat.position.x = Math.cos(angle) * orbitR;
        sat.position.y = Math.sin(angle * 1.5) * 1.8;
        sat.position.z = Math.sin(angle) * orbitR;
        sat.rotation.x += 0.02 * speedMult;
        sat.rotation.y += 0.03 * speedMult;
      });

      // Swarm spin
      swarm.rotation.y = elapsed * (-0.15 * speedMult);
      swarm.rotation.x = Math.sin(elapsed * 0.3) * 0.12;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      coreGeom.dispose();
      coreMat.dispose();
      innerGeom.dispose();
      innerMat.dispose();
      ring1Geom.dispose();
      ring1Mat.dispose();
      ring2Geom.dispose();
      ring2Mat.dispose();
      ring3Geom.dispose();
      ring3Mat.dispose();
      satGeom.dispose();
      satMat.dispose();
      swarmGeom.dispose();
      swarmMat.dispose();
      renderer.dispose();
    };
  }, []);

  // Clases dinámicas del HUD según el estado del Avatar
  const stateColorClasses = {
    IDLE: {
      border: "border-yellow-400/20",
      glow: "rgba(250,204,21,0.18)",
      ping: "bg-emerald-400",
      badge: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
    },
    LISTENING: {
      border: "border-sky-400/30",
      glow: "rgba(56,189,248,0.22)",
      ping: "bg-sky-400",
      badge: "border-sky-400/30 bg-sky-400/10 text-sky-300",
    },
    PROCESSING: {
      border: "border-blue-400/40",
      glow: "rgba(96,165,250,0.30)",
      ping: "bg-blue-400 animate-ping",
      badge: "border-blue-400/40 bg-blue-400/15 text-blue-300 animate-pulse",
    },
    SPEAKING: {
      border: "border-emerald-400/40",
      glow: "rgba(52,211,153,0.28)",
      ping: "bg-emerald-400",
      badge: "border-emerald-400/40 bg-emerald-400/15 text-emerald-300",
    },
    ERROR: {
      border: "border-red-500/40",
      glow: "rgba(239,68,68,0.28)",
      ping: "bg-red-500",
      badge: "border-red-500/40 bg-red-500/15 text-red-300",
    },
  }[state] || {
    border: "border-yellow-400/20",
    glow: "rgba(250,204,21,0.18)",
    ping: "bg-emerald-400",
    badge: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
  };

  return (
    <div className="relative mx-auto flex w-full max-w-[420px] flex-col items-center">
      {/* Ambient background glow behind the 3D Hologram */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 blur-2xl transition-all duration-500"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${stateColorClasses.glow}, transparent 75%)`,
        }}
      />

      {/* Cybernetic Tech HUD Frame */}
      <div
        className={`relative w-full rounded-3xl border bg-gradient-to-b from-zinc-900/70 via-black/80 to-zinc-950/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-xl transition-colors duration-500 ${stateColorClasses.border}`}
      >
        {/* Top HUD Telemetry Bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 text-[10px] font-mono tracking-widest text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${stateColorClasses.ping}`} />
              <span className={`relative inline-flex size-2 rounded-full ${stateColorClasses.ping}`} />
            </span>
            <span className="text-zinc-300 font-semibold uppercase">{statusLabel}</span>
          </div>
          <span className={`rounded px-1.5 py-0.5 border font-semibold ${stateColorClasses.badge}`}>
            {state === "SPEAKING" ? "VOZ ACTIVA" : state === "PROCESSING" ? "LLM THINKING" : "60 FPS · REALTIME"}
          </span>
        </div>

        {/* 3D WebGL Canvas Container */}
        <div className="relative my-2 flex aspect-square w-full items-center justify-center overflow-hidden">
          {/* Reticle grid */}
          <div className="pointer-events-none absolute inset-4 rounded-full border border-dashed border-yellow-400/15 animate-[spin_40s_linear_infinite]" />
          <div className="pointer-events-none absolute inset-10 rounded-full border border-emerald-400/10 animate-[spin_25s_linear_infinite_reverse]" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-px w-full bg-gradient-to-r from-transparent via-yellow-400/15 to-transparent" />
            <div className="absolute h-full w-px bg-gradient-to-b from-transparent via-yellow-400/15 to-transparent" />
          </div>

          {/* Three.js Canvas */}
          <div ref={containerRef} className="relative z-10 h-full w-full cursor-grab active:cursor-grabbing" />

          {/* Interactive floating HUD tag */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-mono text-zinc-400 backdrop-blur-md">
            {state === "ERROR" ? (
              <>
                <AlertTriangle className="size-3 text-red-400" />
                <span>FALLO DE ENLACE</span>
              </>
            ) : state === "SPEAKING" ? (
              <>
                <Radio className="size-3 text-emerald-400 animate-pulse" />
                <span>MODULACIÓN {(audioLevel * 100).toFixed(0)}%</span>
              </>
            ) : (
              <>
                <Zap className="size-3 text-yellow-400 animate-pulse" />
                <span>LATENCIA: 12ms</span>
              </>
            )}
          </div>

          <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-mono text-zinc-400 backdrop-blur-md">
            <Sparkles className="size-3 text-emerald-400" />
            <span>NEURAL SYNC</span>
          </div>
        </div>

        {/* Bottom Mode Selectors & Quick Avatar Controls */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              setActiveMode("synapse");
              setState("IDLE");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-medium transition ${
              activeMode === "synapse"
                ? "bg-yellow-400/15 text-yellow-300 border border-yellow-400/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Cpu className="size-3" />
            <span>Atención 24/7</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("quantum");
              setState("PROCESSING");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-medium transition ${
              activeMode === "quantum"
                ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <Zap className="size-3" />
            <span>Cierre Ventas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveMode("guardian");
              setState("IDLE");
            }}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-medium transition ${
              activeMode === "guardian"
                ? "bg-cyan-400/15 text-cyan-300 border border-cyan-400/30"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
            }`}
          >
            <ShieldCheck className="size-3" />
            <span>Control Total</span>
          </button>
        </div>
      </div>

      <p className="mt-2.5 text-center font-mono text-[10px] text-zinc-500">
        {/* INTERACTIVO: Mueve el cursor para explorar el núcleo 3D */}
        INTERACTIVO · Mueve el cursor para explorar el núcleo 3D en tiempo real
      </p>
    </div>
  );
}
