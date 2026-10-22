import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export const CursorGlow: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isFinePointer, setIsFinePointer] = useState<boolean>(false);
  const [isVisible, setIsVisible] = useState<boolean>(true);

  useEffect(() => {
    // Only enable on desktop with fine pointer (mouse / trackpad)
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    setIsFinePointer(mediaQuery.matches);

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsFinePointer(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
    }

    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setPosition({ x: e.clientX, y: e.clientY });
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleMediaChange);
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  if (shouldReduceMotion || !isFinePointer || !isVisible || !position) {
    return null;
  }

  return (
    <motion.div
      aria-hidden="true"
      animate={{
        x: position.x - 180,
        y: position.y - 180,
      }}
      transition={{
        type: 'spring',
        damping: 30,
        stiffness: 200,
        mass: 0.6,
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '360px',
        height: '360px',
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: 1, // Behind main content (z-index: 2) but above background
        background:
          'radial-gradient(circle, rgba(205, 184, 255, 0.28) 0%, rgba(255, 201, 181, 0.16) 45%, rgba(185, 221, 255, 0.08) 65%, transparent 75%)',
        filter: 'blur(32px)',
        transform: 'translate3d(0, 0, 0)',
        willChange: 'transform',
      }}
    />
  );
};

export default CursorGlow;
