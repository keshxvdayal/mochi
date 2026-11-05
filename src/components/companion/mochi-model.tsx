"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { live } from "@/lib/companion-state";
import { BODY_COLORS, EYE_COLORS, type Accessory, type BodyColor, type EyeColor, type Mood } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Expression targets per mood. Every value eases toward its target    *
 * each frame, so switching mood morphs the face instead of snapping.  *
 * ------------------------------------------------------------------ */
type Pose = {
  smile: number; // -1 frown … 1 big smile
  mouthOpen: number;
  eyeOpen: number;
  arcL: number; // 0 open eye … 1 happy ^ arc
  arcR: number;
  lid: number; // eye squash 0..1
  lidTilt: number; // + angry / - sad
  browY: number;
  browTilt: number;
  blush: number; // > 1 shows anime blush lines
  ear: number; // + perked … - drooped
  flop: number; // ear tip flop 0..1
  bloom: number; // flower on the sprout: 0 closed/wilted … 1 open
  tilt: number;
  bounce: number;
  arms: "rest" | "wave" | "up" | "hug" | "think" | "fists" | "down";
  tint: string;
};

const POSES: Record<Mood, Pose> = {
  neutral: { smile: 0.45, mouthOpen: 0, eyeOpen: 1, arcL: 0, arcR: 0, lid: 0, lidTilt: 0, browY: 0, browTilt: 0, blush: 0.5, ear: 0, flop: 0.15, bloom: 0.45, tilt: 0, bounce: 0.5, arms: "rest", tint: "#ffffff" },
  happy: { smile: 0.95, mouthOpen: 0.14, eyeOpen: 1.05, arcL: 0, arcR: 0, lid: 0, lidTilt: 0, browY: 0.03, browTilt: -0.1, blush: 0.8, ear: 0.3, flop: 0.05, bloom: 0.85, tilt: 0.05, bounce: 1, arms: "wave", tint: "#ffffff" },
  excited: { smile: 1, mouthOpen: 0.45, eyeOpen: 1.18, arcL: 0, arcR: 0, lid: 0, lidTilt: 0, browY: 0.07, browTilt: -0.15, blush: 0.95, ear: 0.6, flop: 0, bloom: 1, tilt: 0, bounce: 2.2, arms: "up", tint: "#ffffff" },
  love: { smile: 0.85, mouthOpen: 0.05, eyeOpen: 1, arcL: 1, arcR: 1, lid: 0, lidTilt: 0, browY: 0.03, browTilt: -0.2, blush: 1.4, ear: 0.2, flop: 0.2, bloom: 1, tilt: 0.14, bounce: 0.8, arms: "hug", tint: "#fff3f6" },
  proud: { smile: 0.9, mouthOpen: 0.08, eyeOpen: 1, arcL: 1, arcR: 1, lid: 0, lidTilt: 0, browY: 0.05, browTilt: -0.05, blush: 0.75, ear: 0.45, flop: 0, bloom: 1, tilt: -0.06, bounce: 0.9, arms: "fists", tint: "#ffffff" },
  playful: { smile: 0.9, mouthOpen: 0.15, eyeOpen: 1.05, arcL: 1, arcR: 0, lid: 0, lidTilt: 0, browY: 0.04, browTilt: 0.15, blush: 0.85, ear: 0.35, flop: 0.1, bloom: 0.8, tilt: 0.12, bounce: 1.3, arms: "wave", tint: "#ffffff" },
  sad: { smile: -0.7, mouthOpen: 0.04, eyeOpen: 0.95, arcL: 0, arcR: 0, lid: 0.15, lidTilt: -0.55, browY: 0.02, browTilt: -0.55, blush: 0.25, ear: -0.9, flop: 1, bloom: 0, tilt: -0.08, bounce: 0.15, arms: "down", tint: "#e4ecff" },
  worried: { smile: -0.35, mouthOpen: 0.08, eyeOpen: 1.05, arcL: 0, arcR: 0, lid: 0.08, lidTilt: -0.35, browY: 0.05, browTilt: -0.45, blush: 0.35, ear: -0.4, flop: 0.6, bloom: 0.15, tilt: 0.06, bounce: 0.35, arms: "hug", tint: "#f2f4ff" },
  angry: { smile: -0.75, mouthOpen: 0.12, eyeOpen: 0.95, arcL: 0, arcR: 0, lid: 0.3, lidTilt: 0.6, browY: -0.05, browTilt: 0.6, blush: 0.55, ear: -0.25, flop: 0, bloom: 0.1, tilt: 0, bounce: 0.6, arms: "fists", tint: "#ffd0c8" },
  surprised: { smile: 0, mouthOpen: 0.75, eyeOpen: 1.3, arcL: 0, arcR: 0, lid: 0, lidTilt: 0, browY: 0.12, browTilt: -0.1, blush: 0.5, ear: 0.8, flop: 0, bloom: 0.95, tilt: 0, bounce: 0.4, arms: "up", tint: "#ffffff" },
  thinking: { smile: 0.15, mouthOpen: 0, eyeOpen: 0.95, arcL: 0, arcR: 0, lid: 0.12, lidTilt: 0, browY: 0.06, browTilt: 0.25, blush: 0.4, ear: 0.1, flop: 0.3, bloom: 0.35, tilt: 0.2, bounce: 0.25, arms: "think", tint: "#ffffff" },
  sleepy: { smile: 0.25, mouthOpen: 0.05, eyeOpen: 0.95, arcL: 0, arcR: 0, lid: 0.62, lidTilt: 0, browY: -0.01, browTilt: 0, blush: 0.4, ear: -0.55, flop: 0.8, bloom: 0.1, tilt: 0.1, bounce: 0.1, arms: "rest", tint: "#f1efff" },
};

