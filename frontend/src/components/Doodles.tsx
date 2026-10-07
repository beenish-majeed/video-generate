import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * ORIGINAL Self-Drawing Inline SVG Doodles with hand-drawn sketchbook aesthetic.
 * All paths feature self-sketching SVG stroke animations and respect prefers-reduced-motion.
 */

export const DoodleStar: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 24,
  color = 'var(--ink-terracotta)',
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = { duration: shouldReduceMotion ? 0 : 0.8, ease: 'easeOut' };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <motion.path
        d="M20 3 C20.5 12 28 19.5 37 20 C28 20.5 20.5 28 20 37 C19.5 28 12 20.5 3 20 C12 19.5 19.5 12 20 3 Z"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={color}
        fillOpacity="0.15"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={transition}
      />
    </svg>
  );
};

export const DoodleSparkle: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = 'var(--ink-amber)',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = { duration: shouldReduceMotion ? 0 : 0.7, ease: 'easeOut' };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <motion.path
        d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition}
      />
    </svg>
  );
};

export const DoodlePerson: React.FC<{ width?: number; height?: number; color?: string }> = ({
  width = 120,
  height = 140,
  color = 'var(--ink-primary)',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.6,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={width} height={height} viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hand-drawn head */}
      <motion.circle
        cx="60"
        cy="35"
        r="20"
        stroke={color}
        strokeWidth="3"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      {/* Eyes and smile */}
      <circle cx="53" cy="32" r="2.5" fill={color} />
      <circle cx="67" cy="32" r="2.5" fill={color} />
      <motion.path
        d="M53 42 C56 46, 64 46, 67 42"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      {/* Body stick/torso */}
      <motion.path
        d="M60 55 C59 75, 61 95, 60 115"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      {/* Arms raised reaching for memory stars */}
      <motion.path
        d="M60 70 C45 60, 30 50, 22 38"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
      <motion.path
        d="M60 70 C75 60, 90 50, 98 38"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.5)}
      />
      {/* Legs standing on ground */}
      <motion.path
        d="M60 115 C50 125, 42 135, 38 138"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.6)}
      />
      <motion.path
        d="M60 115 C70 125, 78 135, 82 138"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.7)}
      />
    </svg>
  );
};

export const DoodlePlant: React.FC<{ size?: number; color?: string }> = ({
  size = 64,
  color = 'var(--ink-sage)',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.5,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Potted Plant base */}
      <motion.path
        d="M20 44 L24 58 L40 58 L44 44 Z"
        stroke="var(--ink-primary)"
        strokeWidth="2.5"
        fill="var(--paper-cream-alt)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      <motion.path
        d="M18 44 L46 44"
        stroke="var(--ink-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.1)}
      />
      {/* Leaves */}
      <motion.path
        d="M32 44 Q32 24 20 16 Q30 26 32 44 Z"
        fill={color}
        stroke="var(--ink-primary)"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      <motion.path
        d="M32 44 Q34 20 46 14 Q38 26 32 44 Z"
        fill={color}
        stroke="var(--ink-primary)"
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      <motion.path
        d="M32 36 Q18 30 12 36 Q22 38 32 36 Z"
        fill={color}
        stroke="var(--ink-primary)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
      <motion.path
        d="M32 36 Q46 30 52 36 Q42 38 32 36 Z"
        fill={color}
        stroke="var(--ink-primary)"
        strokeWidth="1.5"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.5)}
      />
    </svg>
  );
};

export const DoodleCamera: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = 'var(--ink-primary)',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.5,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 60 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <motion.rect
        x="5"
        y="10"
        width="50"
        height="36"
        rx="4"
        stroke={color}
        strokeWidth="3"
        fill="var(--paper-cream-alt)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      <motion.path
        d="M20 10 L24 4 L36 4 L40 10 Z"
        stroke={color}
        strokeWidth="2.5"
        fill="var(--paper-cream-dark)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      <motion.circle
        cx="30"
        cy="28"
        r="11"
        stroke={color}
        strokeWidth="3"
        fill="var(--paper-cream)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      <motion.circle
        cx="30"
        cy="28"
        r="5"
        stroke="var(--ink-terracotta)"
        strokeWidth="2"
        fill="var(--ink-terracotta)"
        fillOpacity="0.2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
      <rect x="42" y="14" width="8" height="6" rx="1" stroke={color} strokeWidth="2" fill="var(--ink-amber)" />
    </svg>
  );
};

export const DoodleMic: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = 'var(--ink-primary)',
}) => {
  const shouldReduceMotion = useReducedMotion();
  const transition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 0.5,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <svg width={size} height={size} viewBox="0 0 50 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <motion.rect
        x="18"
        y="6"
        width="14"
        height="24"
        rx="7"
        stroke={color}
        strokeWidth="3"
        fill="var(--paper-cream-alt)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0)}
      />
      <path d="M18 14 L32 14 M18 20 L32 20" stroke={color} strokeWidth="1.5" />
      <motion.path
        d="M11 22 C11 36, 39 36, 39 22"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.2)}
      />
      <motion.path
        d="M25 35 L25 50"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.3)}
      />
      <motion.path
        d="M15 50 L35 50"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={transition(0.4)}
      />
    </svg>
  );
};

export const DoodleSpiral: React.FC<{ count?: number }> = ({ count = 12 }) => {
  const loops = Array.from({ length: count });
  return (
    <div style={{ display: 'flex', gap: '16px', padding: '8px 16px', justifyContent: 'center' }}>
      {loops.map((_, i) => (
        <svg key={i} width="16" height="28" viewBox="0 0 16 28" fill="none">
          <rect x="3" y="2" width="10" height="24" rx="5" fill="#3a3834" />
          <rect x="5" y="4" width="6" height="20" rx="3" fill="#605c56" />
        </svg>
      ))}
    </div>
  );
};
