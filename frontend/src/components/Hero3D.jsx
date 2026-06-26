import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";

/**
 * Atmospheric, minimal 3D ambient layer.
 * - Slow drifting starfield (far depth)
 * - Wireframe-style point-cloud portrait of SVJ mapped onto a hemisphere,
 *   gently oscillating so it feels like a slowly rotating "globe" but the
 *   subject stays recognisable.
 */

function Starfield({ count = 600 }) {
  const ref = useRef();
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 8 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = -8 - Math.random() * 12;
    }
    return arr;
  }, [count]);

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

/**
 * Convert the SVJ portrait into a wireframe-feeling point cloud mapped
 * onto the front hemisphere of an invisible sphere. A gentle Y oscillation
 * makes it feel like a slowly rotating globe.
 */
function PortraitGlobe() {
  const ref = useRef();
  const ringRef = useRef();
  const [positions, setPositions] = useState(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = "/svj-portrait.png";
    img.onload = () => {
      const W = 220;
      const H = 220;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      // Cover-fit + center crop the source square image
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

      const pts = [];
      const STEP = 2;
      const R = 3.1;
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const i = (y * W + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r * 0.299 + g * 0.587 + b * 0.114);

          // Keep mid + dark pixels (subject silhouette and features),
          // drop pure-bright pixels (sky / window blowouts).
          if (brightness > 195) continue;
          // Soft probabilistic culling so dark areas are denser
          const keepProb = 1 - brightness / 260; // 0.25 .. 1
          if (Math.random() > keepProb) continue;

          const u = x / W;
          const v = y / H;
          // Front-hemisphere mapping (azimuth limited so the portrait
          // is recognisable instead of fully wrapped around a sphere)
          const theta = (u - 0.5) * Math.PI * 0.95; // -85deg..85deg
          const phi = (v - 0.5) * Math.PI * 0.95;
          const X = R * Math.cos(phi) * Math.sin(theta);
          const Y = -R * Math.sin(phi);
          const Z = R * Math.cos(phi) * Math.cos(theta) - R; // place hemisphere behind origin
          pts.push(X, Y, Z);
        }
      }
      setPositions(new Float32Array(pts));
    };
  }, []);

  // Wireframe latitude/longitude ring around the portrait (gives the
  // "globe" silhouette even before the point cloud loads).
  const ringPositions = useMemo(() => {
    const segs = 96;
    const arr = new Float32Array(segs * 3);
    for (let i = 0; i < segs; i++) {
      const t = (i / segs) * Math.PI * 2;
      arr[i * 3] = Math.cos(t) * 3.2;
      arr[i * 3 + 1] = Math.sin(t) * 3.2;
      arr[i * 3 + 2] = 0;
    }
    return arr;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      // gentle "spin" oscillation, ±35° on Y, tiny X bob
      ref.current.rotation.y = Math.sin(t * 0.22) * 0.6;
      ref.current.rotation.x = Math.sin(t * 0.13) * 0.06;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.04;
    }
  });

  return (
    <group position={[0, 0, -8]}>
      {/* outer wireframe rings */}
      <group ref={ringRef}>
        <lineLoop>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={ringPositions.length / 3} array={ringPositions} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#53FC18" transparent opacity={0.18} />
        </lineLoop>
        <lineLoop rotation={[Math.PI / 2.4, 0, 0]}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={ringPositions.length / 3} array={ringPositions} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#53FC18" transparent opacity={0.12} />
        </lineLoop>
        <lineLoop rotation={[0, Math.PI / 2.4, 0]}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={ringPositions.length / 3} array={ringPositions} itemSize={3} />
          </bufferGeometry>
          <lineBasicMaterial color="#53FC18" transparent opacity={0.1} />
        </lineLoop>
      </group>

      {/* portrait point cloud */}
      {positions && (
        <points ref={ref}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial size={0.028} color="#53FC18" transparent opacity={0.85} sizeAttenuation />
        </points>
      )}
    </group>
  );
}

export default function Hero3D() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none" data-testid="hero-3d-canvas">
      <Canvas camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 1.5]}>
        <color attach="background" args={["#050505"]} />
        <Suspense fallback={null}>
          <Starfield />
          <PortraitGlobe />
        </Suspense>
      </Canvas>
    </div>
  );
}
