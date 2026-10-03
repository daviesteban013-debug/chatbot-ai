"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function FuturisticBackground3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Detect prefers-reduced-motion
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 35;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // -----------------------------------------------------------
    // 1. Neural Network / Particle Lattice (AI Constellation)
    // -----------------------------------------------------------
    const particleCount = reducedMotion ? 50 : 130;
    const positions = new Float32Array(particleCount * 3);
    const velocities: THREE.Vector3[] = [];
    const particleGroup = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 75;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 55;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.022,
          (Math.random() - 0.5) * 0.022,
          (Math.random() - 0.5) * 0.022
        )
      );
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // Glowing particle texture using offscreen canvas
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, "rgba(250, 204, 21, 1)");
      grad.addColorStop(0.35, "rgba(234, 179, 8, 0.7)");
      grad.addColorStop(0.7, "rgba(16, 185, 129, 0.2)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 32, 32);
    }
    const particleTexture = new THREE.CanvasTexture(canvas);

    const particleMaterial = new THREE.PointsMaterial({
      color: 0xfacc15,
      size: 1.15,
      map: particleTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
    particleGroup.add(particlePoints);

    // Dynamic connection lines
    const linesMaterial = new THREE.LineBasicMaterial({
      color: 0xeab308,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
    });

    const maxLines = particleCount * (particleCount - 1);
    const linePositions = new Float32Array(maxLines * 6);
    const linesGeometry = new THREE.BufferGeometry();
    linesGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const linesMesh = new THREE.LineSegments(linesGeometry, linesMaterial);
    particleGroup.add(linesMesh);

    scene.add(particleGroup);

    // -----------------------------------------------------------
    // 2. Floating 3D Geometric Polyhedra (Futuristic Cyber Crystals)
    // -----------------------------------------------------------
    const polyGroup = new THREE.Group();
    const polyCount = reducedMotion ? 3 : 7;

    interface FloatingMesh {
      mesh: THREE.Object3D;
      baseY: number;
      speedY: number;
      rotSpeedX: number;
      rotSpeedY: number;
      rotSpeedZ: number;
      phase: number;
    }

    const floatingMeshes: FloatingMesh[] = [];

    const wireframeMat1 = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.35,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    const wireframeMat2 = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.4,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });

    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0xca8a04,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
    });

    for (let p = 0; p < polyCount; p++) {
      const isIcosa = p % 2 === 0;
      const size = 2.4 + Math.random() * 2.2;
      const geom = isIcosa ? new THREE.IcosahedronGeometry(size, 1) : new THREE.OctahedronGeometry(size, 1);
      const mat = p % 3 === 0 ? wireframeMat2 : wireframeMat1;
      const mesh = new THREE.Mesh(geom, mat);

      // Glowing inner core
      const coreGeom = new THREE.IcosahedronGeometry(size * 0.6, 0);
      const coreMesh = new THREE.Mesh(coreGeom, innerCoreMat);
      mesh.add(coreMesh);

      const posX = (p % 2 === 0 ? 1 : -1) * (15 + Math.random() * 20);
      const posY = (Math.random() - 0.5) * 26;
      const posZ = -6 - Math.random() * 18;

      mesh.position.set(posX, posY, posZ);
      polyGroup.add(mesh);

      floatingMeshes.push({
        mesh,
        baseY: posY,
        speedY: 0.3 + Math.random() * 0.4,
        rotSpeedX: (Math.random() - 0.5) * 0.008,
        rotSpeedY: (Math.random() - 0.5) * 0.012,
        rotSpeedZ: (Math.random() - 0.5) * 0.006,
        phase: Math.random() * Math.PI * 2,
      });
    }

    scene.add(polyGroup);

    // -----------------------------------------------------------
    // 3. Futuristic 3D Undulating Wireframe Grid (Cyber Horizon)
    // -----------------------------------------------------------
    const gridWidth = 140;
    const gridDepth = 110;
    const gridSegmentsX = 40;
    const gridSegmentsZ = 35;
    const gridGeometry = new THREE.PlaneGeometry(gridWidth, gridDepth, gridSegmentsX, gridSegmentsZ);
    gridGeometry.rotateX(-Math.PI / 2.3);

    const gridPosAttr = gridGeometry.attributes.position;
    const originalGridZ = new Float32Array(gridPosAttr.count);
    for (let i = 0; i < gridPosAttr.count; i++) {
      originalGridZ[i] = gridPosAttr.getZ(i);
    }

    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0xeab308,
      wireframe: true,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
    });
    const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
    gridMesh.position.set(0, -18, -15);
    scene.add(gridMesh);

    // -----------------------------------------------------------
    // 4. Ambient and Point Lights
    // -----------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xfacc15, 2.5, 75);
    pointLight1.position.set(16, 12, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x10b981, 2, 65);
    pointLight2.position.set(-16, -12, 5);
    scene.add(pointLight2);

    // -----------------------------------------------------------
    // 5. Mouse Parallax & Scroll
    // -----------------------------------------------------------
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const normX = (e.clientX / window.innerWidth) * 2 - 1;
      const normY = -(e.clientY / window.innerHeight) * 2 + 1;
      targetMouseX = normX * 4;
      targetMouseY = normY * 3;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    let scrollOffset = 0;
    const handleScroll = () => {
      scrollOffset = window.scrollY * 0.005;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    const handleResize = () => {
      if (!container) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };
    window.addEventListener("resize", handleResize);

    // -----------------------------------------------------------
    // 6. Animation Loop
    // -----------------------------------------------------------
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth camera parallax
      currentMouseX += (targetMouseX - currentMouseX) * 0.04;
      currentMouseY += (targetMouseY - currentMouseY) * 0.04;
      camera.position.x = currentMouseX;
      camera.position.y = currentMouseY - scrollOffset * 0.8;
      camera.lookAt(0, -scrollOffset * 0.6, 0);

      // Animate particles & lines
      if (!reducedMotion) {
        const pos = particleGeometry.attributes.position.array as Float32Array;
        let lineIndex = 0;

        for (let i = 0; i < particleCount; i++) {
          pos[i * 3] += velocities[i].x;
          pos[i * 3 + 1] += velocities[i].y;
          pos[i * 3 + 2] += velocities[i].z;

          // Boundary bounce
          if (pos[i * 3] < -38 || pos[i * 3] > 38) velocities[i].x *= -1;
          if (pos[i * 3 + 1] < -26 || pos[i * 3 + 1] > 26) velocities[i].y *= -1;
          if (pos[i * 3 + 2] < -25 || pos[i * 3 + 2] > 25) velocities[i].z *= -1;

          // Connections
          for (let j = i + 1; j < particleCount; j++) {
            const dx = pos[i * 3] - pos[j * 3];
            const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
            const dz = pos[i * 3 + 2] - pos[j * 3 + 2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

            if (dist < 9.5) {
              linePositions[lineIndex * 6] = pos[i * 3];
              linePositions[lineIndex * 6 + 1] = pos[i * 3 + 1];
              linePositions[lineIndex * 6 + 2] = pos[i * 3 + 2];
              linePositions[lineIndex * 6 + 3] = pos[j * 3];
              linePositions[lineIndex * 6 + 4] = pos[j * 3 + 1];
              linePositions[lineIndex * 6 + 5] = pos[j * 3 + 2];
              lineIndex++;
            }
          }
        }

        particleGeometry.attributes.position.needsUpdate = true;
        linesGeometry.setDrawRange(0, lineIndex * 2);
        linesGeometry.attributes.position.needsUpdate = true;

        particleGroup.rotation.y = elapsed * 0.022;
        particleGroup.rotation.x = Math.sin(elapsed * 0.015) * 0.05;
      }

      // Animate floating polyhedra
      for (let k = 0; k < floatingMeshes.length; k++) {
        const item = floatingMeshes[k];
        item.mesh.rotation.x += item.rotSpeedX;
        item.mesh.rotation.y += item.rotSpeedY;
        item.mesh.rotation.z += item.rotSpeedZ;
        item.mesh.position.y = item.baseY + Math.sin(elapsed * item.speedY + item.phase) * 2.2;
      }

      // Animate cyber wave grid
      if (!reducedMotion) {
        const posAttr = gridGeometry.attributes.position;
        for (let i = 0; i < posAttr.count; i++) {
          const u = (i % (gridSegmentsX + 1)) / (gridSegmentsX + 1);
          const v = Math.floor(i / (gridSegmentsX + 1)) / (gridSegmentsZ + 1);
          const wave = Math.sin(u * 10 + elapsed * 1.8) * Math.cos(v * 8 + elapsed * 1.2) * 1.8;
          posAttr.setZ(i, originalGridZ[i] + wave);
        }
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);

      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }

      particleGeometry.dispose();
      particleMaterial.dispose();
      particleTexture.dispose();
      linesGeometry.dispose();
      linesMaterial.dispose();
      gridGeometry.dispose();
      gridMaterial.dispose();
      wireframeMat1.dispose();
      wireframeMat2.dispose();
      innerCoreMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-90 transition-opacity duration-1000"
    />
  );
}
