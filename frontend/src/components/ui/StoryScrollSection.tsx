import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface StoryScrollSectionProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode;
  delay?: number;
  threshold?: number;
  className?: string;
  style?: React.CSSProperties;
  as?: 'section' | 'div' | 'article' | 'header' | 'footer' | 'aside';
}

export const StoryScrollSection: React.FC<StoryScrollSectionProps> = ({
  children,
  delay = 0,
  threshold = 0.15,
  className = '',
  style = {},
  as = 'section',
  ...restProps
}) => {
  const shouldReduceMotion = useReducedMotion();

  const MotionComponent = as === 'div'
    ? motion.div
    : as === 'article'
    ? motion.article
    : as === 'header'
    ? motion.header
    : as === 'footer'
    ? motion.footer
    : as === 'aside'
    ? motion.aside
    : motion.section;

  return (
    <MotionComponent
      initial={{
        opacity: shouldReduceMotion ? 1 : 0,
        y: shouldReduceMotion ? 0 : 20,
      }}
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once: true,
        amount: threshold,
      }}
      transition={{
        duration: shouldReduceMotion ? 0.01 : 0.48,
        delay: shouldReduceMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
      style={{
        ...style,
        willChange: shouldReduceMotion ? 'auto' : 'transform, opacity',
      }}
      {...(restProps as any)}
    >
      {children}
    </MotionComponent>
  );
};

export default StoryScrollSection;
