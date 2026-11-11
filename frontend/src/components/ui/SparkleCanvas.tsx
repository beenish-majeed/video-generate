import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface SparkleCanvasProps {
  density?: 'full' | 'subtle';
  className?: string;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinkleSpeed: number;
  phase: number;
  depth: number;
  baseAlpha: number;
  isTealGlitter: boolean;
}

export const SparkleCanvas: React.FC<SparkleCanvasProps> = ({
  density = 'full',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const [fps, setFps] = useState<number>(60);

  // Parallax offsets (interpolated smoothly)
  const mouseTargetRef = useRef({ x: 0, y: 0 });
  const mouseCurrentRef = useRef({ x: 0, y: 0 });
  const scrollOffsetRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let stars: Star[] = [];
    let width = 0;
    let height = 0;
    let isTabVisible = document.visibilityState === 'visible';

    // FPS measurement tracking
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsAccumulator = 0;

    const initStars = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      // Scale particle count to screen size and density
      const area = width * height;
      const count =
        density === 'full'
          ? Math.min(180, Math.max(70, Math.floor(area / 9000)))
          : Math.min(65, Math.max(25, Math.floor(area / 24000)));

      stars = [];
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.6 + 0.9, // 0.9px - 2.5px micro stars
          twinkleSpeed: Math.random() * 0.0018 + 0.0008, // Slow, calm twinkle
          phase: Math.random() * Math.PI * 2,
          depth: Math.random() * 0.7 + 0.3, // 0.3 - 1.0 parallax layer
          baseAlpha: Math.random() * 0.45 + 0.25,
          isTealGlitter: Math.random() > 0.65, // ~35% subtle teal shimmer, ~65% soft warm gold
        });
      }
    };

    initStars();

    const handleResize = () => {
      initStars();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (shouldReduceMotion) return;
      mouseTargetRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      };
    };

    const handleScroll = () => {
      scrollOffsetRef.current = window.scrollY || window.pageYOffset || 0;
    };

    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
      if (isTabVisible && !shouldReduceMotion) {
        lastTime = performance.now();
        animId = requestAnimationFrame(render);
      } else {
        cancelAnimationFrame(animId);
      }
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const render = (time: number) => {
      if (!isTabVisible) return;

      // Track FPS
      const dt = time - lastTime;
      lastTime = time;
      if (dt > 0) {
        const currentFps = 1000 / dt;
        frameCount++;
        fpsAccumulator += currentFps;
        if (frameCount >= 30) {
          const measured = Math.round(fpsAccumulator / frameCount);
          setFps(measured);
          (window as any).__SPARKLE_FPS__ = measured;
          frameCount = 0;
          fpsAccumulator = 0;
        }
      }

      ctx.clearRect(0, 0, width, height);

      // Calmly interpolate parallax offsets (ease factor 0.04)
      mouseCurrentRef.current.x +=
        (mouseTargetRef.current.x - mouseCurrentRef.current.x) * 0.04;
      mouseCurrentRef.current.y +=
        (mouseTargetRef.current.y - mouseCurrentRef.current.y) * 0.04;

      const mouseX = mouseCurrentRef.current.x;
      const mouseY = mouseCurrentRef.current.y;
      const scrollY = scrollOffsetRef.current;

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        // Parallax drift in layers
        const driftX = mouseX * 22 * s.depth;
        const driftY = mouseY * 22 * s.depth - (scrollY * 0.12 * s.depth);

        let drawX = (s.x + driftX) % width;
        if (drawX < 0) drawX += width;
        let drawY = (s.y + driftY) % height;
        if (drawY < 0) drawY += height;

        // Twinkle factor: gentle sine modulation
        const twinkle = Math.sin(time * s.twinkleSpeed + s.phase);
        const alpha = Math.max(
          0.08,
          Math.min(0.9, s.baseAlpha * (0.55 + 0.45 * twinkle))
        );

        ctx.save();
        ctx.beginPath();

        // Soft radial glow so particles read as shimmering glitter rather than hard dots
        const glowRadius = s.size * 2.2;
        const grad = ctx.createRadialGradient(
          drawX,
          drawY,
          0,
          drawX,
          drawY,
          glowRadius
        );

        if (s.isTealGlitter) {
          // Teal sparkle glint (#008080)
          grad.addColorStop(0, `rgba(0, 128, 128, ${alpha})`);
          grad.addColorStop(0.4, `rgba(0, 128, 128, ${alpha * 0.6})`);
          grad.addColorStop(1, 'rgba(0, 128, 128, 0)');
        } else {
          // Soft warm ivory shimmer
          grad.addColorStop(0, `rgba(255, 255, 240, ${alpha * 1.1})`);
          grad.addColorStop(0.35, `rgba(245, 245, 220, ${alpha * 0.7})`);
          grad.addColorStop(1, 'rgba(245, 245, 220, 0)');
        }

        ctx.fillStyle = grad;
        ctx.arc(drawX, drawY, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Micro core glint
        ctx.fillStyle = s.isTealGlitter
          ? `rgba(0, 128, 128, ${alpha})`
          : `rgba(255, 255, 255, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(drawX, drawY, s.size * 0.65, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    if (shouldReduceMotion) {
      // Render single static frame for reduced motion preference
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.isTealGlitter
          ? `rgba(0, 128, 128, ${s.baseAlpha * 0.5})`
          : `rgba(245, 245, 220, ${s.baseAlpha * 0.7})`;
        ctx.fill();
      }
      setFps(60);
      (window as any).__SPARKLE_FPS__ = 60;
    } else {
      animId = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [density, shouldReduceMotion]);

  return (
    <canvas
      ref={canvasRef}
      className={`sparkle-canvas-layer ${className}`}
      data-testid="sparkle-canvas"
      data-fps={fps}
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0,
        willChange: 'transform',
      }}
    />
  );
};

export default SparkleCanvas;
