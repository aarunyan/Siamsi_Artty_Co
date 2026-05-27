import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Float } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

const SHAKE_THRESHOLD = 30;
const SHAKE_INCREMENT = 1;
const SHAKE_DECAY_DELAY_MS = 420;
const SHAKE_DECAY_PER_SECOND = 2.25;
const SHAKE_DECAY_TICK_MS = 80;
const STICK_COUNT = 48;

const fortuneData = [
  {
    title: "Quiet Prosperity",
    message:
      "A steady opportunity is forming through patience and careful timing.",
    luckyColor: "Jade green",
    luckyNumber: 8,
    advice: "Choose the practical path and protect your energy.",
  },
  {
    title: "Clear Passage",
    message:
      "A delayed matter opens when you ask directly and remove ambiguity.",
    luckyColor: "Warm gold",
    luckyNumber: 12,
    advice: "Make one decisive request instead of many small hints.",
  },
  {
    title: "New Branch",
    message:
      "A fresh connection brings insight, but it needs gentle follow-through.",
    luckyColor: "Pearl white",
    luckyNumber: 3,
    advice: "Reply quickly to promising invitations.",
  },
  {
    title: "Hidden Support",
    message:
      "Help arrives from someone who has been quietly watching your effort.",
    luckyColor: "Deep red",
    luckyNumber: 16,
    advice: "Accept assistance without diluting your original goal.",
  },
  {
    title: "Balanced Flame",
    message:
      "Momentum is favorable, provided you do not force every door at once.",
    luckyColor: "Saffron",
    luckyNumber: 21,
    advice: "Focus on one important promise and complete it cleanly.",
  },
  {
    title: "Returning Light",
    message:
      "A previous uncertainty becomes useful once you look at it calmly.",
    luckyColor: "Sky blue",
    luckyNumber: 6,
    advice: "Review old notes before starting something new.",
  },
  {
    title: "Rising Bamboo",
    message:
      "Growth is already underway, even if the visible result feels modest.",
    luckyColor: "Moss green",
    luckyNumber: 18,
    advice: "Keep repeating the small habit that has been working.",
  },
  {
    title: "Golden Step",
    message:
      "A careful move now can become a larger gain within the next season.",
    luckyColor: "Amber",
    luckyNumber: 27,
    advice: "Negotiate clearly and write down the details.",
  },
  {
    title: "Soft Wind",
    message:
      "Pressure eases when you stop carrying a choice that belongs to others.",
    luckyColor: "Mist gray",
    luckyNumber: 10,
    advice: "Give people room to answer for themselves.",
  },
  {
    title: "Still Water",
    message:
      "The best answer is not loud. It appears when your routine becomes calm.",
    luckyColor: "Ink blue",
    luckyNumber: 2,
    advice: "Delay reactive decisions until tomorrow morning.",
  },
  {
    title: "Open Gate",
    message:
      "A route that looked closed has a smaller entrance nearby.",
    luckyColor: "Terracotta",
    luckyNumber: 14,
    advice: "Ask for the alternate process, not the exception.",
  },
  {
    title: "Bright Thread",
    message:
      "A conversation links two separate plans into one stronger direction.",
    luckyColor: "Rosewood",
    luckyNumber: 23,
    advice: "Introduce the right people and then step back.",
  },
];

const stickNumbers = Array.from({ length: STICK_COUNT }, (_, index) => index + 1);

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutBack(value) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}

function chooseFortune(number) {
  return fortuneData[(number - 1) % fortuneData.length];
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function buildEjectedSticks() {
  const count = Math.floor(randomBetween(1, 4));
  const shuffled = [...stickNumbers].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count).map((number, index) => {
    const centerOffset = index - (count - 1) / 2;
    const landingX = centerOffset * 0.56 + randomBetween(-0.08, 0.08);
    const landingZ = 2.15 + randomBetween(-0.12, 0.22);

    return {
      id: `${number}-${Date.now()}-${index}`,
      number,
      fortune: chooseFortune(number),
      delay: index * 0.16,
      launchOffset: [centerOffset * 0.1, 0, randomBetween(-0.05, 0.08)],
      landingPosition: [landingX, 0.12, landingZ],
      landingRotation: [
        Math.PI / 2 + randomBetween(-0.08, 0.08),
        randomBetween(-0.18, 0.18),
        randomBetween(-0.38, 0.38),
      ],
    };
  });
}

