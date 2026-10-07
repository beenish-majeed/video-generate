import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface StickerProps {
  label: string;
  rotation?: string;
  variant?: 'terracotta' | 'sage' | 'blue' | 'amber';
  className?: string;
}

export const Sticker: React.FC<StickerProps> = ({
  label,
  rotation = '4deg',
  variant = 'terracotta',
  className = '',
}) => {
  const shouldReduceMotion = useReducedMotion();

  const variantStyles = {
    terracotta: {
      bg: '#faece6',
      border: 'var(--ink-terracotta)',
      color: 'var(--ink-terracotta)',
    },
    sage: {
      bg: '#eaf4ed',
      border: 'var(--ink-sage)',
      color: 'var(--ink-sage)',
    },
    blue: {
      bg: '#eaf1f6',
      border: 'var(--ink-blue)',
      color: 'var(--ink-blue)',
    },
    amber: {
      bg: '#fdf5e6',
      border: 'var(--ink-amber)',
      color: 'var(--ink-amber)',
    },
  };

  const style = variantStyles[variant];

  return (
    <motion.div
      whileHover={shouldReduceMotion ? {} : { scale: 1.06, rotate: [0, -3, 3, -1, 0] }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`sticker-badge ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 12px',
        backgroundColor: style.bg,
        border: `2px dashed ${style.border}`,
        color: style.color,
        fontFamily: 'var(--font-hand)',
        fontSize: '18px',
        fontWeight: 'bold',
        letterSpacing: '0.04em',
        borderRadius: '8px',
        transform: `rotate(${rotation})`,
        boxShadow: 'var(--shadow-card)',
        userSelect: 'none',
        cursor: 'pointer',
      }}
    >
      <span>✦</span>
      <span>{label}</span>
    </motion.div>
  );
};

export default Sticker;
