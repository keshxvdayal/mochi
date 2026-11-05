"use client";

import { ContactShadows, Environment, Lightformer, Sparkles } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { Cushion, MochiModel } from "@/components/companion/mochi-model";
import { poke, setMood } from "@/lib/companion-state";
import type { Accessory, BodyColor, EyeColor } from "@/lib/types";

/** The 3D scene. Loaded client-side only (see companion.tsx). */
export default function Stage({ color, eyeColor, accessory, interactive = true, sparkles = true }: { color: BodyColor; eyeColor?: EyeColor; accessory?: Accessory; interactive?: boolean; sparkles?: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.25, 6.6], fov: 30 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      style={{ touchAction: "none" }}
      onCreated={({ gl }) => {
        // Neutral tone mapping keeps pastel colours true instead of washing them out.
        gl.toneMapping = THREE.NeutralToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color="#c7b8ff" />
      <pointLight position={[0, -0.6, 3.2]} intensity={2.2} distance={8} color="#fff1e6" />
      <Suspense fallback={null}>
        {/* Studio lighting made of light panels: no HDR download needed. */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.2} position={[0, 4, 3]} scale={[8, 3, 1]} color="#ffffff" />
          <Lightformer form="circle" intensity={1.4} position={[-4, 1, 2]} scale={3} color="#ffd9ec" />
          <Lightformer form="circle" intensity={1.2} position={[4, 0.5, 1]} scale={3} color="#d9e6ff" />
          <Lightformer form="rect" intensity={0.8} position={[0, -3, -3]} scale={[8, 2, 1]} color="#e9dcff" />
        </Environment>
      </Suspense>

      <group
        onPointerDown={
          interactive
            ? (e) => {
                e.stopPropagation();
                poke();
                setMood("playful");
              }
            : undefined
        }
      >
        <MochiModel color={color} eyeColor={eyeColor} accessory={accessory} />
      </group>
      {sparkles && <Sparkles count={28} scale={[4.5, 3, 2]} size={2.4} speed={0.25} opacity={0.55} color="#ffffff" position={[0, 0.4, -0.5]} />}
      <Cushion color={color} />
      <ContactShadows position={[0, -1.105, 0]} opacity={0.45} scale={3.2} blur={2.2} far={1.5} color="#5b3fd0" />
    </Canvas>
  );
}
