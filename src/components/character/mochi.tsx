"use client";

import { useEffect, useId, useRef } from "react";
import { live, poke, setMood, useCompanion } from "@/lib/companion-state";
import { BODY_COLORS, EYE_COLORS, type Accessory, type BodyColor, type EyeColor, type Mood } from "@/lib/types";

/**
 * Mochi, drawn in SVG and animated with CSS + one small requestAnimationFrame
 * loop (blinks, eye tracking, lip-sync). No WebGL, so it's light on any device.
 *
 * Every mood sets a pose: eyes, brows, mouth, blush, ears, arms, the sprout
 * flower, a body motion and a little effect (hearts, tears, Zzz…).
 */

type Eyes = "open" | "smile" | "wink" | "heart" | "star" | "sad" | "wide" | "angry" | "worried" | "sleepy" | "side";
type Mouth = "smile" | "grin" | "cat" | "o" | "frown" | "wavy" | "pout" | "flat" | "smirk" | "tiny";
type Arms = "rest" | "wave" | "up" | "down" | "hug" | "chin" | "fists";
type Motion = "breathe" | "bounce" | "sway" | "sink" | "shake" | "nod" | "float";
type Effect = "none" | "hearts" | "tears" | "anger" | "sparkles" | "zzz" | "dots" | "shock" | "sweat" | "notes" | "glow";

type Pose = { eyes: Eyes; mouth: Mouth; brows: [number, number, number]; blush: number; ears: number; arms: Arms; bloom: number; motion: Motion; effect: Effect; tilt: number };

// brows: [left angle, right angle, lift in px]  ears: spread angle (+ perked out, - droopy)
const POSES: Record<Mood, Pose> = {
  neutral: { eyes: "open", mouth: "flat", brows: [0, 0, 0], blush: 0.35, ears: 0, arms: "rest", bloom: 0.5, motion: "breathe", effect: "none", tilt: 0 },
  happy: { eyes: "open", mouth: "smile", brows: [-6, 6, -2], blush: 0.6, ears: 6, arms: "wave", bloom: 0.9, motion: "sway", effect: "none", tilt: 0 },
  excited: { eyes: "star", mouth: "grin", brows: [-10, 10, -5], blush: 0.85, ears: 14, arms: "up", bloom: 1, motion: "bounce", effect: "sparkles", tilt: 0 },
  love: { eyes: "heart", mouth: "smile", brows: [-8, 8, -3], blush: 1, ears: 4, arms: "hug", bloom: 1, motion: "sway", effect: "hearts", tilt: -4 },
  proud: { eyes: "smile", mouth: "grin", brows: [-8, 8, -4], blush: 0.7, ears: 10, arms: "fists", bloom: 1, motion: "nod", effect: "glow", tilt: 0 },
  sad: { eyes: "sad", mouth: "frown", brows: [14, -14, 2], blush: 0.3, ears: -22, arms: "down", bloom: 0.1, motion: "sink", effect: "tears", tilt: 3 },
  worried: { eyes: "worried", mouth: "wavy", brows: [16, -16, -2], blush: 0.3, ears: -10, arms: "hug", bloom: 0.3, motion: "breathe", effect: "sweat", tilt: 0 },
  angry: { eyes: "angry", mouth: "pout", brows: [-20, 20, 4], blush: 0.9, ears: 18, arms: "fists", bloom: 0.4, motion: "shake", effect: "anger", tilt: 0 },
  surprised: { eyes: "wide", mouth: "o", brows: [-4, 4, -8], blush: 0.5, ears: 20, arms: "up", bloom: 0.8, motion: "breathe", effect: "shock", tilt: 0 },
  thinking: { eyes: "side", mouth: "smirk", brows: [-10, 4, -3], blush: 0.3, ears: 2, arms: "chin", bloom: 0.5, motion: "float", effect: "dots", tilt: 5 },
  sleepy: { eyes: "sleepy", mouth: "tiny", brows: [6, -6, 2], blush: 0.4, ears: -14, arms: "rest", bloom: 0.2, motion: "sink", effect: "zzz", tilt: -5 },
  playful: { eyes: "wink", mouth: "cat", brows: [-8, 4, -3], blush: 0.8, ears: 10, arms: "wave", bloom: 0.9, motion: "bounce", effect: "notes", tilt: -6 },
};

