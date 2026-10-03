"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Cpu, ShieldCheck, Sparkles, Zap } from "lucide-react";

export function JarvisHeroOrb3D() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<"synapse" | "quantum" | "guardian">("synapse");

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
      opacity: 0.75,
    });
    const coreMesh = new THREE.Mesh(coreGeom, coreMat);
    hologramGroup.add(coreMesh);

    // Inner Glowing Core (Additive blending glowing solid)
    const innerGeom = new THREE.IcosahedronGeometry(2.1, 1);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const innerMesh = new THREE.Mesh(innerGeom, innerMat);
    hologramGroup.add(innerMesh);

    // 2. Quantum Gimbal Rings
    // Ring 1: Equatorial with high segment density
    const ring1Geom = new THREE.TorusGeometry(4.7, 0.05, 16, 80);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.65,
    });
    const ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
    ring1.rotation.x = Math.PI / 3;
    hologramGroup.add(ring1);

    // Ring 2: Tilted Cyan / Emerald ring
    const ring2Geom = new THREE.TorusGeometry(5.4, 0.04, 16, 80);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.55,
    });
    const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
    ring2.rotation.y = Math.PI / 4;
    ring2.rotation.x = Math.PI / 6;
    hologramGroup.add(ring2);

    // Ring 3: Wide outer telemetry ring (dashed feeling)
    const ring3Geom = new THREE.TorusGeometry(6.2, 0.03, 16, 90);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    const ring3 = new THREE.Mesh(ring3Geom, ring3Mat);
    ring3.rotation.z = Math.PI / 2.5;
    hologramGroup.add(ring3);

    // 3. Orbiting Data Satellites (Tiny luminous octahedrons along rings)
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

    // 4. Orbiting Synapse Particle Cloud (Swarm of particles around orb)
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

    // Handle container resize
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
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse follow (lerp)
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      hologramGroup.rotation.x = currentRotX + Math.sin(elapsed * 0.4) * 0.08;
      hologramGroup.rotation.y = currentRotY + elapsed * 0.22;

      // Pulse breathing
      const pulseScale = 1 + Math.sin(elapsed * 2.2) * 0.04;
      coreMesh.scale.set(pulseScale, pulseScale, pulseScale);
      innerMesh.scale.set(pulseScale * 0.95, pulseScale * 0.95, pulseScale * 0.95);

      // Rings differential spin
      ring1.rotation.z = elapsed * 0.45;
      ring2.rotation.x = elapsed * -0.35;
      ring3.rotation.y = elapsed * 0.28;

      // Satellites orbiting in 3D
      satellites.forEach((sat, idx) => {
        const angle = elapsed * 0.8 + (idx * Math.PI * 2) / satCount;
        const orbitR = 5.2;
        sat.position.x = Math.cos(angle) * orbitR;
        sat.position.y = Math.sin(angle * 1.5) * 1.8;
        sat.position.z = Math.sin(angle) * orbitR;
        sat.rotation.x += 0.02;
        sat.rotation.y += 0.03;
      });

      // Swarm spin
      swarm.rotation.y = elapsed * -0.15;
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

  return (
    <div className="relative mx-auto flex w-full max-w-[420px] flex-col items-center">
      {/* Ambient background glow behind the 3D Hologram */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,rgba(250,204,21,0.18),rgba(16,185,129,0.08)_45%,transparent_75%)] blur-2xl" />

      {/* Cybernetic Tech HUD Frame */}
      <div className="relative w-full rounded-3xl border border-yellow-400/20 bg-gradient-to-b from-zinc-900/70 via-black/80 to-zinc-950/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-xl">
        {/* Top HUD Telemetry Bar */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3 text-[10px] font-mono tracking-widest text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-zinc-300 font-semibold uppercase">NEXO AI // KERNEL 3D</span>
          </div>
          <span className="rounded bg-yellow-400/10 px-1.5 py-0.5 text-yellow-300 border border-yellow-400/20">
            60 FPS · REALTIME
          </span>
        </div>

        {/* 3D WebGL Canvas Container */}
        <div className="relative my-2 flex aspect-square w-full items-center justify-center overflow-hidden">
          {/* Cybernetic Reticle Grid Lines behind 3D Canvas */}
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
            <Zap className="size-3 text-yellow-400 animate-pulse" />
            <span>LATENCIA: 12ms</span>
          </div>

          <div className="pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[9px] font-mono text-zinc-400 backdrop-blur-md">
            <Sparkles className="size-3 text-emerald-400" />
            <span>NEURAL SYNC</span>
          </div>
        </div>

        {/* Bottom Mode Selectors */}
        <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={() => setActiveMode("synapse")}
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
            onClick={() => setActiveMode("quantum")}
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
            onClick={() => setActiveMode("guardian")}
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
        // INTERACTIVO: Mueve el cursor para explorar el núcleo 3D
      </p>
    </div>
  );
}
