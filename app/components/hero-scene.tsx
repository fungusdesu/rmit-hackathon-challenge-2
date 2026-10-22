"use client";

import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number; z: number };

// Five independent owners; a three-owner quorum authorizes the shared vault.
const OWNER_COUNT = 5;
const QUORUM = 3;
const CYCLE_SECONDS = 12;
const ownerAngle = (index: number) => -Math.PI / 2 + index * Math.PI * 2 / OWNER_COUNT;
const circlePoint = (angle: number, radius: number, z = 0): Point => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z });

export default function HeroScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef({ time: 0, tiltX: 0, tiltY: 0 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const hero = canvas?.closest<HTMLElement>(".hero");
    if (!canvas || !context || !hero) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = 0;
    let time = poseRef.current.time;
    let visible = true;
    let pointerX = 0;
    let pointerY = 0;
    let tiltX = poseRef.current.tiltX;
    let tiltY = poseRef.current.tiltY;

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const mobile = window.innerWidth <= 900;
      const centerX = width * (mobile ? .88 : .74);
      const centerY = height * .48;
      const scale = mobile ? Math.min(width / 420, 1.4) : Math.min(width / 1120, 1.45);
      const yaw = -.18 + Math.sin(time * .14) * .15 + tiltX * .35;
      const pitch = .28 + tiltY * .3;
      // Reduced-motion visitors see the completed concept without animation.
      const phase = motion.matches ? 7 : time % CYCLE_SECONDS;
      const round = Math.floor(time / CYCLE_SECONDS);
      const approvals = Array.from({ length: OWNER_COUNT }, (_, index) => {
        const order = (index - round % OWNER_COUNT + OWNER_COUNT) % OWNER_COUNT;
        return order < QUORUM ? Math.max(0, Math.min(1, (phase - .7 - order * 1.25) / 1.1)) : 0;
      });
      const approvedCount = approvals.filter(value => value === 1).length;
      const authorized = approvedCount >= QUORUM;
      const fade = Math.min(1, (CYCLE_SECONDS - phase) / 1.5);

      function project(point: Point) {
        const x = point.x * Math.cos(yaw) + point.z * Math.sin(yaw);
        const z = -point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
        const y = point.y * Math.cos(pitch) - z * Math.sin(pitch);
        const depth = point.y * Math.sin(pitch) + z * Math.cos(pitch);
        const perspective = 700 / (700 + depth);
        return { x: centerX + x * scale * perspective, y: centerY + y * scale * perspective, depth, perspective };
      }

      // A low horizon of waves gives the sculpture a spatial reference.
      for (let row = 0; row < 24; row++) {
        for (let col = 0; col < 66; col++) {
          const x = (col - 33) * 24;
          const z = row * 30 - 130;
          const wave = Math.sin(col * .2 + time * .7) * 15 + Math.cos(row * .3 + time * .5) * 11;
          const perspective = 540 / (540 + z);
          const px = width * .57 + (x + tiltX * 22) * perspective * scale;
          const py = centerY + (220 + wave) * perspective * scale;
          const alpha = (.08 + .19 * (1 - row / 24)) * Math.min(1, col / 10, (66 - col) / 10);
          context.fillStyle = `rgba(143,196,155,${alpha})`;
          context.beginPath();
          context.arc(px, py, Math.max(.45, perspective * .85), 0, Math.PI * 2);
          context.fill();
        }
      }

      const halo = context.createRadialGradient(centerX, centerY, 15, centerX, centerY, 285 * scale);
      halo.addColorStop(0, "rgba(137,209,116,.075)");
      halo.addColorStop(.6, "rgba(95,185,137,.035)");
      halo.addColorStop(1, "rgba(95,185,137,0)");
      context.fillStyle = halo;
      context.fillRect(0, 0, width, height);

      function stroke(points: Point[], color: string, lineWidth = .8, closed = false) {
        if (!context) return;
        context.beginPath();
        points.map(project).forEach((point, index) => {
          if (index === 0) context.moveTo(point.x, point.y);
          else context.lineTo(point.x, point.y);
        });
        if (closed) context.closePath();
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
      }
      function dot(point: Point, radius: number, color: string) {
        if (!context) return;
        const p = project(point);
        context.beginPath();
        context.arc(p.x, p.y, radius * p.perspective * scale, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
      }

      // A segmented protective shell: each owner controls one part of the boundary.
      for (let owner = 0; owner < OWNER_COUNT; owner++) {
        const angle = ownerAngle(owner);
        const approved = approvals[owner] === 1;
        for (let layer = 0; layer < 8; layer++) {
          const arc = Array.from({ length: 40 }, (_, step) => circlePoint(angle - .53 + step / 39 * 1.06, 132 + Math.sin(layer / 7 * Math.PI) * 13, (layer - 3.5) * 9));
          stroke(arc, `rgba(149,208,153,${approved ? .15 * fade + .05 : .055})`, .6);
          arc.forEach((point, step) => dot(point, step % 6 === 0 ? .9 : .55, `rgba(174,226,156,${approved ? .55 * fade + .15 : .2})`));
        }
        stroke(Array.from({ length: 44 }, (_, step) => circlePoint(angle - .53 + step / 43 * 1.06, 151, -32)), `rgba(192,239,157,${approved ? .75 * fade : .15})`, approved ? 1.5 : .7);
      }

      // Owner portraits and separate approval paths. No single path activates the vault.
      for (let owner = 0; owner < OWNER_COUNT; owner++) {
        const angle = ownerAngle(owner);
        const origin = circlePoint(angle, 220, Math.sin(angle * 2) * 24);
        const progress = approvals[owner];
        const approved = progress === 1;
        const color = `rgba(195,239,164,${approved ? .9 * fade : .38})`;
        const path = Array.from({ length: 50 }, (_, step) => {
          const fraction = step / 49;
          return circlePoint(angle + Math.sin(fraction * Math.PI) * .12, 198 - fraction * 121, origin.z * (1 - fraction));
        });
        stroke(path, `rgba(158,212,160,${approved ? .38 * fade : .12})`);
        if (progress > 0 && progress < 1) {
          for (let trail = 0; trail < 8; trail++) {
            const point = path[Math.max(0, Math.floor(progress * 49) - trail)];
            dot(point, trail === 0 ? 2.8 : 1.3, `rgba(220,255,185,${(1 - trail / 8) * .95})`);
          }
        }
        const local = (x: number, y: number): Point => ({ x: origin.x + x, y: origin.y + y, z: origin.z });
        dot(origin, 22, "rgba(10,25,17,.85)");
        stroke(Array.from({ length: 49 }, (_, step) => local(Math.cos(step / 48 * Math.PI * 2) * 22, Math.sin(step / 48 * Math.PI * 2) * 22)), color, 1);
        stroke(Array.from({ length: 25 }, (_, step) => local(Math.cos(step / 24 * Math.PI * 2) * 5, -6 + Math.sin(step / 24 * Math.PI * 2) * 5)), color, 1.2);
        stroke(Array.from({ length: 25 }, (_, step) => local(Math.cos(Math.PI + step / 24 * Math.PI) * 10, 12 + Math.sin(Math.PI + step / 24 * Math.PI) * 9)), color, 1.2);
        if (approved) {
          dot(local(17, 16), 7, `rgba(184,233,134,${.75 * fade})`);
          stroke([local(14, 16), local(16, 18), local(20, 13)], "rgba(13,35,20,.9)", 1.5);
        }
      }

      // The vault is a hexagonal chamber with a recognizable lock on its front face.
      const hex = (radius: number, z: number) => Array.from({ length: 6 }, (_, side) => circlePoint(-Math.PI / 2 + side * Math.PI / 3, radius, z));
      const front = hex(66, -30);
      const back = hex(66, 30);
      stroke(back, "rgba(150,200,156,.25)", .8, true);
      front.forEach((point, index) => stroke([point, back[index]], "rgba(150,200,156,.22)"));
      const fill = front.map(project);
      context.beginPath();
      fill.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
      context.closePath();
      context.fillStyle = authorized ? `rgba(69,110,51,${.18 * fade + .1})` : "rgba(10,23,16,.8)";
      context.fill();
      const vaultColor = `rgba(205,246,174,${authorized ? .9 * fade + .1 : .4})`;
      stroke(front, vaultColor, 1.4, true);
      stroke(hex(56, -31), "rgba(166,218,153,.22)", .8, true);
      const lockZ = -32;
      stroke(Array.from({ length: 25 }, (_, step) => ({ x: Math.cos(Math.PI + step / 24 * Math.PI) * 12, y: -7 + Math.sin(Math.PI + step / 24 * Math.PI) * 13, z: lockZ })), vaultColor, 1.8);
      stroke([{ x: -19, y: -7, z: lockZ }, { x: 19, y: -7, z: lockZ }, { x: 19, y: 22, z: lockZ }, { x: -19, y: 22, z: lockZ }], vaultColor, 1.8, true);
      dot({ x: 0, y: 4, z: lockZ }, 2.8, vaultColor);
      stroke([{ x: 0, y: 5, z: lockZ }, { x: 0, y: 13, z: lockZ }], vaultColor, 1.8);

      // A completed quorum releases a soft confirmation pulse, then the story repeats.
      if (authorized) {
        const pulse = Math.min(1, (phase - 4.3) / 3);
        stroke(Array.from({ length: 100 }, (_, step) => circlePoint(step / 99 * Math.PI * 2, 75 + Math.max(0, pulse) * 100, -33)), `rgba(203,247,167,${Math.max(0, (1 - pulse) * .5)})`, 1);
      }
      const caption = project({ x: 0, y: 88, z: -32 });
      context.textAlign = "center";
      context.font = `${Math.max(8, 7 * scale)}px monospace`;
      context.fillStyle = "rgba(195,230,177,.7)";
      if (!mobile) context.fillText("SHARED VAULT", caption.x, caption.y);
      const quorumCaption = project({ x: 0, y: 101, z: -32 });
      context.fillStyle = authorized ? `rgba(203,247,167,${.85 * fade})` : "rgba(155,190,159,.6)";
      if (!mobile) context.fillText(authorized ? "QUORUM REACHED" : `${approvedCount} / ${QUORUM} APPROVALS`, quorumCaption.x, quorumCaption.y);
      // Three small indicators make the threshold visible even at a glance.
      for (let index = 0; index < QUORUM; index++) {
        const indicator = project({ x: (index - 1) * 10, y: 114, z: -32 });
        context.fillStyle = index < approvedCount ? `rgba(203,247,167,${.8 * fade})` : "rgba(155,190,159,.2)";
        context.beginPath();
        context.arc(indicator.x, indicator.y, 2 * scale, 0, Math.PI * 2);
        context.fill();
      }
    }

    function animate(now: number) {
      frame = 0;
      if (!visible || document.hidden || paused || motion.matches) return;
      const elapsed = lastTime ? Math.min((now - lastTime) / 1000, .05) : 0;
      lastTime = now;
      time += elapsed;
      tiltX += (pointerX - tiltX) * .045;
      tiltY += (pointerY - tiltY) * .045;
      poseRef.current = { time, tiltX, tiltY };
      draw();
      frame = requestAnimationFrame(animate);
    }

    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
      draw();
      if (visible && !document.hidden && !paused && !motion.matches) frame = requestAnimationFrame(animate);
    }

    const resize = new ResizeObserver(() => {
      const bounds = canvas.parentElement!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      sync();
    });
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    const move = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      pointerX = ((event.clientX - bounds.left) / width - .5) * 2;
      pointerY = ((event.clientY - bounds.top) / height - .5) * 2;
    };
    const leave = () => { pointerX = 0; pointerY = 0; };
    resize.observe(hero);
    intersection.observe(hero);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, [paused]);

  return (
    <>
      <div className="hero-scene" aria-hidden="true"><canvas ref={canvasRef} /></div>
      <p className="scene-description">Shared control, illustrated: three of five owners send approvals before the protected vault activates.</p>
      <div className="scene-controls"><button type="button" aria-label={paused ? "Resume background animation" : "Pause background animation"} aria-pressed={paused} onClick={() => setPaused(value => { window.dispatchEvent(new CustomEvent("businessvault:motion", { detail: !value })); return !value; })}>{paused ? "Resume motion" : "Pause motion"}<span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span></button></div>
    </>
  );
}
