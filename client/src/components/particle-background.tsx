import { useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMinimalMode } from "@/contexts/MinimalModeContext";

const PARTICLE_COUNT = 800;

interface ParticlesProps {
  isLight: boolean;
}

const Particles = ({ isLight }: ParticlesProps) => {
  const pointsRef = useRef<THREE.Points>(null);
  const mouse = useRef(new THREE.Vector2(0, 0));
  const mouseTarget = useRef(new THREE.Vector2(0, 0));

  const { viewport } = useThree();

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;

      if (isLight) {
        if (Math.random() > 0.3) {
          colors[i * 3] = 0.18 + Math.random() * 0.08;
          colors[i * 3 + 1] = 0.15 + Math.random() * 0.06;
          colors[i * 3 + 2] = 0.14 + Math.random() * 0.05;
        } else {
          colors[i * 3] = 0.28 + Math.random() * 0.1;
          colors[i * 3 + 1] = 0.16 + Math.random() * 0.06;
          colors[i * 3 + 2] = 0.12 + Math.random() * 0.05;
        }
      } else {
        if (Math.random() > 0.3) {
          colors[i * 3] = 0.42 + Math.random() * 0.12;
          colors[i * 3 + 1] = 0.38 + Math.random() * 0.1;
          colors[i * 3 + 2] = 0.35 + Math.random() * 0.08;
        } else {
          // Vivid terracotta — anchored to brand #DE7356 (0.87, 0.45, 0.34)
          colors[i * 3] = 0.85 + Math.random() * 0.15;
          colors[i * 3 + 1] = 0.40 + Math.random() * 0.10;
          colors[i * 3 + 2] = 0.28 + Math.random() * 0.08;
        }
      }
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [isLight]);

  const speeds = useMemo(() => {
    const s = new Float32Array(PARTICLE_COUNT);
    const o = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      s[i] = 0.2 + Math.random() * 0.5;
      o[i] = Math.random() * Math.PI * 2;
    }
    return { speeds: s, offsets: o };
  }, []);

  useFrame(({ clock, pointer }) => {
    if (!pointsRef.current) return;

    mouseTarget.current.set(pointer.x * viewport.width * 0.5, pointer.y * viewport.height * 0.5);
    mouse.current.lerp(mouseTarget.current, 0.05);

    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    const t = clock.getElapsedTime();
    const mx = mouse.current.x;
    const my = mouse.current.y;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const speed = speeds.speeds[i];
      const offset = speeds.offsets[i];

      arr[i3 + 1] += Math.sin(t * speed + offset + arr[i3] * 0.3) * 0.002;
      arr[i3] += Math.cos(t * speed * 0.5 + offset) * 0.001;

      const dx = arr[i3] - mx;
      const dy = arr[i3 + 1] - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2.5) {
        const force = (2.5 - dist) / 2.5 * 0.015;
        arr[i3] += dx * force;
        arr[i3 + 1] += dy * force;
      }

      if (arr[i3] > 8) arr[i3] = -8;
      if (arr[i3] < -8) arr[i3] = 8;
      if (arr[i3 + 1] > 5) arr[i3 + 1] = -5;
      if (arr[i3 + 1] < -5) arr[i3 + 1] = 5;
    }

    posAttr.needsUpdate = true;
  });

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: isLight ? 0.05 : 0.045,
        vertexColors: true,
        transparent: true,
        opacity: isLight ? 0.6 : 0.65,
        sizeAttenuation: true,
        depthWrite: false,
        blending: isLight ? THREE.NormalBlending : THREE.AdditiveBlending,
      }),
    [isLight]
  );

  return <points ref={pointsRef} geometry={geometry} material={material} />;
};

const ParticleBackground = () => {
  const { isLight } = useMinimalMode();

  return (
    <div className="fixed inset-0 z-0" style={{ width: "100vw", height: "100vh", pointerEvents: "auto" }}>
      <Canvas
        key={isLight ? "light" : "dark"}
        camera={{ position: [0, 0, 5], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: false }}
        style={{ background: "transparent", width: "100%", height: "100%", pointerEvents: "none" }}
        eventSource={typeof document !== "undefined" ? document.documentElement : undefined}
        eventPrefix="client"
      >
        <Particles isLight={isLight} />
      </Canvas>
    </div>
  );
};

export default ParticleBackground;
