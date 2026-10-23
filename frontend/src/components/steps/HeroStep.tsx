import React, { useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import BrushUnderline from '../ui/BrushUnderline';

export interface HeroStepProps {
  onGetStarted: () => void;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  onSelectPromptFlow?: () => void;
  onSelectCustomMediaFlow?: () => void;
}

const HEADLINE_WORDS: Array<{ text: string; italic: boolean; underline?: boolean }> = [
  { text: 'Turn', italic: false },
  { text: 'your', italic: false },
  { text: 'ideas', italic: false },
  { text: 'into', italic: false },
  { text: 'a', italic: false },
  { text: 'quiet,', italic: false },
  { text: 'living', italic: true },
  { text: 'video', italic: false },
  { text: 'memory.', italic: false, underline: true },
];

export const HeroStep: React.FC<HeroStepProps> = ({ onGetStarted }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [mouseOffset, setMouseOffset] = useState({ x: 0, y: 0 });
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(true);

  // Focus heading for accessibility on entrance
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  // Listen to tab visibility to pause motion when hidden
  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Mouse parallax on desktop, tilt on mobile with fallback
  useEffect(() => {
    if (shouldReduceMotion || !isVisible) return;

    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const x = (e.clientX / window.innerWidth) - 0.5;
        const y = (e.clientY / window.innerHeight) - 0.5;
        setMouseOffset({ x, y });
      });
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const x = Math.max(-0.5, Math.min(0.5, e.gamma! / 60));
          const y = Math.max(-0.5, Math.min(0.5, (e.beta! - 45) / 60));
          setMouseOffset({ x, y });
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (window.DeviceOrientationEvent) {
        window.removeEventListener('deviceorientation', handleOrientation);
      }
      cancelAnimationFrame(rafId);
    };
  }, [shouldReduceMotion, isVisible]);

  // Subtle magnetic hover for primary CTA button
  const handleBtnMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - (rect.left + rect.width / 2)) * 0.16;
    const y = (e.clientY - (rect.top + rect.height / 2)) * 0.16;
    setBtnOffset({ x, y });
  };

  const handleBtnMouseLeave = () => {
    setBtnOffset({ x: 0, y: 0 });
  };

  return (
    <div
      className="step-container"
      style={{
        minHeight: '100%',
        flex: 1,
        padding: '0 clamp(16px, 3vw, 48px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'clamp(20px, 3.5dvh, 48px)',
        position: 'relative',
        maxWidth: 'min(1200px, 94%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Floating Glass Parallax Shapes (Desktop Mouse & Mobile Tilt with Ambient Drift) */}
      <div
        className="hero-floating-shapes"
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          zIndex: 0,
        }}
      >
        {/* Shape 1: Top-Left Soft Lavender Glass Pill */}
        <motion.div
          animate={
            shouldReduceMotion || !isVisible
              ? {}
              : {
                  x: mouseOffset.x * -24,
                  y: mouseOffset.y * -20,
                  rotate: [0, 4, -4, 0],
                }
          }
          transition={{
            x: { type: 'spring', stiffness: 60, damping: 20 },
            y: { type: 'spring', stiffness: 60, damping: 20 },
            rotate: { duration: 16, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            top: '12%',
            left: '8%',
            width: 'clamp(80px, 10vw, 130px)',
            height: 'clamp(80px, 10vw, 130px)',
            borderRadius: 'var(--radius-pill)',
            background: 'linear-gradient(135deg, rgba(205, 184, 255, 0.45) 0%, rgba(255, 255, 255, 0.35) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.85)',
            boxShadow: 'var(--shadow-card)',
            opacity: 0.85,
          }}
        />

        {/* Shape 2: Bottom-Right Warm Peach Glass Disc */}
        <motion.div
          animate={
            shouldReduceMotion || !isVisible
              ? {}
              : {
                  x: mouseOffset.x * 28,
                  y: mouseOffset.y * 24,
                  rotate: [0, -6, 6, 0],
                }
          }
          transition={{
            x: { type: 'spring', stiffness: 50, damping: 18 },
            y: { type: 'spring', stiffness: 50, damping: 18 },
            rotate: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            bottom: '15%',
            right: '10%',
            width: 'clamp(90px, 12vw, 150px)',
            height: 'clamp(90px, 12vw, 150px)',
            borderRadius: '28px',
            background: 'linear-gradient(135deg, rgba(255, 201, 181, 0.4) 0%, rgba(255, 211, 232, 0.3) 100%)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.85)',
            boxShadow: 'var(--shadow-card)',
            opacity: 0.8,
          }}
        />

        {/* Shape 3: Middle-Right Sky Accent Bubble */}
        <motion.div
          animate={
            shouldReduceMotion || !isVisible
              ? {}
              : {
                  x: mouseOffset.x * -16,
                  y: mouseOffset.y * 18,
                  scale: [1, 1.05, 0.95, 1],
                }
          }
          transition={{
            x: { type: 'spring', stiffness: 70, damping: 22 },
            y: { type: 'spring', stiffness: 70, damping: 22 },
            scale: { duration: 12, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{
            position: 'absolute',
            top: '40%',
            right: '6%',
            width: 'clamp(50px, 7vw, 85px)',
            height: 'clamp(50px, 7vw, 85px)',
            borderRadius: 'var(--radius-pill)',
            background: 'linear-gradient(135deg, rgba(185, 221, 255, 0.45) 0%, rgba(255, 255, 255, 0.3) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.85)',
            boxShadow: 'var(--shadow-sm)',
            opacity: 0.75,
          }}
        />
      </div>

      {/* Solid Near-White Canvas Sheet Card over the Painted Landscape */}
      <div
        className="card hero-welcome-card"
        style={{
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-card)',
          padding: 'clamp(28px, 4.5dvh, 52px) clamp(24px, 4vw, 56px)',
          boxShadow: 'var(--shadow-card)',
          border: '1px solid var(--border-light)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'clamp(20px, 3dvh, 32px)',
          maxWidth: '820px',
          width: '100%',
          position: 'relative',
          zIndex: 1,
          boxSizing: 'border-box',
        }}
      >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(14px, 2dvh, 24px)',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
        }}
      >
        <h1
          ref={headingRef}
          tabIndex={-1}
          style={{
            fontSize: 'var(--text-hero, clamp(36px, 4.2vw, 64px))',
            lineHeight: 1.15,
            margin: 0,
            outline: 'none',
            maxWidth: 'clamp(18ch, 20ch, 22ch)',
            textWrap: 'balance',
            fontWeight: 500,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-serif)',
          }}
        >
          {/* Accessible text for screen readers & tests */}
          <span className="sr-only">Turn your ideas into a quiet, living video memory.</span>

          {/* Staggered word fade up animation */}
          <span aria-hidden="true" style={{ display: 'inline' }}>
            {HEADLINE_WORDS.map((item, idx) => (
              <motion.span
                key={idx}
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: shouldReduceMotion ? 0 : idx * 0.045,
                  duration: 0.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className={item.italic ? 'accent-italic' : undefined}
                style={{
                  display: 'inline-block',
                  marginRight: '0.28em',
                  position: item.underline ? 'relative' : undefined,
                }}
              >
                <span style={{ position: 'relative', zIndex: 1 }}>{item.text}</span>
                {item.underline && <BrushUnderline />}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{
            color: 'var(--text-muted)',
            fontSize: 'clamp(16px, 1.2vw, 20px)',
            lineHeight: 1.5,
            margin: 0,
            maxWidth: '680px',
            fontFamily: 'var(--font-sans)',
          }}
        >
          Craft an intimate animated memory with gentle sound.
        </motion.p>
      </header>

      {/* Single "Get started" button with magnetic hover & shine sweep */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          width: '100%',
          marginTop: 0,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <motion.button
          type="button"
          onClick={onGetStarted}
          onMouseMove={handleBtnMouseMove}
          onMouseLeave={handleBtnMouseLeave}
          animate={{ x: btnOffset.x, y: btnOffset.y }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 350, damping: 25 }}
          className="btn-primary btn-shine-wrap"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            minHeight: '52px',
            padding: '14px 40px',
            fontSize: '17px',
            cursor: 'pointer',
          }}
        >
          <span>Get started</span>
          <ArrowRight size={20} aria-hidden="true" />
          <span className="kbd-hint" title="Keyboard shortcut: Enter">↵</span>
        </motion.button>
      </div>
      </div>

      {/* Subtle Footer Line (Welcome Page Only) */}
      <footer
        style={{
          marginTop: 'clamp(8px, 1.5dvh, 16px)',
          fontSize: '12.5px',
          color: 'var(--text-muted)',
          opacity: 0.85,
          letterSpacing: '0.015em',
          userSelect: 'none',
          zIndex: 1,
        }}
      >
        <span>Crafted with local neural models — 100% private &amp; offline at runtime</span>
      </footer>
    </div>
  );
};

export default HeroStep;