const NUMERIC = ["smile", "mouthOpen", "eyeOpen", "arcL", "arcR", "lid", "lidTilt", "browY", "browTilt", "blush", "ear", "flop", "bloom", "tilt", "bounce"] as const;

/* ------------------------------------------------------------------ *
 * Procedural textures & geometry                                      *
 * ------------------------------------------------------------------ */
function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Kawaii eye: dark top, glowing gradient iris, pupil, iris streaks, sparkles. */
function eyeTexture(iris: string) {
  return canvasTexture(512, (g, s) => {
    const c = s / 2;
    const cy = c * 1.04;
    g.fillStyle = "#1a0f2e";
    g.fillRect(0, 0, s, s);
    g.save();
    g.beginPath();
    g.arc(c, cy, s * 0.4, 0, Math.PI * 2);
    g.clip();
    const lin = g.createLinearGradient(0, cy - s * 0.4, 0, cy + s * 0.42);
    lin.addColorStop(0, "#1a0f2e");
    lin.addColorStop(0.45, new THREE.Color(iris).multiplyScalar(0.55).getStyle());
    lin.addColorStop(1, new THREE.Color(iris).lerp(new THREE.Color("#ffffff"), 0.35).getStyle());
    g.fillStyle = lin;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = "rgba(255,255,255,0.13)";
    g.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      g.beginPath();
      g.moveTo(c + Math.cos(a) * s * 0.16, cy + Math.sin(a) * s * 0.16);
      g.lineTo(c + Math.cos(a) * s * 0.38, cy + Math.sin(a) * s * 0.38);
      g.stroke();
    }
    const glow = g.createRadialGradient(c, c * 1.5, 0, c, c * 1.5, s * 0.3);
    glow.addColorStop(0, "rgba(255,255,255,0.45)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, s, s);
    g.restore();
    g.strokeStyle = "rgba(20,8,40,0.9)";
    g.lineWidth = s * 0.025;
    g.beginPath();
    g.arc(c, cy, s * 0.4, 0, Math.PI * 2);
    g.stroke();
    const pg = g.createRadialGradient(c, c * 1.02, 0, c, c * 1.02, s * 0.17);
    pg.addColorStop(0, "#07030f");
    pg.addColorStop(1, "#1a0f2e");
    g.fillStyle = pg;
    g.beginPath();
    g.arc(c, c * 1.02, s * 0.17, 0, Math.PI * 2);
    g.fill();
    const star = (x: number, y: number, r: number, a: number) => {
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.3;
        g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
      }
      g.fill();
    };
    star(c - s * 0.2, c + s * 0.22, s * 0.05, 0.85);
    star(c + s * 0.22, c + s * 0.16, s * 0.03, 0.6);
    star(c - s * 0.05, c + s * 0.3, s * 0.022, 0.5);
  });
}

