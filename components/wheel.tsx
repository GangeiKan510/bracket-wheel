"use client";

import { useEffect, useRef, type RefObject } from "react";
import { playTick } from "@/lib/audio";
import { segmentAtPointer } from "@/lib/draw";
import { mix, textOn } from "@/lib/palette";

type WheelProps = {
  labels: string[];
  colors: string[];
  rotationRef: RefObject<number>;
  spinningRef: RefObject<boolean>;
  soundRef: RefObject<boolean>;
  spinning: boolean;
  clickable: boolean;
  onActivate: () => void;
  hubKicker: string;
  hubTitle: string;
  hubSubtitle: string;
  hubAccent?: string;
};

let cachedFamily = "";

function fontFamily(): string {
  if (cachedFamily) return cachedFamily;
  if (typeof document === "undefined") return "Impact, sans-serif";
  const value = getComputedStyle(document.body)
    .getPropertyValue("--font-display")
    .trim();
  if (!value) return "Impact, sans-serif";
  cachedFamily = value;
  return cachedFamily;
}

function paintWheel(
  canvas: HTMLCanvasElement,
  labels: string[],
  colors: string[],
  rotation: number,
  spinning: boolean,
  time: number,
  reducedMotion: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx || labels.length === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = canvas.clientWidth;
  if (size <= 0) return;
  const px = Math.round(size * dpr);
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px;
    canvas.height = px;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 22;
  const inner = radius * 0.48;
  const count = labels.length;
  const slice = (Math.PI * 2) / count;
  const active = spinning ? -1 : segmentAtPointer(rotation, count);
  const family = fontFamily();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let index = 0; index < count; index++) {
    const start = -Math.PI / 2 + index * slice;
    const color = colors[index] ?? "#335588";
    ctx.beginPath();
    ctx.arc(0, 0, radius, start, start + slice);
    ctx.arc(0, 0, inner, start + slice, start, true);
    ctx.closePath();
    const gradient = ctx.createRadialGradient(0, 0, inner, 0, 0, radius);
    gradient.addColorStop(
      0,
      mix(color, "#ffffff", index === active ? 0.3 : 0.14),
    );
    gradient.addColorStop(1, mix(color, "#000000", 0.2));
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  if (active >= 0) {
    const start = -Math.PI / 2 + active * slice;
    ctx.beginPath();
    ctx.arc(0, 0, radius - 1, start, start + slice);
    ctx.arc(0, 0, inner + 1, start + slice, start, true);
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 250, 240, 0.92)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  for (let index = 0; index < count; index++) {
    const start = -Math.PI / 2 + index * slice;
    const color = colors[index] ?? "#335588";
    const mid = start + slice / 2;
    ctx.save();
    ctx.rotate(mid);
    ctx.translate(inner + (radius - inner) * 0.52, 0);
    ctx.rotate(-(mid + rotation));
    ctx.fillStyle = textOn(color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontSize = Math.max(18, Math.min(52, (radius - inner) * 0.48));
    ctx.font = `700 ${fontSize}px ${family}`;
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 6;
    ctx.fillText(labels[index] ?? "", 0, 0);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "#241a0c";
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(240, 193, 74, 0.92)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, inner, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(240, 193, 74, 0.8)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, inner - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#0c1424";
  ctx.fill();

  for (let index = 0; index < count; index++) {
    const angle = -Math.PI / 2 + index * slice;
    ctx.beginPath();
    ctx.arc(
      Math.cos(angle) * (radius - 8),
      Math.sin(angle) * (radius - 8),
      3.4,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "#f3d48a";
    ctx.fill();
  }

  ctx.restore();

  const bulbs = Math.max(24, count * 4);
  const chase = reducedMotion ? 0 : Math.floor(time / (spinning ? 55 : 320));
  for (let index = 0; index < bulbs; index++) {
    const angle = -Math.PI / 2 + (index / bulbs) * Math.PI * 2;
    const x = cx + Math.cos(angle) * (radius + 12);
    const y = cy + Math.sin(angle) * (radius + 12);
    const lit = reducedMotion ? index % 2 === 0 : (index + chase) % 2 === 0;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = lit ? "#ffe7a8" : "rgba(90, 74, 40, 0.95)";
    if (lit) {
      ctx.shadowColor = "rgba(255, 214, 120, 0.95)";
      ctx.shadowBlur = 8;
    }
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function Wheel({
  labels,
  colors,
  rotationRef,
  spinningRef,
  soundRef,
  spinning,
  clickable,
  onActivate,
  hubKicker,
  hubTitle,
  hubSubtitle,
  hubAccent,
}: WheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    let lastSegment = -1;
    const loop = (time: number) => {
      const rotation = rotationRef.current;
      const isSpinning = spinningRef.current;
      paintWheel(
        canvas,
        labels,
        colors,
        rotation,
        isSpinning,
        time,
        reducedRef.current,
      );
      if (isSpinning && labels.length > 0) {
        const segment = segmentAtPointer(rotation, labels.length);
        if (segment !== lastSegment) {
          if (lastSegment !== -1 && soundRef.current && !reducedRef.current)
            playTick();
          lastSegment = segment;
        }
      } else {
        lastSegment = -1;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [colors, labels, rotationRef, soundRef, spinningRef]);

  return (
    <div
      className={`wheel-stage${spinning ? " is-spinning" : ""}${clickable ? " is-clickable" : ""}`}
      onClick={() => {
        if (clickable) onActivate();
      }}
    >
      <canvas ref={canvasRef} className="wheel-canvas" aria-hidden="true" />
      <svg className="pointer" viewBox="0 0 40 46" aria-hidden="true">
        <path
          d="M2 3 H38 L20 42 Z"
          fill="#f6d56a"
          stroke="#2a1d08"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="hub"
        style={hubAccent ? { borderColor: hubAccent } : undefined}
      >
        <p className="hub-kicker">{hubKicker}</p>
        <p className="hub-title">{hubTitle}</p>
        <p
          className="hub-sub"
          style={hubAccent ? { color: hubAccent } : undefined}
        >
          {hubSubtitle}
        </p>
      </div>
    </div>
  );
}