const darken = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

export function Mochi({
  color = "peach",
  eyeColor = "violet",
  accessory = "none",
  interactive = true,
  watchCursor = true,
  className = "",
}: {
  color?: BodyColor;
  eyeColor?: EyeColor;
  accessory?: Accessory;
  interactive?: boolean;
  watchCursor?: boolean;
  className?: string;
}) {
  const { mood, speaking, listening, thinking } = useCompanion();
  const shown: Mood = thinking && !speaking ? "thinking" : mood;
  const p = POSES[shown];
  const id = useId().replace(/:/g, "");
  const pal = BODY_COLORS[color];
  const iris = EYE_COLORS[eyeColor];

  const svg = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const talk = useRef<SVGEllipseElement>(null);
  const talkGroup = useRef<SVGGElement>(null);
  const rest = useRef<SVGGElement>(null);
  const hopper = useRef<SVGGElement>(null);

  // One loop: blink, look at the cursor, move the mouth with the voice.
  useEffect(() => {
    let raf = 0;
    let nextBlink = performance.now() + 1500 + Math.random() * 2500;
    let blinkUntil = 0;
    let mx = 0;
    let my = 0;
    let lx = 0;
    let ly = 0;
    let level = 0;
    const onMove = (e: PointerEvent) => {
      const r = svg.current?.getBoundingClientRect();
      if (!r) return;
      const dx = (e.clientX - (r.left + r.width / 2)) / Math.max(200, window.innerWidth / 2);
      const dy = (e.clientY - (r.top + r.height * 0.55)) / Math.max(200, window.innerHeight / 2);
      mx = Math.max(-1, Math.min(1, dx));
      my = Math.max(-1, Math.min(1, dy));
    };
    if (watchCursor) window.addEventListener("pointermove", onMove, { passive: true });
    const loop = (now: number) => {
      // Blink (sometimes a double blink).
      if (now > nextBlink) {
        blinkUntil = now + 130;
        nextBlink = now + (Math.random() < 0.15 ? 260 : 2200 + Math.random() * 3800);
      }
      const closed = now < blinkUntil;
      if (eyesRef.current) eyesRef.current.style.transform = `scaleY(${closed ? 0.08 : 1})`;
      // Ease the pupils toward the cursor; drift gently when it's still.
      const idle = Math.sin(now / 1900) * 0.25;
      lx += ((watchCursor ? mx : idle) - lx) * 0.12;
      ly += ((watchCursor ? my : 0) - ly) * 0.12;
      svg.current?.querySelectorAll<SVGGElement>(".mochi-pupils").forEach((g) => (g.style.transform = `translate(${lx * 4}px, ${ly * 3.2}px)`));
      // Mouth: real loudness for the natural voice; word pulses for the browser voice.
      let target = 0;
      if (live.speaking) {
        target = live.audioLevel >= 0 ? live.audioLevel : Math.max(0.15, 1 - (now / 1000 - live.lastBoundary) / 0.22) * (0.55 + 0.45 * Math.abs(Math.sin(now / 70)));
      }
      level += (target - level) * 0.45;
      const open = live.speaking ? Math.max(0.12, level) : 0;
      if (talk.current) talk.current.setAttribute("ry", String(1.5 + open * 9));
      if (talkGroup.current) talkGroup.current.style.opacity = live.speaking ? "1" : "0";
      if (rest.current) rest.current.style.opacity = live.speaking ? "0" : "1";
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [watchCursor]);

  // Little idle hops now and then.
  useEffect(() => {
    const t = setInterval(() => {
      if (live.speaking || Math.random() > 0.35) return;
      const g = hopper.current;
      if (!g) return;
      g.classList.remove("mochi-hop");
      void g.getBoundingClientRect();
      g.classList.add("mochi-hop");
    }, 7000);
    return () => clearInterval(t);
  }, []);

  function onTap() {
    if (!interactive) return;
    poke();
    setMood(["playful", "happy", "love", "surprised"][Math.floor(Math.random() * 4)] as Mood);
    const g = hopper.current;
    if (g) {
      g.classList.remove("mochi-squish");
      void g.getBoundingClientRect();
      g.classList.add("mochi-squish");
    }
  }

  const body = pal.body;
  const shade = darken(body, 0.86);
  const deep = darken(body, 0.7);
  const ink = "#3a2a4f";
  const earAngle = p.ears;

  return (
    <svg
      ref={svg}
      viewBox="0 0 240 250"
      className={`mochi-svg h-full w-full select-none ${className}`}
      onPointerDown={onTap}
      role="img"
      aria-label={`Your companion, feeling ${shown}`}
      style={{ cursor: interactive ? "pointer" : "default", overflow: "visible" }}
    >
      <defs>
        <radialGradient id={`body-${id}`} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="18%" stopColor={body} />
          <stop offset="100%" stopColor={shade} />
        </radialGradient>
        <radialGradient id={`iris-${id}`} cx="50%" cy="65%" r="70%">
          <stop offset="0%" stopColor={iris} />
          <stop offset="55%" stopColor={darken(iris, 0.6)} />
          <stop offset="100%" stopColor="#1a0f2e" />
        </radialGradient>
        <radialGradient id={`blush-${id}`}>
          <stop offset="0%" stopColor="#ff7fa8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ff7fa8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`ear-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={body} />
          <stop offset="100%" stopColor={shade} />
        </linearGradient>
      </defs>

      {/* shadow */}
      <ellipse className={`mochi-shadow mochi-m-${p.motion}`} cx="120" cy="232" rx="62" ry="9" fill="#5b3fd0" opacity="0.14" />

      <g ref={hopper} className="mochi-hopper" onAnimationEnd={(e) => e.currentTarget.classList.remove("mochi-hop", "mochi-squish")}>
        <g className={`mochi-motion mochi-m-${p.motion}`}>
          <g style={{ transform: `rotate(${p.tilt}deg)`, transformOrigin: "120px 200px", transition: "transform .5s cubic-bezier(.3,1.4,.5,1)" }}>
            {/* ears */}
            {(["l", "r"] as const).map((side) => {
              const s = side === "l" ? -1 : 1;
              const x = 120 + s * 30;
              return (
                <g
                  key={side}
                  className={listening ? "mochi-ear-perk" : "mochi-ear"}
                  style={{ transform: `rotate(${s * (12 + earAngle)}deg)`, transformOrigin: `${x}px 84px`, transition: "transform .45s cubic-bezier(.3,1.5,.5,1)" }}
                >
                  <ellipse cx={x} cy="48" rx="15" ry="36" fill={`url(#ear-${id})`} />
                  <ellipse cx={x} cy="50" rx="8" ry="26" fill={pal.ear} opacity="0.85" />
                  {side === "r" && <ellipse cx={x + 3} cy="17" rx="10" ry="7" fill={shade} transform={`rotate(25 ${x + 3} 17)`} opacity="0.55" />}
                </g>
              );
            })}

            {/* sprout + flower */}
            {accessory !== "beanie" && (
              <g style={{ transform: `rotate(${p.bloom < 0.3 ? 35 : 0}deg)`, transformOrigin: "120px 72px", transition: "transform .6s ease" }}>
                <path d="M120 74 Q118 58 121 44" stroke="#5fb37c" strokeWidth="3.2" fill="none" strokeLinecap="round" />
                <ellipse cx="110" cy="52" rx="9" ry="4.5" fill="#7fd39a" transform="rotate(-30 110 52)" />
                <ellipse cx="131" cy="50" rx="9" ry="4.5" fill="#6cc78a" transform="rotate(28 131 50)" />
                <g style={{ transform: `scale(${0.35 + p.bloom * 0.65})`, transformOrigin: "121px 40px", transition: "transform .6s cubic-bezier(.3,1.6,.5,1)" }}>
                  {[0, 72, 144, 216, 288].map((a) => (
                    <ellipse key={a} cx="121" cy="33" rx="4.2" ry="6.2" fill="#ffb3cf" transform={`rotate(${a} 121 40)`} />
                  ))}
                  <circle cx="121" cy="40" r="3.6" fill="#ffd966" />
                </g>
              </g>
            )}

            {/* feet */}
            {[96, 144].map((x) => (
              <g key={x}>
                <ellipse cx={x} cy="221" rx="19" ry="10" fill={shade} />
                <ellipse cx={x} cy="223" rx="9" ry="5" fill={pal.ear} opacity="0.7" />
                {[-7, 0, 7].map((d) => (
                  <circle key={d} cx={x + d} cy="215.5" r="2" fill={pal.ear} opacity="0.7" />
                ))}
              </g>
            ))}

            {/* body */}
            <path d="M40 150 C40 98 76 72 120 72 C164 72 200 98 200 150 C200 196 166 222 120 222 C74 222 40 196 40 150 Z" fill={`url(#body-${id})`} />
            <path d="M40 150 C40 98 76 72 120 72 C164 72 200 98 200 150 C200 196 166 222 120 222 C74 222 40 196 40 150 Z" fill="none" stroke={deep} strokeOpacity="0.18" strokeWidth="2" />
            <ellipse cx="120" cy="196" rx="46" ry="22" fill={pal.belly} opacity="0.85" />
            <ellipse cx="88" cy="96" rx="20" ry="9" fill="#fff" opacity="0.55" transform="rotate(-25 88 96)" />
            <circle cx="70" cy="114" r="3" fill="#fff" opacity="0.6" />

            {/* arms: little stubby hands at the body's edge */}
            <Arm side="l" pose={p.arms} fill={body} shade={shade} />
            <Arm side="r" pose={p.arms} fill={body} shade={shade} />

            {/* blush */}
            <g style={{ opacity: p.blush, transition: "opacity .5s" }}>
              <ellipse cx="76" cy="166" rx="15" ry="9" fill={`url(#blush-${id})`} />
              <ellipse cx="164" cy="166" rx="15" ry="9" fill={`url(#blush-${id})`} />
              {p.blush > 0.75 &&
                [70, 76, 82, 158, 164, 170].map((x) => <line key={x} x1={x} y1="163" x2={x - 3} y2="169" stroke="#ff6f9c" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />)}
            </g>

            {/* brows */}
            {(["l", "r"] as const).map((side, i) => {
              const x = side === "l" ? 95 : 145;
              return (
                <path
                  key={side}
                  d={`M${x - 9} 0 Q${x} -4 ${x + 9} 0`}
                  stroke={ink}
                  strokeWidth="3"
                  strokeLinecap="round"
                  fill="none"
                  style={{ transform: `translateY(${116 + p.brows[2]}px) rotate(${p.brows[i]}deg)`, transformOrigin: `${x}px 0px`, transition: "transform .4s cubic-bezier(.3,1.5,.5,1)" }}
                />
              );
            })}

            {/* eyes */}
            <g ref={eyesRef} style={{ transformOrigin: "120px 140px", transformBox: "view-box" }}>
              <EyePair kind={p.eyes} irisFill={`url(#iris-${id})`} ink={ink} lid={body} />
            </g>

            {/* mouth */}
            <g transform="translate(120 170)">
              <g ref={rest} style={{ transition: "opacity .08s" }}>
                <RestMouth kind={p.mouth} ink={ink} />
              </g>
              <g ref={talkGroup} style={{ opacity: 0, transition: "opacity .08s" }}>
                <ellipse ref={talk} cx="0" cy="2" rx="8" ry="2" fill="#7a2f4a" stroke={ink} strokeWidth="2" />
                <ellipse cx="0" cy="6" rx="4.5" ry="2" fill="#ff8fab" />
              </g>
            </g>

            <AccessoryLayer kind={accessory} />
          </g>
        </g>
        <EffectLayer effect={p.effect} listening={listening} />
      </g>
    </svg>
  );
}

function Arm({ side, pose, fill, shade }: { side: "l" | "r"; pose: Arms; fill: string; shade: string }) {
  const s = side === "l" ? -1 : 1;
  const px = 120 + s * 72; // shoulder, on the body's edge
  const py = 160;
  // Degrees: positive swings the arm out and up, negative tucks it in front of the body.
  const angles: Record<Arms, [number, number]> = {
    rest: [10, 10],
    wave: [10, 120],
    up: [115, 115],
    down: [-5, -5],
    hug: [-60, -60],
    chin: [10, -105],
    fists: [-30, -30],
  };
  const a = angles[pose][side === "l" ? 0 : 1];
  const waving = pose === "wave" && side === "r";
  return (
    <g style={{ transform: `rotate(${-s * a}deg)`, transformOrigin: `${px}px ${py}px`, transition: "transform .45s cubic-bezier(.3,1.5,.5,1)" }}>
      <g className={waving ? "mochi-wave" : ""} style={{ transformOrigin: `${px}px ${py}px` }}>
        <ellipse cx={px + s * 8} cy={py + 15} rx="11.5" ry="17" fill={fill} stroke={shade} strokeWidth="1.8" transform={`rotate(${-s * 25} ${px + s * 8} ${py + 15})`} />
        <ellipse cx={px + s * 10} cy={py + 24} rx="5" ry="3.4" fill="#fff" opacity="0.45" />
      </g>
    </g>
  );
}

function EyePair({ kind, irisFill, ink, lid }: { kind: Eyes; irisFill: string; ink: string; lid: string }) {
  const at = [95, 145];
  const arc = (x: number, up = true) => <path key={x} d={up ? `M${x - 12} 142 Q${x} 128 ${x + 12} 142` : `M${x - 12} 136 Q${x} 148 ${x + 12} 136`} stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />;
  const openEye = (x: number, opts: { ry?: number; pupil?: number; lid?: "sad" | "angry" | "sleepy" | "worried" } = {}) => {
    const ry = opts.ry ?? 17;
    const pr = opts.pupil ?? 1;
    return (
      <g key={x}>
        <ellipse cx={x} cy="140" rx="14" ry={ry} fill="#fff" />
        <g className="mochi-pupils">
          <ellipse cx={x} cy="142" rx={12 * pr} ry={(ry - 2) * pr} fill={irisFill} />
          <circle cx={x - 4.5} cy="134" r={4.6 * Math.max(0.7, pr)} fill="#fff" />
          <circle cx={x + 4} cy="147" r="2.2" fill="#fff" opacity="0.9" />
        </g>
        {/* lashes */}
        <path d={x < 120 ? `M${x - 13} 131 l-5 -4 M${x - 10} 127 l-3 -5` : `M${x + 13} 131 l5 -4 M${x + 10} 127 l3 -5`} stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
        {opts.lid === "sad" && <path d={x < 120 ? `M${x - 16} 126 L${x + 16} 134 L${x + 16} 120 L${x - 16} 120 Z` : `M${x - 16} 134 L${x + 16} 126 L${x + 16} 120 L${x - 16} 120 Z`} fill={lid} />}
        {opts.lid === "angry" && <path d={x < 120 ? `M${x - 16} 122 L${x + 16} 134 L${x + 16} 118 L${x - 16} 118 Z` : `M${x - 16} 134 L${x + 16} 122 L${x + 16} 118 L${x - 16} 118 Z`} fill={lid} />}
        {opts.lid === "sleepy" && <rect x={x - 16} y="118" width="32" height="20" fill={lid} />}
        {opts.lid === "worried" && <path d={x < 120 ? `M${x - 16} 132 L${x + 16} 124 L${x + 16} 118 L${x - 16} 118 Z` : `M${x - 16} 124 L${x + 16} 132 L${x + 16} 118 L${x - 16} 118 Z`} fill={lid} />}
      </g>
    );
  };
  const heart = (x: number) => <path key={x} className="mochi-pulse" style={{ transformOrigin: `${x}px 140px` }} d={`M${x} 152 C${x - 20} 138 ${x - 12} 124 ${x} 134 C${x + 12} 124 ${x + 20} 138 ${x} 152 Z`} fill="#ff4f86" stroke={ink} strokeWidth="1.5" />;
  const star = (x: number) => (
    <g key={x}>
      <ellipse cx={x} cy="140" rx="14" ry="17" fill={irisFill} />
      <path className="mochi-twinkle" style={{ transformOrigin: `${x}px 138px`, scale: "1.35" }} d={`M${x} 128 L${x + 3} 135 L${x + 10} 136 L${x + 4.5} 141 L${x + 6} 148 L${x} 144 L${x - 6} 148 L${x - 4.5} 141 L${x - 10} 136 L${x - 3} 135 Z`} fill="#fff" />
    </g>
  );

  switch (kind) {
    case "smile":
      return <>{at.map((x) => arc(x))}</>;
    case "wink":
      return (
        <>
          {openEye(95)}
          {arc(145)}
        </>
      );
    case "heart":
      return <>{at.map(heart)}</>;
    case "star":
      return <>{at.map(star)}</>;
    case "sad":
      return <>{at.map((x) => openEye(x, { lid: "sad" }))}</>;
    case "worried":
      return <>{at.map((x) => openEye(x, { pupil: 0.8, lid: "worried" }))}</>;
    case "angry":
      return <>{at.map((x) => openEye(x, { ry: 15, pupil: 0.85, lid: "angry" }))}</>;
    case "wide":
      return <>{at.map((x) => openEye(x, { ry: 19, pupil: 0.6 }))}</>;
    case "sleepy":
      return <>{at.map((x) => arc(x, false))}</>;
    case "side":
      return (
        <g transform="translate(5 -4)">
          {at.map((x) => openEye(x, { pupil: 0.9 }))}
        </g>
      );
    default:
      return <>{at.map((x) => openEye(x))}</>;
  }
}

function RestMouth({ kind, ink }: { kind: Mouth; ink: string }) {
  const s = { stroke: ink, strokeWidth: 3, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "smile":
      return <path d="M-10 -2 Q0 9 10 -2" {...s} />;
    case "grin":
      return (
        <g>
          <path d="M-13 -4 Q0 16 13 -4 Z" fill="#7a2f4a" stroke={ink} strokeWidth="2.5" strokeLinejoin="round" />
          <ellipse cx="0" cy="6" rx="5" ry="2.6" fill="#ff8fab" />
        </g>
      );
    case "cat":
      return <path d="M-10 -2 Q-5 5 0 -1 Q5 5 10 -2" {...s} />;
    case "o":
      return <ellipse cx="0" cy="2" rx="5.5" ry="7" fill="#7a2f4a" stroke={ink} strokeWidth="2.5" />;
    case "frown":
      return <path d="M-9 5 Q0 -4 9 5" {...s} />;
    case "wavy":
      return <path d="M-11 2 Q-7 -2 -3 2 Q1 6 5 2 Q9 -2 12 2" {...s} />;
    case "pout":
      return <path d="M-7 3 Q0 -3 7 3 M-3 4 Q0 2 3 4" {...s} />;
    case "smirk":
      return <path d="M-6 2 Q3 4 10 -3" {...s} />;
    case "tiny":
      return <ellipse cx="0" cy="2" rx="3" ry="3.4" fill="#7a2f4a" stroke={ink} strokeWidth="2" />;
    default:
      return <path d="M-6 1 Q0 4 6 1" {...s} />;
  }
}

function EffectLayer({ effect, listening }: { effect: Effect; listening: boolean }) {
  return (
    <g pointerEvents="none">
      {listening && (
        <g className="mochi-sound" stroke="#7a5cf0" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M206 70 Q214 80 206 90" />
          <path d="M214 62 Q228 80 214 98" opacity="0.6" />
        </g>
      )}
      {effect === "hearts" &&
        [
          [40, 80, 0],
          [196, 70, 0.7],
          [60, 50, 1.4],
        ].map(([x, y, d]) => <path key={x} className="mochi-float" style={{ animationDelay: `${d}s` }} d={`M${x} ${y + 10} C${x - 12} ${y + 2} ${x - 7} ${y - 7} ${x} ${y - 1} C${x + 7} ${y - 7} ${x + 12} ${y + 2} ${x} ${y + 10} Z`} fill="#ff5c93" />)}
      {effect === "tears" &&
        [
          [86, 0],
          [154, 0.9],
        ].map(([x, d]) => <path key={x} className="mochi-tear" style={{ animationDelay: `${d}s` }} d={`M${x} 152 Q${x - 5} 162 ${x} 166 Q${x + 5} 162 ${x} 152 Z`} fill="#7cc7ff" />)}
      {effect === "anger" && (
        <g className="mochi-pulse" style={{ transformOrigin: "186px 92px" }} stroke="#ff3b5c" strokeWidth="4" strokeLinecap="round" fill="none">
          <path d="M176 84 Q182 90 176 96 M196 84 Q190 90 196 96 M180 80 Q186 86 192 80 M180 100 Q186 94 192 100" />
        </g>
      )}
      {effect === "sparkles" &&
        [
          [34, 90, 0],
          [204, 84, 0.4],
          [52, 40, 0.8],
          [190, 36, 1.2],
        ].map(([x, y, d]) => <path key={`${x}${y}`} className="mochi-twinkle" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }} d={`M${x} ${y - 9} L${x + 2.5} ${y - 2.5} L${x + 9} ${y} L${x + 2.5} ${y + 2.5} L${x} ${y + 9} L${x - 2.5} ${y + 2.5} L${x - 9} ${y} L${x - 2.5} ${y - 2.5} Z`} fill="#ffd34d" />)}
      {effect === "glow" &&
        [
          [40, 70, 0],
          [200, 64, 0.6],
        ].map(([x, y, d]) => <path key={x} className="mochi-twinkle" style={{ animationDelay: `${d}s`, transformOrigin: `${x}px ${y}px` }} d={`M${x} ${y - 8} L${x + 2} ${y - 2} L${x + 8} ${y} L${x + 2} ${y + 2} L${x} ${y + 8} L${x - 2} ${y + 2} L${x - 8} ${y} L${x - 2} ${y - 2} Z`} fill="#ffcf3d" />)}
      {effect === "zzz" &&
        ["Z", "z", "z"].map((z, i) => (
          <text key={i} className="mochi-zzz" style={{ animationDelay: `${i * 0.8}s` }} x={176 + i * 12} y={78 - i * 14} fontSize={20 - i * 4} fontWeight="900" fill="#8b7bd8">
            {z}
          </text>
        ))}
      {effect === "dots" && (
        <g>
          <circle cx="190" cy="92" r="4" fill="#cfc4ff" />
          <circle cx="202" cy="76" r="6" fill="#cfc4ff" />
          <ellipse cx="216" cy="52" rx="20" ry="14" fill="#fff" stroke="#cfc4ff" strokeWidth="2" />
          {[206, 216, 226].map((x, i) => (
            <circle key={x} className="mochi-dot" style={{ animationDelay: `${i * 0.2}s` }} cx={x} cy="52" r="2.8" fill="#7a5cf0" />
          ))}
        </g>
      )}
      {effect === "shock" && (
        <g className="mochi-pulse" style={{ transformOrigin: "196px 70px" }}>
          <text x="186" y="80" fontSize="30" fontWeight="900" fill="#ff8a3d">
            !
          </text>
          <path d="M40 64 l-10 -8 M46 56 l-4 -12 M34 74 l-12 -2" stroke="#ff8a3d" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {effect === "sweat" && <path className="mochi-tear" d="M178 104 Q170 118 178 124 Q186 118 178 104 Z" fill="#9fd8ff" stroke="#6bb8f0" strokeWidth="1" />}
      {effect === "notes" &&
        [
          [196, 80, 0],
          [36, 70, 0.9],
        ].map(([x, y, d]) => (
          <g key={x} className="mochi-float" style={{ animationDelay: `${d}s` }} fill="#7a5cf0">
            <ellipse cx={x} cy={y} rx="5" ry="4" />
            <path d={`M${x + 4} ${y} V${y - 16} l8 3`} stroke="#7a5cf0" strokeWidth="2.4" fill="none" />
          </g>
        ))}
    </g>
  );
}

function AccessoryLayer({ kind }: { kind: Accessory }) {
  const ink = "#3a2a4f";
  switch (kind) {
    case "bow":
      return (
        <g transform="translate(150 82) rotate(15)">
          <path d="M0 0 L-18 -10 Q-22 0 -18 10 Z" fill="#ff6fa3" stroke="#e0507f" strokeWidth="1.5" />
          <path d="M0 0 L18 -10 Q22 0 18 10 Z" fill="#ff6fa3" stroke="#e0507f" strokeWidth="1.5" />
          <circle r="5" fill="#ff8fb8" stroke="#e0507f" strokeWidth="1.5" />
        </g>
      );
    case "scarf":
      return (
        <g>
          <path d="M54 186 Q120 214 186 186 L184 198 Q120 226 56 198 Z" fill="#ff7b7b" />
          <path d="M70 196 Q120 216 170 196" stroke="#fff" strokeWidth="3" strokeDasharray="6 6" fill="none" opacity="0.7" />
          <path d="M150 204 l10 26 l14 -4 l-8 -26 Z" fill="#ff6464" />
        </g>
      );
    case "glasses":
      return (
        <g stroke={ink} strokeWidth="3" fill="#ffffff22">
          <circle cx="95" cy="140" r="20" />
          <circle cx="145" cy="140" r="20" />
          <path d="M115 138 Q120 134 125 138" fill="none" />
          <path d="M80 128 l-8 -4 M160 128 l8 -4" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M48 128 Q48 52 120 52 Q192 52 192 128" stroke="#5b4b8a" strokeWidth="8" fill="none" strokeLinecap="round" />
          <rect x="34" y="118" width="22" height="36" rx="10" fill="#7a5cf0" />
          <rect x="184" y="118" width="22" height="36" rx="10" fill="#7a5cf0" />
          <rect x="40" y="124" width="10" height="24" rx="5" fill="#b9a6ff" />
          <rect x="190" y="124" width="10" height="24" rx="5" fill="#b9a6ff" />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M66 100 Q70 50 120 48 Q170 50 174 100 Z" fill="#7aa8ff" />
          <path d="M84 60 V98 M102 52 V98 M120 50 V98 M138 52 V98 M156 60 V98" stroke="#5d8ef0" strokeWidth="3" />
          <rect x="60" y="92" width="120" height="16" rx="8" fill="#5d8ef0" />
          <circle cx="120" cy="44" r="10" fill="#fff" />
        </g>
      );
    case "crown":
      return (
        <g>
          {[
            [82, 90, "#ffb3cf"],
            [100, 80, "#fff2a8"],
            [120, 77, "#b9e5ff"],
            [140, 80, "#ffb3cf"],
            [158, 90, "#d6c4ff"],
          ].map(([x, y, c]) => (
            <g key={x as number}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx={x as number} cy={(y as number) - 5} rx="3.6" ry="5" fill={c as string} transform={`rotate(${a} ${x} ${y})`} />
              ))}
              <circle cx={x as number} cy={y as number} r="3" fill="#ffcf3d" />
            </g>
          ))}
          <path d="M76 94 Q120 70 164 94" stroke="#7fd39a" strokeWidth="3" fill="none" />
        </g>
      );
    default:
      return null;
  }
}