function radialTexture(inner: string, outer: string) {
  return canvasTexture(128, (g, s) => {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
}

/** Sphere with planar UVs on the front, so a flat eye texture wraps the bulge without distortion. */
function eyeGeometry() {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, pos.getY(i) * 0.5 + 0.5);
  return g;
}

function heartShape(k = 1) {
  const s = new THREE.Shape();
  s.moveTo(0, 0.25 * k);
  s.bezierCurveTo(0, 0.28 * k, -0.05 * k, 0.4 * k, -0.25 * k, 0.4 * k);
  s.bezierCurveTo(-0.55 * k, 0.4 * k, -0.55 * k, 0.05 * k, -0.55 * k, 0.05 * k);
  s.bezierCurveTo(-0.55 * k, -0.12 * k, -0.35 * k, -0.34 * k, 0, -0.52 * k);
  s.bezierCurveTo(0.35 * k, -0.34 * k, 0.55 * k, -0.12 * k, 0.55 * k, 0.05 * k);
  s.bezierCurveTo(0.55 * k, 0.05 * k, 0.55 * k, 0.4 * k, 0.25 * k, 0.4 * k);
  s.bezierCurveTo(0.1 * k, 0.4 * k, 0, 0.28 * k, 0, 0.25 * k);
  return s;
}

function zShape() {
  const s = new THREE.Shape();
  const pts = [[-0.5, 0.5], [0.5, 0.5], [0.5, 0.32], [-0.18, -0.32], [0.5, -0.32], [0.5, -0.5], [-0.5, -0.5], [-0.5, -0.32], [0.18, 0.32], [-0.5, 0.32]];
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

/** Body with the belly painted in through vertex colours (no seams, no clipping). */
function bodyGeometry(body: string, belly: string) {
  const g = new THREE.SphereGeometry(1, 160, 120);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBody = new THREE.Color(body);
  const cBelly = new THREE.Color(belly);
  const dir = new THREE.Vector3(0, -0.75, 1).normalize();
  const v = new THREE.Vector3();
  const out = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const w = THREE.MathUtils.smoothstep(v.dot(dir), 0.7, 0.8);
    out.copy(cBody).lerp(cBelly, w * 0.95);
    out.offsetHSL(0, 0, (v.y - 0.2) * 0.04);
    colors.set([out.r, out.g, out.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Soft fur halo: a brighter, semi-transparent rim where the surface turns away from the camera. */
function furMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0.6 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        gl_FragColor = vec4(uColor, f * uStrength);
      }`,
  });
}

const damp = THREE.MathUtils.damp;

function Plush({ color, roughness = 0.55, sheen = 0.45 }: { color: string; roughness?: number; sheen?: number }) {
  return <meshPhysicalMaterial color={color} roughness={roughness} sheen={sheen} sheenRoughness={0.5} sheenColor="#ffffff" clearcoat={0.08} />;
}

type IdleKind = "look" | "earTwitch" | "hop" | "stretch" | "spin" | "doubleBlink";

/* ------------------------------------------------------------------ *
 * The character                                                       *
 * ------------------------------------------------------------------ */
export function MochiModel({ color, eyeColor = "violet", accessory = "none" }: { color: BodyColor; eyeColor?: EyeColor; accessory?: Accessory }) {
  const palette = BODY_COLORS[color];
  const bodyGeo = useMemo(() => bodyGeometry(palette.body, palette.belly), [palette.body, palette.belly]);
  const fur = useMemo(() => furMaterial(new THREE.Color(palette.belly).lerp(new THREE.Color("#ffffff"), 0.5).getStyle()), [palette.belly]);
  const tipColor = useMemo(() => new THREE.Color(palette.body).offsetHSL(0, 0.05, -0.07).getStyle(), [palette.body]);
  const eyeTex = useMemo(() => eyeTexture(EYE_COLORS[eyeColor]), [eyeColor]);
  const eyeGeo = useMemo(() => eyeGeometry(), []);
  const blushTex = useMemo(() => radialTexture("rgba(255,95,140,1)", "rgba(255,110,150,0)"), []);
  const heartGeo = useMemo(() => new THREE.ExtrudeGeometry(heartShape(), { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 4 }).center(), []);
  const zGeo = useMemo(() => new THREE.ExtrudeGeometry(zShape(), { depth: 0.15, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).center(), []);
  const sproutCurve = useMemo(() => new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.12, 0), new THREE.Vector3(-0.03, 0.24, 0), new THREE.Vector3(0.02, 0.34, 0)]), []);

  const root = useRef<THREE.Group>(null!);
  const bodyMat = useRef<THREE.MeshPhysicalMaterial>(null!);
  const head = useRef<THREE.Group>(null!);
  const eyes = useRef<THREE.Group[]>([]);
  const ovals = useRef<THREE.Group[]>([]);
  const arcs = useRef<THREE.Mesh[]>([]);
  const brows = useRef<THREE.Mesh[]>([]);
  const ears = useRef<THREE.Group[]>([]);
  const earTips = useRef<THREE.Group[]>([]);
  const arms = useRef<THREE.Group[]>([]);
  const blush = useRef<THREE.Mesh[]>([]);
  const blushLines = useRef<THREE.Group[]>([]);
  const petals = useRef<THREE.Group[]>([]);
  const smileLine = useRef<THREE.Mesh>(null!);
  const mouthOpen = useRef<THREE.Group>(null!);
  const sprout = useRef<THREE.Group>(null!);
  const hearts = useRef<THREE.Group>(null!);
  const tears = useRef<THREE.Group>(null!);
  const anger = useRef<THREE.Group>(null!);
  const zs = useRef<THREE.Group>(null!);
  const bang = useRef<THREE.Group>(null!);
  const dots = useRef<THREE.Group>(null!);
  const stars = useRef<THREE.Group>(null!);

  const s = useRef({
    ...POSES.happy,
    blink: 1,
    nextBlink: 2,
    talk: 0,
    sproutV: 0,
    sproutA: 0,
    lookX: 0,
    lookY: 0,
    tipV: [0, 0],
    tipA: [0, 0],
    lastHeadY: 0,
    tint: new THREE.Color("#fff"),
    idle: null as null | { kind: IdleKind; start: number; dur: number; dir: number },
    nextIdle: 5,
  });

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const st = s.current;
    const mood: Mood = live.thinking && !live.speaking ? "thinking" : live.mood;
    const target = POSES[mood] ?? POSES.neutral;
    dt = Math.min(dt, 0.05);

    for (const k of NUMERIC) st[k] = damp(st[k], target[k], 7, dt);
    st.tint.lerp(new THREE.Color(target.tint), 1 - Math.exp(-4 * dt));
    bodyMat.current.color.copy(st.tint);

    // Idle actions every few seconds while nothing else is going on.
    st.nextIdle -= dt;
    if (st.nextIdle <= 0 && !live.speaking && !live.thinking && !live.listening) {
      const lively = ["happy", "excited", "playful", "proud", "love"].includes(mood);
      const pool: IdleKind[] = lively
        ? ["look", "earTwitch", "hop", "stretch", "spin", "doubleBlink"]
        : mood === "sleepy" || mood === "sad"
          ? ["look", "earTwitch", "doubleBlink"]
          : ["look", "earTwitch", "hop", "doubleBlink", "stretch"];
      const kind = pool[Math.floor(Math.random() * pool.length)];
      st.idle = { kind, start: t, dur: kind === "spin" ? 1.1 : kind === "look" ? 2.2 : 0.9, dir: Math.random() < 0.5 ? -1 : 1 };
      st.nextIdle = 5 + Math.random() * 7;
      if (kind === "doubleBlink") {
        st.blink = 0;
        st.nextBlink = 0.22;
      }
    }
    const idleP = st.idle ? (t - st.idle.start) / st.idle.dur : 1;
    if (idleP >= 1) st.idle = null;
    const env = st.idle ? Math.sin(Math.PI * Math.min(1, idleP)) : 0;
    const idleIs = (k: IdleKind) => st.idle?.kind === k;

    // Poke: squish + giggle.
    const sincePoke = performance.now() / 1000 - live.pokeAt;
    const poked = sincePoke < 0.6;
    const pokeSquish = poked ? Math.sin(sincePoke * 22) * Math.exp(-sincePoke * 6) * 0.14 : 0;

    // Mouth: the natural voice drives it from real loudness; the browser voice from word boundaries.
    const sinceWord = performance.now() / 1000 - live.lastBoundary;
    const talkTarget = !live.speaking
      ? 0
      : live.audioLevel >= 0
        ? THREE.MathUtils.clamp(live.audioLevel * 1.4, 0, 1)
        : Math.max(0.15, Math.exp(-sinceWord * 7)) * (0.7 + 0.3 * Math.sin(t * 23));
    st.talk = damp(st.talk, talkTarget, 22, dt);
    const open = Math.max(st.mouthOpen, st.talk * 0.95, poked ? 0.5 : 0);

    // Body: breathing, bounce, squash & stretch, idle hop/spin.
    const breath = Math.sin(t * 2) * 0.015;
    const hop = Math.abs(Math.sin(t * (2.2 + st.bounce))) * 0.06 * st.bounce + (idleIs("hop") ? env * 0.28 : 0);
    root.current.position.y = -0.1 + hop + Math.sin(t * 1.3) * 0.03;
    root.current.rotation.y = idleIs("spin") ? Math.min(1, idleP) * Math.PI * 2 : damp(root.current.rotation.y % (Math.PI * 2), 0, 6, dt);
    const squash = 1 + breath - pokeSquish + st.talk * 0.02 - (idleIs("hop") ? Math.sin(Math.PI * Math.min(1, idleP * 2)) * 0.05 : 0);
    root.current.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

    // Head: look toward the pointer with idle wandering.
    const px = state.pointer.x + Math.sin(t * 0.37) * 0.15 + (idleIs("look") ? env * 0.9 * st.idle!.dir : 0);
    const py = state.pointer.y + Math.cos(t * 0.29) * 0.1;
    st.lookX = damp(st.lookX, THREE.MathUtils.clamp(px, -1, 1), 4, dt);
    st.lookY = damp(st.lookY, THREE.MathUtils.clamp(py, -1, 1), 4, dt);
    head.current.rotation.y = st.lookX * 0.32;
    head.current.rotation.x = -st.lookY * 0.18 + (mood === "sad" ? 0.12 : 0);
    head.current.rotation.z = st.tilt + Math.sin(t * 0.9) * 0.025 + (mood === "love" ? Math.sin(t * 2) * 0.08 : 0) + (poked ? Math.sin(sincePoke * 30) * 0.06 : 0);

    // Blink.
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) {
      st.blink = 0;
      st.nextBlink = 2 + Math.random() * 3.5;
    }
    st.blink = damp(st.blink, 1, 18, dt);
    const blinkScale = st.blink < 0.5 ? 0.06 : st.blink;

    // Eyes, brows, blush.
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const arcAmt = poked ? 1 : i === 0 ? st.arcL : st.arcR;
      eyes.current[i].position.x = side * 0.34 + st.lookX * 0.035;
      eyes.current[i].position.y = 0.13 + st.lookY * 0.03;
      const openY = st.eyeOpen * blinkScale * (1 - st.lid * 0.75) * Math.max(0, 1 - arcAmt * 1.6);
      ovals.current[i].scale.set(1 + st.lid * 0.08, Math.max(0.04, openY), 1);
      ovals.current[i].rotation.z = side * st.lidTilt * 0.22;
      ovals.current[i].visible = arcAmt < 0.6;
      const arcS = THREE.MathUtils.smoothstep(arcAmt, 0.3, 0.9);
      arcs.current[i].scale.set(Math.max(0.001, arcS), Math.max(0.001, arcS * 0.75), Math.max(0.001, arcS));
      brows.current[i].position.y = 0.41 + st.browY - Math.max(0, st.browTilt) * 0.1 + (live.listening ? 0.04 : 0);
      brows.current[i].rotation.z = side * st.browTilt * 1.05 + Math.PI / 2;
      (blush.current[i].material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(st.blush * (0.75 + 0.1 * Math.sin(t * 3)), 0, 1);
      const lines = THREE.MathUtils.clamp((st.blush - 1) * 3, 0, 1);
      blushLines.current[i].visible = lines > 0.02;
      for (const c of blushLines.current[i].children) ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = lines * 0.9;
    }

    // Smile & mouth.
    smileLine.current.rotation.z = st.smile >= 0 ? Math.PI : 0;
    smileLine.current.scale.set(0.8 + Math.abs(st.smile) * 0.4, Math.max(0.08, Math.abs(st.smile)) * 0.9, 1);
    smileLine.current.position.y = st.smile >= 0 ? 0.02 : -0.03;
    smileLine.current.visible = open < 0.18;
    mouthOpen.current.visible = open >= 0.06;
    mouthOpen.current.scale.set(0.75 + open * 0.35 + Math.max(0, st.smile) * 0.25, 0.15 + open * 1.1, 1);

    // Ears: base perks/droops; tips flop with mood and swing with movement (spring).
    const headVel = (head.current.rotation.y - st.lastHeadY) / Math.max(dt, 1e-3);
    st.lastHeadY = head.current.rotation.y;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const twitch = idleIs("earTwitch") && st.idle!.dir === side ? Math.sin(t * 40) * 0.18 * env : 0;
      ears.current[i].rotation.z = side * (-0.28 - Math.max(0, -st.ear) * 0.75 + Math.max(0, st.ear) * 0.12) + Math.sin(t * 6 + i) * 0.03 * st.bounce + twitch;
      ears.current[i].rotation.x = -Math.max(0, -st.ear) * 0.3 - (mood === "angry" ? 0.35 : 0);
      const accel = (root.current.position.y - st.tipA[i]) * 60;
      st.tipA[i] = root.current.position.y;
      const tip = earTips.current[i];
      st.tipV[i] += (-(tip.rotation.x - st.flop * 1.3) * 60 - st.tipV[i] * 7 + accel * 1.2) * dt;
      tip.rotation.x = THREE.MathUtils.clamp(tip.rotation.x + st.tipV[i] * dt, -0.4, 1.6);
      tip.rotation.z = side * (headVel * 0.02 + st.flop * 0.25);
    }

    // Sprout spring + flower bloom / wilt.
    const sAccel = (root.current.position.y - st.sproutA) * 60;
    st.sproutA = root.current.position.y;
    st.sproutV += (-sprout.current.rotation.z * 40 - st.sproutV * 4 - sAccel * 0.5) * dt;
    sprout.current.rotation.z = THREE.MathUtils.clamp(sprout.current.rotation.z + st.sproutV * dt, -0.6, 0.6);
    sprout.current.rotation.x = damp(sprout.current.rotation.x, (1 - st.bloom) * 0.55, 4, dt);
    petals.current.forEach((p, i) => {
      p.rotation.x = -1.35 + st.bloom * 1.15 + Math.sin(t * 2 + i) * 0.04 * st.bloom;
    });

    // Arms.
    const wave = Math.sin(t * 9) * 0.45;
    const poses: Record<Pose["arms"], [number, number, number, number]> = {
      rest: [-0.3, 0.3, 0, 0],
      wave: [-0.35, 2.3 + wave, 0, 0],
      up: [-2.5 - Math.sin(t * 10) * 0.2, 2.5 + Math.sin(t * 10) * 0.2, 0, 0],
      hug: [0.55, -0.55, -1.1, -1.1],
      think: [-0.3, 1.9, 0, -1.2],
      fists: [-1.15 - Math.sin(t * 14) * 0.12, 1.15 + Math.sin(t * 14) * 0.12, -0.3, -0.3],
      down: [-0.1, 0.1, 0.2, 0.2],
    };
    const armPose = idleIs("stretch") ? "up" : live.speaking && target.arms === "rest" ? "wave" : target.arms;
    const [lz, rz, lx, rx] = poses[armPose];
    arms.current[0].rotation.z = damp(arms.current[0].rotation.z, lz, 8, dt);
    arms.current[1].rotation.z = damp(arms.current[1].rotation.z, rz, 8, dt);
    arms.current[0].rotation.x = damp(arms.current[0].rotation.x, lx, 8, dt);
    arms.current[1].rotation.x = damp(arms.current[1].rotation.x, rx, 8, dt);

    // Mood effects.
    hearts.current.visible = mood === "love";
    hearts.current.children.forEach((h, i) => {
      const p = (t * 0.35 + i / hearts.current.children.length) % 1;
      h.position.set(Math.sin(i * 2.3 + t) * 0.9, 0.7 + p * 1.4, 0.3 + Math.cos(i * 1.7) * 0.3);
      h.scale.setScalar(0.12 * Math.sin(p * Math.PI) + 0.01);
      h.rotation.y = t * 2 + i;
    });
    tears.current.visible = mood === "sad";
    tears.current.children.forEach((d, i) => {
      const p = (t * 0.6 + i * 0.5) % 1;
      const side = i % 2 === 0 ? -1 : 1;
      d.position.set(side * (0.36 + p * 0.1), -0.06 - p * 0.7, 0.95 - p * 0.25);
      d.scale.set(0.045, 0.07, 0.045).multiplyScalar(1 - p * 0.35);
    });
    anger.current.visible = mood === "angry";
    anger.current.scale.setScalar(0.18 + Math.abs(Math.sin(t * 6)) * 0.05);
    zs.current.visible = mood === "sleepy";
    zs.current.children.forEach((z, i) => {
      const p = (t * 0.25 + i / 3) % 1;
      z.position.set(0.6 + p * 0.35, 0.95 + p * 0.55, 0.3);
      z.scale.setScalar(0.06 + p * 0.07);
      z.rotation.z = Math.sin(t + i) * 0.3;
    });
    bang.current.visible = mood === "surprised";
    bang.current.position.y = 1.55 + Math.abs(Math.sin(t * 8)) * 0.06;
    dots.current.visible = mood === "thinking";
    dots.current.children.forEach((d, i) => {
      d.position.y = 1.45 + i * 0.12 + Math.sin(t * 4 - i) * 0.04;
      d.scale.setScalar((0.045 + i * 0.025) * (0.85 + 0.15 * Math.sin(t * 5 + i)));
    });
    stars.current.visible = ["excited", "proud", "happy", "playful"].includes(mood);
    stars.current.rotation.y = t * 0.6;
    stars.current.children.forEach((c, i) => c.scale.setScalar(0.05 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7))));
  });

  const dark = "#2b1f33";
  const lash = "#1a0f2e";
  const pad = "#ff9fb6";

  return (
    <group ref={root}>
      {/* Body + fur halo */}
      <mesh geometry={bodyGeo} scale={[1.06, 0.95, 1]} castShadow>
        <meshPhysicalMaterial ref={bodyMat} vertexColors roughness={0.5} sheen={0.4} sheenRoughness={0.5} sheenColor={palette.belly} clearcoat={0.15} clearcoatRoughness={0.5} />
      </mesh>
      <mesh geometry={bodyGeo} scale={[1.06 * 1.014, 0.95 * 1.014, 1.014]} material={fur} />

      {/* Feet with toe beans */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.4, -0.88, 0.28]} scale={[0.25, 0.13, 0.31]} castShadow>
            <sphereGeometry args={[1, 40, 28]} />
            <Plush color={palette.body} />
          </mesh>
          {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[side * 0.4 + k * 0.085, -0.82 - Math.abs(k) * 0.015, 0.54 - Math.abs(k) * 0.03]} scale={[0.04, 0.03, 0.03]}>
              <sphereGeometry args={[1, 16, 12]} />
              <Plush color={pad} sheen={0.2} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Tail puff */}
      <mesh position={[0, -0.45, -0.95]} scale={0.24}>
        <sphereGeometry args={[1, 32, 24]} />
        <Plush color={palette.belly} roughness={0.85} sheen={1} />
      </mesh>

      {/* Arms with paw pads */}
      {[-1, 1].map((side, i) => (
        <group key={side} ref={(el) => void (arms.current[i] = el!)} position={[side * 0.93, -0.2, 0.12]}>
          <mesh position={[side * 0.05, -0.17, 0]} castShadow>
            <capsuleGeometry args={[0.115, 0.2, 10, 20]} />
            <Plush color={palette.body} />
          </mesh>
          <mesh position={[side * 0.05, -0.31, 0.075]} scale={[0.055, 0.045, 0.03]}>
            <sphereGeometry args={[1, 16, 12]} />
            <Plush color={pad} sheen={0.2} />
          </mesh>
        </group>
      ))}

      {/* Scarf lives on the body */}
      {accessory === "scarf" && (
        <group position={[0, -0.36, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.95, 1]}>
            <torusGeometry args={[0.97, 0.1, 20, 80]} />
            <Plush color="#ff7a59" roughness={0.9} sheen={1} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.95, 1]} position={[0, -0.04, 0]}>
            <torusGeometry args={[0.98, 0.03, 10, 80]} />
            <Plush color="#ffd36b" roughness={0.9} />
          </mesh>
          <mesh position={[0.42, -0.24, 0.84]} rotation={[0.25, 0, 0.18]} scale={[1.2, 1, 0.45]}>
            <capsuleGeometry args={[0.09, 0.32, 8, 16]} />
            <Plush color="#ff7a59" roughness={0.9} sheen={1} />
          </mesh>
        </group>
      )}

      <group ref={head}>
        {/* Ears: base segment + floppy tip */}
        {[-1, 1].map((side, i) => (
          <group key={side} ref={(el) => void (ears.current[i] = el!)} position={[side * 0.46, 0.72, -0.05]}>
            <mesh position={[0, 0.17, 0]} scale={[1, 1, 0.6]} castShadow>
              <capsuleGeometry args={[0.16, 0.22, 12, 24]} />
              <Plush color={palette.body} />
            </mesh>
            <mesh position={[0, 0.19, 0.075]} scale={[0.6, 0.86, 0.33]}>
              <capsuleGeometry args={[0.16, 0.22, 12, 24]} />
              <Plush color={palette.ear} sheen={0.6} />
            </mesh>
            <group ref={(el) => void (earTips.current[i] = el!)} position={[0, 0.3, 0]}>
              <mesh position={[0, 0.12, 0]} scale={[1, 1, 0.6]} castShadow>
                <capsuleGeometry args={[0.158, 0.16, 12, 24]} />
                <Plush color={palette.body} />
              </mesh>
              <mesh position={[0, 0.08, 0.074]} scale={[0.6, 0.82, 0.33]}>
                <capsuleGeometry args={[0.158, 0.16, 12, 24]} />
                <Plush color={palette.ear} sheen={0.6} />
              </mesh>
              <mesh position={[0, 0.2, -0.01]} scale={[0.1, 0.07, 0.07]}>
                <sphereGeometry args={[1, 20, 14]} />
                <Plush color={tipColor} />
              </mesh>
            </group>
          </group>
        ))}

        {/* Sprout with a flower that blooms when happy and wilts when sad */}
        <group ref={sprout} position={[0, 0.92, 0.05]}>
          <mesh>
            <tubeGeometry args={[sproutCurve, 24, 0.024, 8, false]} />
            <meshStandardMaterial color="#5dbb63" roughness={0.5} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.1, 0.17, 0]} rotation={[0, 0, side * -0.7]} scale={[0.11, 0.05, 0.028]}>
              <sphereGeometry args={[1, 24, 16]} />
              <meshPhysicalMaterial color="#7ed67f" roughness={0.35} clearcoat={0.6} />
            </mesh>
          ))}
          <group position={[0.02, 0.35, 0]} rotation={[0.55, 0, 0]}>
            <mesh scale={0.042}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshStandardMaterial color="#ffcf3f" roughness={0.6} emissive="#ffb700" emissiveIntensity={0.15} />
            </mesh>
            {Array.from({ length: 6 }, (_, i) => (
              <group key={i} rotation={[0, (i / 6) * Math.PI * 2, 0]}>
                <group ref={(el) => void (petals.current[i] = el!)}>
                  <mesh position={[0, 0, 0.065]} scale={[0.04, 0.012, 0.065]}>
                    <sphereGeometry args={[1, 16, 10]} />
                    <meshPhysicalMaterial color={palette.ear} roughness={0.45} sheen={0.6} sheenColor="#fff" />
                  </mesh>
                </group>
              </group>
            ))}
          </group>
        </group>

        {/* Eyes */}
        {[0, 1].map((i) => {
          const side = i === 0 ? -1 : 1;
          return (
            <group key={i} ref={(el) => void (eyes.current[i] = el!)} position={[side * 0.34, 0.13, 0]}>
              <group position={[0, 0, 0.905]} rotation={[0, side * 0.32, 0]}>
                <group ref={(el) => void (ovals.current[i] = el!)}>
                  <mesh geometry={eyeGeo} scale={[0.15, 0.19, 0.072]}>
                    <meshPhysicalMaterial map={eyeTex} roughness={0.12} clearcoat={1} clearcoatRoughness={0.04} />
                  </mesh>
                  <mesh position={[0.045, 0.07, 0.066]} scale={[0.05, 0.055, 0.02]}>
                    <sphereGeometry args={[1, 16, 12]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                  <mesh position={[-0.05, -0.065, 0.066]} scale={0.02}>
                    <sphereGeometry args={[1, 12, 10]} />
                    <meshBasicMaterial color="#ffffff" />
                  </mesh>
                  {/* Upper lash line + flicks at the outer corner */}
                  <mesh position={[0, 0, 0.03]} rotation={[0, 0, Math.PI * 0.12]} scale={[1, 1.22, 1]}>
                    <torusGeometry args={[0.155, 0.013, 8, 40, Math.PI * 0.76]} />
                    <meshStandardMaterial color={lash} roughness={0.5} />
                  </mesh>
                  <mesh position={[side * 0.15, 0.13, 0.035]} rotation={[0, 0, side * -0.9]}>
                    <capsuleGeometry args={[0.011, 0.05, 4, 8]} />
                    <meshStandardMaterial color={lash} roughness={0.5} />
                  </mesh>
                  <mesh position={[side * 0.11, 0.17, 0.035]} rotation={[0, 0, side * -0.5]}>
                    <capsuleGeometry args={[0.01, 0.04, 4, 8]} />
                    <meshStandardMaterial color={lash} roughness={0.5} />
                  </mesh>
                </group>
                <mesh ref={(el) => void (arcs.current[i] = el!)} position={[0, -0.02, 0.05]}>
                  <torusGeometry args={[0.1, 0.026, 12, 32, Math.PI]} />
                  <meshStandardMaterial color={dark} roughness={0.3} />
                </mesh>
              </group>
            </group>
          );
        })}

        {/* Brows */}
        {[0, 1].map((i) => (
          <mesh key={i} ref={(el) => void (brows.current[i] = el!)} position={[(i === 0 ? -1 : 1) * 0.35, 0.42, 0.86]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.026, 0.12, 6, 12]} />
            <meshStandardMaterial color="#5a3d4f" roughness={0.6} />
          </mesh>
        ))}

        {/* Blush + anime blush lines */}
        {[0, 1].map((i) => {
          const side = i === 0 ? -1 : 1;
          return (
            <group key={i}>
              <mesh ref={(el) => void (blush.current[i] = el!)} position={[side * 0.6, -0.06, 0.86]} rotation={[0, side * 0.6, 0]} scale={[0.34, 0.22, 1]}>
                <planeGeometry />
                <meshBasicMaterial map={blushTex} transparent depthWrite={false} opacity={0.6} />
              </mesh>
              <group ref={(el) => void (blushLines.current[i] = el!)} position={[side * 0.6, -0.06, 0.875]} rotation={[0, side * 0.6, 0]}>
                {[-1, 0, 1].map((k) => (
                  <mesh key={k} position={[k * 0.05, 0, 0]} rotation={[0, 0, -0.5]}>
                    <capsuleGeometry args={[0.009, 0.06, 4, 8]} />
                    <meshBasicMaterial color="#ff4f86" transparent opacity={0} />
                  </mesh>
                ))}
              </group>
            </group>
          );
        })}

        {/* Mouth */}
        <group position={[0, -0.14, 0.99]} rotation={[0.14, 0, 0]}>
          <mesh ref={smileLine}>
            <torusGeometry args={[0.075, 0.018, 10, 32, Math.PI]} />
            <meshStandardMaterial color={dark} roughness={0.4} />
          </mesh>
          <group ref={mouthOpen}>
            <mesh scale={[0.1, 0.09, 0.04]}>
              <sphereGeometry args={[1, 32, 20]} />
              <meshStandardMaterial color="#5b1830" roughness={0.6} />
            </mesh>
            <mesh position={[0, -0.042, 0.012]} scale={[0.066, 0.04, 0.03]}>
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color="#ff7b98" roughness={0.5} />
            </mesh>
            <mesh position={[0.04, 0.06, 0.028]} rotation={[0, 0, Math.PI]} scale={[1, 0.6, 1]}>
              <coneGeometry args={[0.018, 0.04, 10]} />
              <meshStandardMaterial color="#ffffff" roughness={0.3} />
            </mesh>
          </group>
        </group>

        {/* Head accessories */}
        {accessory === "bow" && (
          <group position={[0.36, 0.8, 0.36]} rotation={[0.3, 0.3, -0.35]}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 0.12, 0, 0]} rotation={[0, 0, side * 0.45]} scale={[0.13, 0.085, 0.06]}>
                <sphereGeometry args={[1, 24, 16]} />
                <meshPhysicalMaterial color="#ff5c8a" roughness={0.35} clearcoat={0.6} />
              </mesh>
            ))}
            <mesh scale={0.055}>
              <sphereGeometry args={[1, 16, 12]} />
              <meshPhysicalMaterial color="#ff3f78" roughness={0.35} clearcoat={0.6} />
            </mesh>
          </group>
        )}
        {accessory === "glasses" && (
          <group>
            {[-1, 1].map((side) => (
              <group key={side}>
                <mesh position={[side * 0.34, 0.14, 0.985]} rotation={[0, side * 0.3, 0]}>
                  <torusGeometry args={[0.2, 0.02, 12, 48]} />
                  <meshStandardMaterial color="#3a2b4a" roughness={0.3} metalness={0.3} />
                </mesh>
                <mesh position={[side * 0.34, 0.14, 0.985]} rotation={[0, side * 0.3, 0]}>
                  <circleGeometry args={[0.19, 32]} />
                  <meshPhysicalMaterial color="#ffffff" transparent opacity={0.12} roughness={0} clearcoat={1} />
                </mesh>

              </group>
            ))}
            <mesh position={[0, 0.17, 1.02]} rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.014, 0.1, 4, 8]} />
              <meshStandardMaterial color="#3a2b4a" />
            </mesh>
          </group>
        )}
        {accessory === "headphones" && (
          <group position={[0, 0.05, -0.18]}>
            <mesh>
              <torusGeometry args={[1.07, 0.055, 14, 64, Math.PI]} />
              <meshPhysicalMaterial color="#6c5ce7" roughness={0.3} clearcoat={0.8} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * 1.0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.2, 0.2, 0.16, 32]} />
                <meshPhysicalMaterial color="#ffd166" roughness={0.4} clearcoat={0.5} />
              </mesh>
            ))}
          </group>
        )}
        {accessory === "beanie" && (
          <group>
            <mesh scale={[1.06 * 1.035, 0.95 * 1.035, 1.035]}>
              <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, 0, 0.95]} />
              <Plush color="#4ecdc4" roughness={0.95} sheen={1} />
            </mesh>
            <mesh position={[0, 0.95 * 1.035 * Math.cos(0.95), 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.06, 1, 1]}>
              <torusGeometry args={[1.035 * Math.sin(0.95), 0.075, 14, 72]} />
              <Plush color="#3bb5ad" roughness={0.95} sheen={1} />
            </mesh>
            <mesh position={[0, 1.0, -0.25]} scale={0.15}>
              <sphereGeometry args={[1, 24, 16]} />
              <Plush color="#ffffff" roughness={1} sheen={1} />
            </mesh>
          </group>
        )}
        {accessory === "crown" &&
          Array.from({ length: 7 }, (_, i) => {
            const a = Math.PI * (0.18 + (i / 6) * 0.64);
            return (
              <group key={i} position={[Math.cos(a) * 0.8, 0.66 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.62]} rotation={[0.7, -Math.cos(a) * 0.8, 0]} scale={1.5}>
                <mesh scale={0.04}>
                  <sphereGeometry args={[1, 12, 10]} />
                  <meshStandardMaterial color="#ffcf3f" />
                </mesh>
                {Array.from({ length: 5 }, (_, k) => (
                  <mesh key={k} position={[Math.cos((k / 5) * Math.PI * 2) * 0.055, Math.sin((k / 5) * Math.PI * 2) * 0.055, -0.005]} scale={[0.04, 0.04, 0.015]}>
                    <sphereGeometry args={[1, 12, 8]} />
                    <meshPhysicalMaterial color={i % 2 ? "#ffffff" : "#ffb3d1"} roughness={0.5} sheen={0.5} />
                  </mesh>
                ))}
              </group>
            );
          })}
      </group>

      {/* Mood effects */}
      <group ref={hearts}>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} geometry={heartGeo}>
            <meshPhysicalMaterial color="#ff5c8a" roughness={0.25} clearcoat={1} emissive="#ff2f6d" emissiveIntensity={0.25} />
          </mesh>
        ))}
      </group>
      <group ref={tears}>
        {Array.from({ length: 4 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshPhysicalMaterial color="#7cc8ff" roughness={0.05} clearcoat={1} emissive="#5ab4ff" emissiveIntensity={0.25} transparent opacity={0.92} />
          </mesh>
        ))}
      </group>
      <group ref={anger} position={[0.78, 0.62, 0.62]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * Math.PI) / 2 + Math.PI / 4]} position={[Math.cos((i * Math.PI) / 2) * 0.55, Math.sin((i * Math.PI) / 2) * 0.55, 0]}>
            <torusGeometry args={[0.45, 0.13, 8, 20, Math.PI / 2]} />
            <meshStandardMaterial color="#ff3b3b" emissive="#ff1a1a" emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
      <group ref={zs}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={zGeo}>
            <meshStandardMaterial color="#8b7cf6" />
          </mesh>
        ))}
      </group>
      <group ref={bang} position={[0.55, 1.55, 0.2]}>
        <mesh position={[0, 0.1, 0]}>
          <capsuleGeometry args={[0.05, 0.18, 6, 12]} />
          <meshStandardMaterial color="#ffb020" emissive="#ff9900" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, -0.12, 0]} scale={0.055}>
          <sphereGeometry args={[1, 16, 12]} />
          <meshStandardMaterial color="#ffb020" emissive="#ff9900" emissiveIntensity={0.3} />
        </mesh>
      </group>
      <group ref={dots} position={[0.6, 0, 0.3]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[i * 0.13, 1.45 + i * 0.12, 0]}>
            <sphereGeometry args={[1, 16, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} />
          </mesh>
        ))}
      </group>
      <group ref={stars} position={[0, 0.3, 0]}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * 1.45, Math.sin(i * 1.3) * 0.6 + 0.2, Math.sin(a) * 1.0]} rotation={[0, 0, Math.PI / 4]}>
              <octahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color="#ffd54a" emissive="#ffc400" emissiveIntensity={0.8} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** A plush cushion for the companion to stand on. */
export function Cushion({ color }: { color: BodyColor }) {
  const tone = useMemo(() => new THREE.Color(BODY_COLORS[color].belly).lerp(new THREE.Color("#e9e0ff"), 0.55).getStyle(), [color]);
  return (
    <group position={[0, -1.19, 0]}>
      <mesh receiveShadow>
        <cylinderGeometry args={[1.32, 1.38, 0.16, 72]} />
        <meshPhysicalMaterial color={tone} roughness={0.8} sheen={1} sheenColor="#ffffff" />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.34, 0.08, 18, 96]} />
        <meshPhysicalMaterial color={tone} roughness={0.8} sheen={1} sheenColor="#ffffff" />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 1.34, 0.1, Math.sin(a) * 1.34]} scale={0.022}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}
