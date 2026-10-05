import React from 'react';

interface TapeProps {
  rotation?: string;
  width?: string;
  height?: string;
  className?: string;
  color?: string;
  style?: React.CSSProperties;
}

export const Tape: React.FC<TapeProps> = ({
  rotation = '-3deg',
  width = '110px',
  height = '28px',
  className = '',
  color = 'rgba(235, 222, 195, 0.72)',
  style = {},
}) => {
  return (
    <div
      className={`tape-strip ${className}`}
      style={{
        width,
        height,
        backgroundColor: color,
        transform: `rotate(${rotation})`,
        boxShadow: 'var(--shadow-tape)',
        backdropFilter: 'blur(2px)',
        borderLeft: '2px dashed rgba(180, 160, 130, 0.4)',
        borderRight: '2px dashed rgba(180, 160, 130, 0.4)',
        borderTop: '1px solid rgba(255, 255, 255, 0.5)',
        borderBottom: '1px solid rgba(200, 180, 150, 0.3)',
        borderRadius: '2px',
        zIndex: 10,
        ...style,
      }}
    />
  );
};

export default Tape;
