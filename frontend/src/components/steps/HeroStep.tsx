import React, { useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import StoryScrollSection from '../ui/StoryScrollSection';

export interface HeroStepProps {
  onGetStarted: () => void;
  prompt?: string;
  onPromptChange?: (prompt: string) => void;
  onSelectPromptFlow?: () => void;
  onSelectCustomMediaFlow?: () => void;
}

const HEADLINE_WORDS = [
  { text: 'Turn', italic: false },
  { text: 'your', italic: false },
  { text: 'ideas', italic: false },
  { text: 'into', italic: false },
  { text: 'a', italic: false },
  { text: 'quiet,', italic: false },
  { text: 'living', italic: true },
  { text: 'video', italic: false },
  { text: 'memory.', italic: false },
];

export const HeroStep: React.FC<HeroStepProps> = ({ onGetStarted }) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [btnOffset, setBtnOffset] = useState({ x: 0, y: 0 });

  // Focus heading for accessibility on entrance
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

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
      <StoryScrollSection
        as="header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'clamp(14px, 2dvh, 24px)',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
          position: 'relative',
          zIndex: 1,
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
                }}
              >
                {item.text}
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
      </StoryScrollSection>

      {/* Single "Get started" button with magnetic hover & shine sweep */}
      <StoryScrollSection
        as="div"
        delay={0.15}
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
      </StoryScrollSection>
    </div>
  );
};

export default HeroStep;
