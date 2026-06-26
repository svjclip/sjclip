import React, { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

/**
 * Atmospheric, minimal 3D ambient layer.
 * - Slow drifting starfield (far depth)
 * - One subtle large wireframe sphere at the back (very low opacity)
 * No floating blobs. No bright shapes. Just depth + atmosphere.
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

function AmbientSphere() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.05;
    ref.current.rotation.x = state.clock.elapsedTime * 0.02;
  });
  return (
    <mesh ref={ref} position={[0, 0, -12]} scale={6}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial color="#53FC18" wireframe transparent opacity={0.08} />
    </mesh>
  );
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none" data-testid="hero-3d-canvas">
      <Canvas camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#050505"]} />
        <Suspense fallback={null}>
          <Starfield />
          <AmbientSphere />
        </Suspense>
      </Canvas>
    </div>
  );
}
