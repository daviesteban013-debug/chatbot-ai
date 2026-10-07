"use client";

import { useEffect, useRef } from "react";

/** A quiet amber constellation. CSS remains visible without a GPU. */
export function NexoConstellation() {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false;
    let cleanup = () => {};
    void import("three").then(THREE => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" }); }
      catch { return; }
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, .1, 100);
      camera.position.z = 18;
      const count = innerWidth < 700 ? 90 : 210;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - .5) * 45;
        positions[i * 3 + 1] = (Math.random() - .5) * 30;
        positions[i * 3 + 2] = -Math.random() * 35;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({ color: "#f1d88d", size: .055, transparent: true, opacity: .42, depthWrite: false });
      const stars = new THREE.Points(geometry, material);
      scene.add(stars);
      renderer.setClearColor(0, 0);
      renderer.domElement.setAttribute("aria-hidden", "true");
      host.appendChild(renderer.domElement);
      let frame: number | null = null, previous = 0, elapsed = 0, gpuLost = false;
      const pointer = { x: 0, y: 0 };
      function render(timestamp = 0) {
        frame = null;
        if (disposed || document.hidden || gpuLost) return;
        elapsed += previous ? Math.min((timestamp - previous) / 1000, .05) : 0;
        previous = timestamp;
        if (!motion.matches) {
          stars.rotation.y = Math.sin(elapsed * .045) * .04;
          camera.position.x += (pointer.x * .4 - camera.position.x) * .025;
          camera.position.y += (-pointer.y * .25 - camera.position.y) * .025;
        } else { stars.rotation.y = 0; camera.position.x = camera.position.y = 0; }
        renderer.render(scene, camera);
        if (!motion.matches) frame = requestAnimationFrame(render);
      }
      function refresh() { if (frame !== null) cancelAnimationFrame(frame); frame = null; previous = 0; render(); }
      function resize() {
        camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
        renderer.setSize(innerWidth, innerHeight);
        refresh();
      }
      function move(event: PointerEvent) { if (!motion.matches) { pointer.x = event.clientX / innerWidth * 2 - 1; pointer.y = event.clientY / innerHeight * 2 - 1; } }
      function reset() { pointer.x = pointer.y = 0; }
      function lost(event: Event) { event.preventDefault(); gpuLost = true; refresh(); }
      document.addEventListener("visibilitychange", refresh);
      window.addEventListener("resize", resize);
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("blur", reset);
      motion.addEventListener("change", refresh);
      renderer.domElement.addEventListener("webglcontextlost", lost);
      resize();
      cleanup = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        document.removeEventListener("visibilitychange", refresh); window.removeEventListener("resize", resize);
        window.removeEventListener("pointermove", move); window.removeEventListener("blur", reset);
        motion.removeEventListener("change", refresh);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
    }).catch(() => { /* CSS ambience remains if the optional chunk fails. */ });
    return () => { disposed = true; cleanup(); };
  }, []);
  return <div ref={hostRef} className="nexo-constellation" aria-hidden="true" />;
}
