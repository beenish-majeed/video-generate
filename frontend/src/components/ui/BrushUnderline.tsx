import React from 'react';

export interface BrushUnderlineProps {
  color?: string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const BrushUnderline: React.FC<BrushUnderlineProps> = ({
  color = 'var(--blob-peach, #FFC9B5)',
  height = '12px',
  className = '',
  style = {},
}) => {
  return (
    <svg
      className={`brush-underline ${className}`.trim()}
      viewBox="0 0 200 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-3%',
        bottom: '-2px',
        width: '106%',
        height,
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
    >
      {/* Base gouache wash */}
      <path
        d="M2 11 C 30 7, 70 13, 110 9 C 145 6, 175 12, 198 8 C 190 13, 150 15, 105 13 C 65 11, 30 15, 2 11 Z"
        fill={color}
        opacity={0.82}
      />
      {/* Painterly brush accent edge */}
      <path
        d="M10 13 C 45 10, 85 14, 130 11 C 160 9, 185 12, 194 10 C 160 14, 110 15, 55 14 C 30 13.5, 18 14, 10 13 Z"
        fill={color}
        opacity={0.45}
      />
    </svg>
  );
};

export default BrushUnderline;
