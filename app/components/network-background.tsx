"use client";

import { useEffect, useRef } from "react";

type Node = { x: number; y: number; phase: number; hub: boolean };
const noise = (value: number) => {
  const n = Math.sin(value * 127.1 + 32.7) * 43758.5453;
  return n - Math.floor(n);
};

export default function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !shell || !context) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let nodes: Node[] = [];
    let pointer = { x: -1000, y: -1000 };
    let frame = 0;
    let visible = true;
    let paused = false;
    let lastDraw = 0;

    function resize() {
      if (!canvas || !shell || !context) return;
      const rect = shell.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const spacing = width < 700 ? 82 : 108;
      columns = Math.ceil(width / spacing) + 2;
      rows = Math.ceil(height / spacing) + 2;
      nodes = Array.from({ length: columns * rows }, (_, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = (col - .5) * spacing + (noise(index + 3) - .5) * spacing * .65;
        const y = (row - .5) * spacing + (noise(index + 79) - .5) * spacing * .65;
        const hub = noise(index + 190) > .965;
        return { x, y, phase: noise(index + 340) * Math.PI * 2, hub };
      });
      draw(0);
    }

    function draw(now: number) {
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const t = reduced.matches ? 0 : now * .00032;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const nearPointer = Math.max(0, 1 - Math.hypot(node.x - pointer.x, node.y - pointer.y) / 230);
        const pulse = .5 + .5 * Math.sin(t * 2 + node.phase);
        const neighbors = [i + 1, i + columns, i + columns + (i % 2 ? 1 : -1)];
        for (const next of neighbors) {
          if (next < 0 || next >= nodes.length || (next === i + 1 && i % columns === columns - 1)) continue;
          const other = nodes[next];
          if (Math.hypot(node.x - other.x, node.y - other.y) > 165) continue;
          const active = node.hub || other.hub;
          context.strokeStyle = `rgba(${active ? "155,228,177" : "89,167,135"},${.1 + (active ? .13 : 0) + nearPointer * .35 + pulse * .035})`;
          context.lineWidth = active ? 1.1 : .8;
          context.beginPath();
          context.moveTo(node.x, node.y);
          context.lineTo(other.x, other.y);
          context.stroke();
          if (active && !reduced.matches) {
            const travel = (t * .28 + node.phase / 6) % 1;
            context.fillStyle = `rgba(186,242,168,${.22 + nearPointer * .45})`;
            context.beginPath();
            context.arc(node.x + (other.x - node.x) * travel, node.y + (other.y - node.y) * travel, 1.5, 0, Math.PI * 2);
            context.fill();
          }
        }
        if (node.hub) {
          const radius = 12 + pulse * 8;
          context.strokeStyle = `rgba(173,232,177,${.09 + nearPointer * .26})`;
          context.beginPath();
          context.arc(node.x, node.y, radius, 0, Math.PI * 2);
          context.stroke();
        }
        context.fillStyle = `rgba(192,242,177,${node.hub ? .68 : .21 + pulse * .12 + nearPointer * .55})`;
        context.beginPath();
        context.arc(node.x, node.y, node.hub ? 2.8 : 1.35 + nearPointer, 0, Math.PI * 2);
        context.fill();
      }
    }

    function animate(now: number) {
      if (!visible || document.hidden || reduced.matches || paused) return;
      if (now - lastDraw > 32) { draw(now); lastDraw = now; }
      frame = requestAnimationFrame(animate);
    }
    const observer = new ResizeObserver(resize);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !reduced.matches && !paused) frame = requestAnimationFrame(animate);
    });
    const move = (event: PointerEvent) => {
      const bounds = shell.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (reduced.matches) draw(0);
    };
    const leave = () => { pointer = { x: -1000, y: -1000 }; if (reduced.matches) draw(0); };
    const motionChange = () => {
      cancelAnimationFrame(frame);
      draw(0);
      if (visible && !reduced.matches && !paused) frame = requestAnimationFrame(animate);
    };
    const motionToggle = (event: Event) => {
      paused = (event as CustomEvent<boolean>).detail;
      cancelAnimationFrame(frame);
      if (!paused && visible && !reduced.matches) frame = requestAnimationFrame(animate);
    };
    observer.observe(shell);
    intersection.observe(shell);
    shell.addEventListener("pointermove", move, { passive: true });
    shell.addEventListener("pointerleave", leave);
    reduced.addEventListener("change", motionChange);
    window.addEventListener("businessvault:motion", motionToggle);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      shell.removeEventListener("pointermove", move);
      shell.removeEventListener("pointerleave", leave);
      reduced.removeEventListener("change", motionChange);
      window.removeEventListener("businessvault:motion", motionToggle);
    };
  }, []);

  return <div className="network-background" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
