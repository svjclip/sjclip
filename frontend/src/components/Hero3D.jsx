import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { motion } from "framer-motion";

/**
 * Atmospheric, minimal 3D ambient layer.
 * - Slow drifting starfield (far depth)
 * - Wireframe-style SVJ portrait floating on the right, masked so it
 *   melts into the dark bg without competing with the headline.
 */

function Starfield({ count = 600 }) {
  const ref = useRef();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 8 + Math.random() * 14;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = -8 - Math.random() * 12;
  }
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.015;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.05) * 0.1;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.025} color="#ffffff" transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden" data-testid="hero-3d-canvas">
      {/* Deep starfield */}
      <Canvas camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#050505"]} />
        <Suspense fallback={null}>
          <Starfield />
        </Suspense>
      </Canvas>

      {/* Wireframe portrait, centered in the hero area, breathing slowly */}
      <motion.img
        src="/svj-wireframe.png"
        alt=""
        aria-hidden="true"
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 0.95, scale: 1 }}
        transition={{ duration: 1.6, ease: "easeOut" }}
        className="absolute inset-0 m-auto h-full w-auto max-w-none object-contain select-none"
        style={{
          WebkitMaskImage:
            "radial-gradient(ellipse 55% 65% at 50% 45%, black 40%, rgba(0,0,0,0.8) 68%, transparent 92%)",
          maskImage:
            "radial-gradient(ellipse 55% 65% at 50% 45%, black 40%, rgba(0,0,0,0.8) 68%, transparent 92%)",
          mixBlendMode: "screen",
          filter: "drop-shadow(0 0 80px rgba(83,252,24,0.22))",
        }}
        data-testid="hero-portrait"
      />

      {/* Slow ambient breathing overlay so it never feels static */}
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 75% 50%, rgba(83,252,24,0.06), transparent 70%)",
        }}
      />
    </div>
  );
}