function useNumberTexture(number, large = false) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    const size = large ? 256 : 128;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255, 249, 232, 0.96)";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(107, 59, 33, 0.35)";
    ctx.lineWidth = large ? 10 : 6;
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
    ctx.fillStyle = "#6f2f24";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${large ? 118 : 56}px Georgia, serif`;
    ctx.fillText(String(number).padStart(2, "0"), size / 2, size / 2 + (large ? 3 : 1));

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    return texture;
  }, [number, large]);
}

function App() {
  const [shakeProgress, setShakeProgress] = useState(0);
  const [shakeEventId, setShakeEventId] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [ejectedSticks, setEjectedSticks] = useState([]);
  const [selectedStick, setSelectedStick] = useState(null);
  const hasEjectedRef = useRef(false);
  const lastShakeAtRef = useRef(0);

  const canShake = phase === "idle" || phase === "shaking";

  useEffect(() => {
    if (!canShake || hasEjectedRef.current) return undefined;

    const timer = window.setInterval(() => {
      const timeSinceLastShake = Date.now() - lastShakeAtRef.current;
      if (timeSinceLastShake < SHAKE_DECAY_DELAY_MS) return;

      setShakeProgress((current) => {
        if (current <= 0) return current;

        const next = Math.max(
          0,
          current - SHAKE_DECAY_PER_SECOND * (SHAKE_DECAY_TICK_MS / 1000)
        );

        if (next === 0) setPhase("idle");
        return next;
      });
    }, SHAKE_DECAY_TICK_MS);

    return () => window.clearInterval(timer);
  }, [canShake]);

  const handleShake = useCallback(() => {
    if (!canShake || hasEjectedRef.current) return;

    lastShakeAtRef.current = Date.now();
    setShakeEventId((current) => current + 1);
    setPhase("shaking");
    setShakeProgress((current) => {
      const next = Math.min(SHAKE_THRESHOLD, current + SHAKE_INCREMENT);

      if (next >= SHAKE_THRESHOLD && !hasEjectedRef.current) {
        hasEjectedRef.current = true;
        setEjectedSticks(buildEjectedSticks());
        setPhase("choosing");
      }

      return next;
    });
  }, [canShake]);

  const handleSelectStick = useCallback(
    (stick) => {
      if (phase !== "choosing") return;
      setSelectedStick(stick);
      setPhase("selected");
    },
    [phase]
  );

  const handleReset = useCallback(() => {
    hasEjectedRef.current = false;
    lastShakeAtRef.current = 0;
    setShakeProgress(0);
    setShakeEventId(0);
    setPhase("idle");
    setEjectedSticks([]);
    setSelectedStick(null);
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#f5efe5] font-sans text-stone-950">
      <Scene
        shakeProgress={shakeProgress}
        shakeEventId={shakeEventId}
        phase={phase}
        ejectedSticks={ejectedSticks}
        selectedStick={selectedStick}
        onShake={handleShake}
        onSelectStick={handleSelectStick}
      />
      <UIOverlay
        shakeProgress={shakeProgress}
        phase={phase}
        ejectedCount={ejectedSticks.length}
        onReset={handleReset}
      />
      <FortuneResultCard selectedStick={selectedStick} onReset={handleReset} />
    </main>
  );
}

function Scene({
  shakeProgress,
  shakeEventId,
  phase,
  ejectedSticks,
  selectedStick,
  onShake,
  onSelectStick,
}) {
  const isChoosing = phase === "choosing";

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 3.1, 6.2], fov: 43, near: 0.1, far: 80 }}
      gl={{ antialias: true, alpha: false }}
      onPointerDown={onShake}
      className={phase === "idle" || phase === "shaking" ? "cursor-pointer" : "cursor-default"}
    >
      <color attach="background" args={["#f5efe5"]} />
      <fog attach="fog" args={["#f5efe5", 8, 16]} />
      <ambientLight intensity={0.78} />
      <hemisphereLight args={["#fff6e8", "#6f7568", 1.1]} />
      <directionalLight
        castShadow
        position={[3.6, 6.4, 4.8]}
        intensity={2.15}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <spotLight
        castShadow
        position={[-2.7, 4.5, 3.2]}
        angle={0.5}
        penumbra={0.75}
        intensity={1.1}
        color="#ffe7b7"
      />

      <Suspense fallback={null}>
        <TempleBackground />
        <FortuneCup
          shakeProgress={shakeProgress}
          shakeEventId={shakeEventId}
          phase={phase}
        />

        {ejectedSticks.map((stick) => (
          <FortuneStick
            key={stick.id}
            mode="ejected"
            stick={stick}
            selected={selectedStick?.id === stick.id}
            disabled={!isChoosing}
            onSelect={onSelectStick}
          />
        ))}

        <ContactShadows
          position={[0, 0.025, 0]}
          opacity={0.44}
          scale={7}
          blur={2.4}
          far={3.8}
          color="#6a4a30"
        />
        <CameraRig phase={phase} selectedStick={selectedStick} />
      </Suspense>
    </Canvas>
  );
}

function TempleBackground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[5.9, 96]} />
        <meshStandardMaterial color="#eee2d2" roughness={0.9} metalness={0.02} />
      </mesh>

      <mesh position={[0, 1.2, -2.72]} receiveShadow>
        <boxGeometry args={[4.65, 2.35, 0.08]} />
        <meshStandardMaterial color="#f8f1e6" roughness={0.88} />
      </mesh>

      <mesh position={[0, 0.12, -2.58]} receiveShadow>
        <boxGeometry args={[4.25, 0.22, 0.55]} />
        <meshStandardMaterial color="#d7b788" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.31, -2.46]} receiveShadow>
        <boxGeometry args={[3.55, 0.18, 0.42]} />
        <meshStandardMaterial color="#ead0a2" roughness={0.78} />
      </mesh>

      {[-2.05, 2.05].map((x) => (
        <group key={x} position={[x, 0, -2.48]}>
          <mesh position={[0, 1.12, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 2.08, 0.18]} />
            <meshStandardMaterial color="#8f3b32" roughness={0.6} metalness={0.04} />
          </mesh>
          <mesh position={[0, 2.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.34, 0.16, 0.28]} />
            <meshStandardMaterial color="#6f2f24" roughness={0.55} />
          </mesh>
        </group>
      ))}

      <mesh position={[0, 2.28, -2.48]} castShadow receiveShadow>
        <boxGeometry args={[4.72, 0.22, 0.24]} />
        <meshStandardMaterial color="#7f332c" roughness={0.58} />
      </mesh>
      <mesh position={[0, 2.48, -2.48]} castShadow receiveShadow>
        <boxGeometry args={[5.15, 0.13, 0.32]} />
        <meshStandardMaterial color="#b59b62" roughness={0.5} metalness={0.12} />
      </mesh>

      {[-1.38, 1.38].map((x, index) => (
        <Float
          key={x}
          speed={0.8}
          floatIntensity={0.08}
          rotationIntensity={0.04}
        >
          <group position={[x, 1.78, -2.25]}>
            <mesh castShadow>
              <boxGeometry args={[0.28, 0.42, 0.18]} />
              <meshStandardMaterial
                color={index === 0 ? "#c85b41" : "#d8a24a"}
                emissive={index === 0 ? "#4c120b" : "#3e2605"}
                emissiveIntensity={0.22}
                roughness={0.62}
              />
            </mesh>
            <mesh position={[0, 0.27, 0]} castShadow>
              <boxGeometry args={[0.36, 0.05, 0.22]} />
              <meshStandardMaterial color="#5c2b24" roughness={0.56} />
            </mesh>
            <mesh position={[0, -0.27, 0]} castShadow>
              <boxGeometry args={[0.36, 0.05, 0.22]} />
              <meshStandardMaterial color="#5c2b24" roughness={0.56} />
            </mesh>
          </group>
        </Float>
      ))}
    </group>
  );
}

function FortuneCup({ shakeProgress, shakeEventId, phase }) {
  const cupRef = useRef();
  const lastCupEventRef = useRef(0);
  const cupPhysicsRef = useRef({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    vRotX: 0,
    vRotY: 0,
    vRotZ: 0,
    energy: 0,
  });
  const intensity = shakeProgress / SHAKE_THRESHOLD;

  useEffect(() => {
    if (shakeEventId === 0 || lastCupEventRef.current === shakeEventId) return;

    lastCupEventRef.current = shakeEventId;
    const physics = cupPhysicsRef.current;
    const progressRatio = clamp01(shakeProgress / SHAKE_THRESHOLD);
    const handDirection = shakeEventId % 2 === 0 ? 1 : -1;
    const force = 0.58 + progressRatio * 0.72;
    const offAxis = randomBetween(-0.16, 0.16);

    physics.vx += handDirection * randomBetween(0.72, 0.96) * force;
    physics.vz += offAxis * force;
    physics.vy += randomBetween(0.035, 0.075) * force;
    physics.vRotZ += -handDirection * randomBetween(1.15, 1.55) * force;
    physics.vRotX += randomBetween(-0.18, 0.18) * force;
    physics.vRotY += randomBetween(-0.42, 0.42) * force;
    physics.energy = Math.min(1, physics.energy + 0.26 + progressRatio * 0.22);
  }, [shakeEventId, shakeProgress]);

  useFrame(({ clock }, delta) => {
    if (!cupRef.current) return;

    const physics = cupPhysicsRef.current;
    const step = Math.min(delta, 0.033);
    const active = phase === "idle" || phase === "shaking";
    const spring = active ? 48 + intensity * 18 : 66;
    const damping = active ? 9.5 + intensity * 1.5 : 13.5;
    const rotationalSpring = active ? 54 + intensity * 16 : 72;
    const rotationalDamping = active ? 10.2 : 14.5;

    physics.vx += (-physics.x * spring - physics.vx * damping) * step;
    physics.vz += (-physics.z * (spring * 0.82) - physics.vz * damping) * step;
    physics.vy += (-physics.y * 78 - physics.vy * 16) * step;
    physics.vRotX +=
      (-physics.rotX * rotationalSpring - physics.vRotX * rotationalDamping) * step;
    physics.vRotY +=
      (-physics.rotY * (rotationalSpring * 0.7) - physics.vRotY * rotationalDamping) *
      step;
    physics.vRotZ +=
      (-physics.rotZ * rotationalSpring - physics.vRotZ * rotationalDamping) * step;

    physics.x = THREE.MathUtils.clamp(physics.x + physics.vx * step, -0.34, 0.34);
    physics.z = THREE.MathUtils.clamp(physics.z + physics.vz * step, -0.12, 0.12);
    physics.y = THREE.MathUtils.clamp(physics.y + physics.vy * step, -0.02, 0.07);
    physics.rotX = THREE.MathUtils.clamp(
      physics.rotX + physics.vRotX * step,
      -0.08,
      0.08
    );
    physics.rotY = THREE.MathUtils.clamp(
      physics.rotY + physics.vRotY * step,
      -0.12,
      0.12
    );
    physics.rotZ = THREE.MathUtils.clamp(
      physics.rotZ + physics.vRotZ * step,
      -0.24,
      0.24
    );
    physics.energy = THREE.MathUtils.damp(physics.energy, active ? intensity : 0, 5, delta);

    const tremor =
      active && physics.energy > 0.02
        ? Math.sin(clock.elapsedTime * (28 + physics.energy * 14)) * physics.energy * 0.012
        : 0;
    const secondary =
      active && physics.energy > 0.02
        ? Math.sin(clock.elapsedTime * 17.5 + 1.2) * physics.energy * 0.006
        : 0;

    cupRef.current.position.set(
      physics.x + tremor,
      Math.max(0, physics.y),
      physics.z + secondary
    );
    cupRef.current.rotation.set(
      physics.rotX + physics.z * 0.45,
      physics.rotY + physics.vx * 0.012,
      physics.rotZ - physics.x * 0.42
    );
  });

  return (
    <group ref={cupRef} position={[0, 0, 0]}>
      <group position={[0, 0.72, 0]}>
        {stickNumbers.map((number, index) => (
          <FortuneStick
            key={number}
            mode="contained"
            number={number}
            index={index}
            shakeProgress={shakeProgress}
            shakeEventId={shakeEventId}
          />
        ))}
      </group>

      <mesh position={[0, 0.66, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.88, 0.66, 1.28, 64, 1, true]} />
        <meshStandardMaterial
          color="#b9834b"
          roughness={0.58}
          metalness={0.04}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.62, 0.12, 64]} />
        <meshStandardMaterial color="#8f5c34" roughness={0.62} metalness={0.06} />
      </mesh>
      <mesh position={[0, 1.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.88, 0.035, 16, 90]} />
        <meshStandardMaterial color="#d7a866" roughness={0.48} metalness={0.08} />
      </mesh>
      {[0.31, 0.77, 1.12].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[THREE.MathUtils.lerp(0.66, 0.88, y / 1.28), 0.016, 10, 80]} />
          <meshStandardMaterial color="#6e3c25" roughness={0.5} metalness={0.03} />
        </mesh>
      ))}
    </group>
  );
}

function FortuneStick({
  mode,
  number,
  index = 0,
  shakeProgress = 0,
  shakeEventId = 0,
  stick,
  selected = false,
  disabled = false,
  onSelect,
}) {
  const groupRef = useRef();
  const startTimeRef = useRef(null);
  const lastStickEventRef = useRef(0);
  const stickDynamicsRef = useRef({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    energy: 0,
  });
  const isEjected = mode === "ejected";
  const stickNumber = isEjected ? stick.number : number;
  const labelTexture = useNumberTexture(stickNumber, isEjected);

  const base = useMemo(() => {
    const ring = index % 16;
    const layer = Math.floor(index / 16);
    const angle = (ring / 16) * Math.PI * 2 + layer * 0.17;
    const radius = 0.11 + (ring % 4) * 0.12 + layer * 0.015;
    return {
      position: [
        Math.cos(angle) * radius,
        0.72 + layer * 0.035,
        Math.sin(angle) * radius,
      ],
      rotation: [
        randomBetween(-0.14, 0.14),
        angle + Math.PI / 2,
        randomBetween(-0.19, 0.19),
      ],
    };
  }, [index]);

  useEffect(() => {
    if (isEjected || shakeEventId === 0 || lastStickEventRef.current === shakeEventId) {
      return;
    }

    lastStickEventRef.current = shakeEventId;
    const dynamics = stickDynamicsRef.current;
    const progressRatio = clamp01(shakeProgress / SHAKE_THRESHOLD);
    const alternatingDirection = (shakeEventId + index) % 2 === 0 ? 1 : -1;
    const radiusFactor = 0.7 + Math.abs(base.position[0]) + Math.abs(base.position[2]);
    const impulse = (0.12 + progressRatio * 0.18) * radiusFactor;

    dynamics.vx += alternatingDirection * randomBetween(0.42, 0.78) * impulse;
    dynamics.vz += randomBetween(-0.54, 0.54) * impulse;
    dynamics.vy += randomBetween(0.05, 0.13) * (0.55 + progressRatio);
    dynamics.energy = Math.min(1, dynamics.energy + 0.18 + progressRatio * 0.18);
  }, [base.position, index, isEjected, shakeEventId, shakeProgress]);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;

    if (!isEjected) {
      const dynamics = stickDynamicsRef.current;
      const step = Math.min(delta, 0.033);
      const intensity = clamp01(shakeProgress / SHAKE_THRESHOLD);
      const stiffness = 34 + intensity * 18 + (index % 5) * 1.2;
      const damping = 8.5 + intensity * 1.8;
      const verticalStiffness = 42 + intensity * 18;

      dynamics.vx += (-dynamics.x * stiffness - dynamics.vx * damping) * step;
      dynamics.vz += (-dynamics.z * stiffness - dynamics.vz * damping) * step;
      dynamics.vy += (-dynamics.y * verticalStiffness - dynamics.vy * 9.2) * step;
      dynamics.x = THREE.MathUtils.clamp(dynamics.x + dynamics.vx * step, -0.06, 0.06);
      dynamics.z = THREE.MathUtils.clamp(dynamics.z + dynamics.vz * step, -0.055, 0.055);
      dynamics.y = THREE.MathUtils.clamp(dynamics.y + dynamics.vy * step, -0.035, 0.16);
      dynamics.energy = THREE.MathUtils.damp(dynamics.energy, intensity, 4.8, delta);

      const fastPhase = clock.elapsedTime * (18 + (index % 7) * 1.4) + index * 0.67;
      const slowPhase = clock.elapsedTime * (8.5 + (index % 4) * 0.9) + index * 0.28;
      const jitterX =
        Math.sin(fastPhase) * dynamics.energy * 0.013 +
        Math.sin(slowPhase) * dynamics.energy * 0.008;
      const jitterZ =
        Math.cos(fastPhase * 0.88) * dynamics.energy * 0.011 +
        Math.sin(slowPhase + 1.8) * dynamics.energy * 0.007;
      const rise = easeOutCubic(intensity) * 0.44;
      const contactBounce =
        Math.max(0, dynamics.y) +
        Math.abs(Math.sin(fastPhase * 0.55)) * dynamics.energy * 0.028;

      groupRef.current.position.set(
        base.position[0] + dynamics.x + jitterX,
        base.position[1] + rise + contactBounce,
        base.position[2] + dynamics.z + jitterZ
      );
      groupRef.current.rotation.set(
        base.rotation[0] - dynamics.z * 1.35 + Math.sin(fastPhase) * dynamics.energy * 0.07,
        base.rotation[1] + Math.sin(slowPhase) * dynamics.energy * 0.045,
        base.rotation[2] + dynamics.x * 1.7 + Math.cos(fastPhase * 0.95) * dynamics.energy * 0.08
      );
      return;
    }

    if (startTimeRef.current === null) startTimeRef.current = clock.elapsedTime;

    const elapsed = clock.elapsedTime - startTimeRef.current - stick.delay;
    const rawFlight = clamp01(elapsed / 1.18);
    const eased = easeOutCubic(rawFlight);
    const settle = clamp01((elapsed - 1.18) / 0.48);
    const start = new THREE.Vector3(
      stick.launchOffset[0],
      1.58,
      stick.launchOffset[2] - 0.05
    );
    const end = new THREE.Vector3(...stick.landingPosition);
    const current = start.lerp(end, eased);
    const arc = Math.sin(rawFlight * Math.PI) * 1.22;
    const softDrop = settle > 0 ? Math.sin(settle * Math.PI) * 0.06 * (1 - settle) : 0;
    current.y += arc + softDrop;

    groupRef.current.position.lerp(current, 1 - Math.exp(-18 * delta));

    if (rawFlight < 1) {
      groupRef.current.rotation.set(
        THREE.MathUtils.lerp(0.16, stick.landingRotation[0], eased),
        clock.elapsedTime * 4.8 + stick.number * 0.04,
        THREE.MathUtils.lerp(0.08, stick.landingRotation[2], eased)
      );
    } else {
      const landingLift = selected ? 0.055 + Math.sin(clock.elapsedTime * 3) * 0.012 : 0;
      groupRef.current.position.y = THREE.MathUtils.damp(
        groupRef.current.position.y,
        stick.landingPosition[1] + landingLift,
        10,
        delta
      );
      groupRef.current.rotation.x = THREE.MathUtils.damp(
        groupRef.current.rotation.x,
        stick.landingRotation[0],
        12,
        delta
      );
      groupRef.current.rotation.y = THREE.MathUtils.damp(
        groupRef.current.rotation.y,
        stick.landingRotation[1],
        12,
        delta
      );
      groupRef.current.rotation.z = THREE.MathUtils.damp(
        groupRef.current.rotation.z,
        stick.landingRotation[2],
        12,
        delta
      );
    }

    const targetScale = selected ? 1.16 : 1;
    groupRef.current.scale.lerp(
      new THREE.Vector3(targetScale, targetScale, targetScale),
      1 - Math.exp(-8 * delta)
    );
  });

  const handlePointerDown = useCallback(
    (event) => {
      if (!isEjected || disabled) return;
      event.stopPropagation();
      onSelect(stick);
    },
    [disabled, isEjected, onSelect, stick]
  );

  return (
    <group
      ref={groupRef}
      onPointerDown={handlePointerDown}
      userData={{ selectable: isEjected }}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[isEjected ? 0.24 : 0.075, 1.58, isEjected ? 0.065 : 0.045]} />
        <meshStandardMaterial
          color={selected ? "#fff1bf" : "#f5d78b"}
          roughness={0.52}
          metalness={0.02}
          emissive={selected ? "#d99d32" : "#000000"}
          emissiveIntensity={selected ? 0.16 : 0}
        />
      </mesh>
      <mesh
        position={[0, 0.5, isEjected ? -0.034 : 0.025]}
        rotation={isEjected ? [0, Math.PI, Math.PI] : [0, 0, 0]}
      >
        <planeGeometry args={[isEjected ? 0.26 : 0.19, isEjected ? 0.24 : 0.18]} />
        <meshBasicMaterial
          map={labelTexture}
          transparent
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, -0.58, isEjected ? -0.035 : 0.026]}>
        <boxGeometry args={[isEjected ? 0.18 : 0.065, 0.04, 0.008]} />
        <meshStandardMaterial color="#8b3c2f" roughness={0.5} />
      </mesh>
      {isEjected && (
        <mesh position={[0, -0.13, -0.035]}>
          <boxGeometry args={[0.18, 0.025, 0.008]} />
          <meshStandardMaterial color="#b8703d" roughness={0.55} />
        </mesh>
      )}
    </group>
  );
}

function CameraRig({ phase, selectedStick }) {
  const { camera, size } = useThree();
  const lookAtRef = useRef(new THREE.Vector3(0, 0.9, 0));

  useFrame((_, delta) => {
    const mobile = size.width < 700;
    let targetPosition = new THREE.Vector3(0, mobile ? 3.15 : 3.0, mobile ? 7.15 : 6.1);
    let targetLookAt = new THREE.Vector3(0, 0.92, 0);

    if (phase === "choosing") {
      targetPosition = new THREE.Vector3(0, mobile ? 3.35 : 2.45, mobile ? 7.6 : 5.25);
      targetLookAt = new THREE.Vector3(0, 0.52, 1.45);
    }

    if (selectedStick) {
      const [x, y, z] = selectedStick.landingPosition;
      targetPosition = new THREE.Vector3(
        x * 0.28,
        mobile ? 1.75 : 1.48,
        z + (mobile ? 3.25 : 2.45)
      );
      targetLookAt = new THREE.Vector3(x, y + 0.18, z);
    }

    camera.position.lerp(targetPosition, 1 - Math.exp(-3.7 * delta));
    lookAtRef.current.lerp(targetLookAt, 1 - Math.exp(-5.2 * delta));
    camera.lookAt(lookAtRef.current);
  });

  return null;
}

function UIOverlay({ shakeProgress, phase, ejectedCount, onReset }) {
  const instruction =
    phase === "choosing"
      ? "Choose one fortune stick"
      : phase === "selected"
        ? "Your fortune has been revealed"
        : "Click repeatedly to shake the fortune cup";

  const displayedProgress = Math.min(SHAKE_THRESHOLD, Math.ceil(shakeProgress));
  const percent = Math.round((shakeProgress / SHAKE_THRESHOLD) * 100);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <section className="w-full max-w-sm rounded-lg border border-white/70 bg-white/72 p-4 shadow-warm backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8d3f32]">
              Fortune sticks
            </p>
            <span className="rounded-full bg-[#174d43] px-2.5 py-1 text-xs font-semibold text-[#f8edd7]">
              {percent}%
            </span>
          </div>
          <p className="mt-3 text-lg font-semibold leading-tight text-stone-950">
            Shake progress: {displayedProgress} / {SHAKE_THRESHOLD}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
            <div
              className="h-full rounded-full bg-[#9b3f32] transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-3 text-sm leading-5 text-stone-700">{instruction}</p>
        </section>

        <button
          type="button"
          onClick={onReset}
          className="pointer-events-auto self-start rounded-lg border border-[#7b4b2a]/25 bg-[#fff9ed]/90 px-4 py-2 text-sm font-semibold text-[#5f2d24] shadow-warm backdrop-blur-md transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#9b3f32]/40"
        >
          Reset
        </button>
      </div>

      {phase === "choosing" && (
        <div className="absolute left-1/2 top-56 -translate-x-1/2 rounded-lg border border-[#caa66e]/45 bg-[#fffaf0]/95 px-5 py-3 text-center shadow-warm backdrop-blur-md sm:top-6">
          <p className="text-sm font-semibold text-[#6a2f27]">
            Choose one fortune stick
          </p>
          <p className="mt-1 text-xs text-stone-600">
            {ejectedCount} stick{ejectedCount === 1 ? "" : "s"} landed in front of the cup
          </p>
        </div>
      )}
    </div>
  );
}

function FortuneResultCard({ selectedStick, onReset }) {
  if (!selectedStick) return null;

  const { number, fortune } = selectedStick;

  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-10 mx-auto max-w-xl rounded-lg border border-[#cba46b]/45 bg-[#fffaf0] p-5 shadow-warm sm:bottom-6 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8d3f32]">
            Selected stick
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-none text-stone-950">
            No. {String(number).padStart(2, "0")}
          </h1>
        </div>
        <span className="rounded-lg bg-[#174d43] px-3 py-2 text-sm font-semibold text-[#fff3dc]">
          {fortune.luckyColor}
        </span>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-[1.2fr_0.8fr]">
        <section>
          <h2 className="text-xl font-semibold text-[#5b2a22]">{fortune.title}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-700">{fortune.message}</p>
        </section>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-1">
          <div className="rounded-lg border border-[#d6bb86]/55 bg-white/70 p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Lucky color
            </dt>
            <dd className="mt-1 text-base font-semibold text-stone-950">
              {fortune.luckyColor}
            </dd>
          </div>
          <div className="rounded-lg border border-[#d6bb86]/55 bg-white/58 p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Lucky number
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-stone-950">
              {fortune.luckyNumber}
            </dd>
          </div>
          <div className="rounded-lg border border-[#d6bb86]/55 bg-white/58 p-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
              Advice
            </dt>
            <dd className="mt-1 text-sm leading-5 text-stone-700">{fortune.advice}</dd>
          </div>
        </dl>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="mt-5 w-full rounded-lg bg-[#8d3f32] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#743229] focus:outline-none focus:ring-2 focus:ring-[#8d3f32]/35"
      >
        Shake again
      </button>
    </div>
  );
}

export default App;
