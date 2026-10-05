import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * HeroScene: An original calm illustrated scene.
 * Features a lone figure standing on a soft green hill under a warm sky,
 * with self-drawing SVG path strokes that respect prefers-reduced-motion.
 */
export const HeroScene: React.FC = () => {
  const shouldReduceMotion = useReducedMotion();

  const drawTransition = {
    duration: shouldReduceMotion ? 0 : 1.8,
    ease: 'easeInOut',
  };

  const starTransition = (delay: number) => ({
    duration: shouldReduceMotion ? 0 : 1.2,
    delay: shouldReduceMotion ? 0 : delay,
    ease: 'easeOut',
  });

  return (
    <div
      aria-label="Illustration of a lone figure standing on a soft green hill looking up at a warm evening sky with stars."
      role="img"
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '640px',
        margin: '0 auto',
        borderRadius: '16px',
        backgroundColor: '#fdf4ea',
        border: '1.5px solid var(--paper-border)',
        boxShadow: 'var(--shadow-paper-float)',
        overflow: 'hidden',
        aspectRatio: '16/9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        viewBox="0 0 640 360"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <defs>
          {/* Soft warm sky gradient */}
          <linearGradient id="warmSkyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fdf1e4" />
            <stop offset="60%" stopColor="#fae2d0" />
            <stop offset="100%" stopColor="#f4cbba" />
          </linearGradient>
          {/* Soft green hill gradient */}
          <linearGradient id="softHillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#558b62" />
            <stop offset="100%" stopColor="#3d6948" />
          </linearGradient>
          <linearGradient id="bgHillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#7ba384" />
            <stop offset="100%" stopColor="#578261" />
          </linearGradient>
        </defs>

        {/* Sky Background */}
        <rect width="640" height="360" fill="url(#warmSkyGradient)" />

        {/* Glowing Warm Sun / Moon */}
        <circle cx="480" cy="110" r="45" fill="#fce4c8" opacity="0.6" />
        <circle cx="480" cy="110" r="30" fill="#fcd2a8" opacity="0.8" />

        {/* Self-Drawing Soft Clouds */}
        <motion.path
          d="M 80 100 Q 110 80, 140 100 Q 170 80, 200 100 Q 220 120, 190 130 L 90 130 Z"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="2.5"
          fill="rgba(255, 255, 255, 0.35)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={drawTransition}
        />
        <motion.path
          d="M 420 70 Q 445 55, 470 70 Q 495 55, 520 70 Q 535 85, 510 95 L 430 95 Z"
          stroke="rgba(255, 255, 255, 0.7)"
          strokeWidth="2"
          fill="rgba(255, 255, 255, 0.25)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...drawTransition, delay: 0.3 }}
        />

        {/* Distant Rolling Hill */}
        <path
          d="M -20 280 Q 160 210, 360 250 Q 520 280, 660 220 L 660 380 L -20 380 Z"
          fill="url(#bgHillGradient)"
          opacity="0.7"
        />

        {/* Main Foreground Soft Green Hill */}
        <motion.path
          d="M -10 360 C 120 260, 280 230, 650 360 L 650 380 L -10 380 Z"
          fill="url(#softHillGradient)"
          stroke="var(--ink-primary)"
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: shouldReduceMotion ? 0 : 1.5, ease: 'easeOut' }}
        />

        {/* Plant / Wildflower Sketch Doodles on Hill */}
        <motion.path
          d="M 140 290 Q 135 275, 130 265 M 140 290 Q 148 278, 155 270 M 140 290 L 140 260"
          stroke="#2c4d34"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.8, duration: shouldReduceMotion ? 0 : 0.8 }}
        />
        <motion.path
          d="M 480 305 Q 475 290, 468 280 M 480 305 Q 488 292, 495 285"
          stroke="#2c4d34"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.0, duration: shouldReduceMotion ? 0 : 0.8 }}
        />

        {/* Self-Drawing Lone Figure Standing Peacefully on Hill Top */}
        <g transform="translate(290, 162)">
          {/* Figure Head */}
          <motion.circle
            cx="20"
            cy="15"
            r="9"
            stroke="var(--ink-primary)"
            strokeWidth="2.5"
            fill="var(--paper-cream)"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.5, duration: shouldReduceMotion ? 0 : 0.8 }}
          />
          {/* Eyes & peaceful posture */}
          <circle cx="23" cy="14" r="1.2" fill="var(--ink-primary)" />
          {/* Figure Torso / Coat */}
          <motion.path
            d="M 20 24 L 20 58 M 20 32 L 8 46 M 20 32 L 34 44"
            stroke="var(--ink-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.7, duration: shouldReduceMotion ? 0 : 1.0 }}
          />
          {/* Figure Legs */}
          <motion.path
            d="M 20 58 L 13 80 M 20 58 L 27 80"
            stroke="var(--ink-primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.9, duration: shouldReduceMotion ? 0 : 0.8 }}
          />
        </g>

        {/* Self-Drawing Story / Memory Stars & Sparks in the Sky */}
        {/* Star 1 */}
        <motion.path
          d="M 240 60 C 240 70, 245 75, 255 75 C 245 75, 240 80, 240 90 C 240 80, 235 75, 225 75 C 235 75, 240 70, 240 60 Z"
          stroke="var(--ink-terracotta)"
          strokeWidth="2"
          fill="var(--ink-terracotta)"
          fillOpacity="0.2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={starTransition(0.9)}
        />
        {/* Star 2 */}
        <motion.path
          d="M 370 40 C 370 47, 374 50, 381 50 C 374 50, 370 53, 370 60 C 370 53, 366 50, 359 50 C 366 50, 370 47, 370 40 Z"
          stroke="var(--ink-amber)"
          strokeWidth="2"
          fill="var(--ink-amber)"
          fillOpacity="0.25"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={starTransition(1.1)}
        />
        {/* Star 3 */}
        <motion.path
          d="M 130 150 C 130 155, 133 158, 138 158 C 133 158, 130 161, 130 166 C 130 161, 127 158, 122 158 C 127 158, 130 155, 130 150 Z"
          stroke="var(--ink-terracotta)"
          strokeWidth="1.8"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={starTransition(1.3)}
        />
      </svg>
    </div>
  );
};

export default HeroScene;
