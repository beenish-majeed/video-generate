import React from 'react';

/**
 * ORIGINAL Inline SVG Doodles with hand-drawn sketchbook aesthetic.
 * All paths feature slightly organic, un-perfect strokes for an authentic paper-ink feel.
 */

export const DoodleStar: React.FC<{ size?: number; color?: string; className?: string }> = ({
  size = 24,
  color = 'var(--ink-terracotta)',
  className = '',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M20 3 C20.5 12 28 19.5 37 20 C28 20.5 20.5 28 20 37 C19.5 28 12 20.5 3 20 C12 19.5 19.5 12 20 3 Z"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={color}
      fillOpacity="0.15"
    />
  </svg>
);

export const DoodleSparkle: React.FC<{ size?: number; color?: string }> = ({
  size = 18,
  color = 'var(--ink-amber)',
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L13.5 9.5L21 11L13.5 12.5L12 20L10.5 12.5L3 11L10.5 9.5L12 2Z"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

export const DoodlePerson: React.FC<{ width?: number; height?: number; color?: string }> = ({
  width = 120,
  height = 140,
  color = 'var(--ink-primary)',
}) => (
  <svg width={width} height={height} viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Hand-drawn head */}
    <circle cx="60" cy="35" r="20" stroke={color} strokeWidth="3" strokeDasharray="100" fill="none" />
    {/* Eyes and smile */}
    <circle cx="53" cy="32" r="2.5" fill={color} />
    <circle cx="67" cy="32" r="2.5" fill={color} />
    <path d="M53 42 C56 46, 64 46, 67 42" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Body stick/torso */}
    <path d="M60 55 C59 75, 61 95, 60 115" stroke={color} strokeWidth="3.5" strokeLinecap="round" />
    {/* Arms raised reaching for memory stars */}
    <path d="M60 70 C45 60, 30 50, 22 38" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M60 70 C75 60, 90 50, 98 38" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Legs standing on ground */}
    <path d="M60 115 C50 125, 42 135, 38 138" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M60 115 C70 125, 78 135, 82 138" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const DoodlePlant: React.FC<{ size?: number; color?: string }> = ({
  size = 64,
  color = 'var(--ink-sage)',
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Potted Plant base */}
    <path d="M20 44 L24 58 L40 58 L44 44 Z" stroke="var(--ink-primary)" strokeWidth="2.5" fill="var(--paper-cream-alt)" />
    <path d="M18 44 L46 44" stroke="var(--ink-primary)" strokeWidth="3" strokeLinecap="round" />
    {/* Leaves */}
    <path d="M32 44 Q32 24 20 16 Q30 26 32 44 Z" fill={color} stroke="var(--ink-primary)" strokeWidth="2" />
    <path d="M32 44 Q34 20 46 14 Q38 26 32 44 Z" fill={color} stroke="var(--ink-primary)" strokeWidth="2" />
    <path d="M32 36 Q18 30 12 36 Q22 38 32 36 Z" fill={color} stroke="var(--ink-primary)" strokeWidth="1.5" />
    <path d="M32 36 Q46 30 52 36 Q42 38 32 36 Z" fill={color} stroke="var(--ink-primary)" strokeWidth="1.5" />
  </svg>
);

export const DoodleCamera: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = 'var(--ink-primary)',
}) => (
  <svg width={size} height={size} viewBox="0 0 60 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Polaroid style camera outline */}
    <rect x="5" y="10" width="50" height="36" rx="4" stroke={color} strokeWidth="3" fill="var(--paper-cream-alt)" />
    <path d="M20 10 L24 4 L36 4 L40 10 Z" stroke={color} strokeWidth="2.5" fill="var(--paper-cream-dark)" />
    {/* Lens */}
    <circle cx="30" cy="28" r="11" stroke={color} strokeWidth="3" fill="var(--paper-cream)" />
    <circle cx="30" cy="28" r="5" stroke="var(--ink-terracotta)" strokeWidth="2" fill="var(--ink-terracotta)" fillOpacity="0.2" />
    {/* Viewfinder & Flash */}
    <rect x="42" y="14" width="8" height="6" rx="1" stroke={color} strokeWidth="2" fill="var(--ink-amber)" />
  </svg>
);

export const DoodleMic: React.FC<{ size?: number; color?: string }> = ({
  size = 48,
  color = 'var(--ink-primary)',
}) => (
  <svg width={size} height={size} viewBox="0 0 50 60" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Microphone Capsule */}
    <rect x="18" y="6" width="14" height="24" rx="7" stroke={color} strokeWidth="3" fill="var(--paper-cream-alt)" />
    {/* Mesh lines */}
    <path d="M18 14 L32 14 M18 20 L32 20" stroke={color} strokeWidth="1.5" />
    {/* Stand U-shape */}
    <path d="M11 22 C11 36, 39 36, 39 22" stroke={color} strokeWidth="3" strokeLinecap="round" />
    {/* Stem & Base */}
    <path d="M25 35 L25 50" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <path d="M15 50 L35 50" stroke={color} strokeWidth="3" strokeLinecap="round" />
  </svg>
);

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
