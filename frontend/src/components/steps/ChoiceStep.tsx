import React, { useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Sparkles, Image, User, Film } from 'lucide-react';
import StoryScrollSection from '../ui/StoryScrollSection';

export const ENABLE_PROMPT_PATH = true;
// Configuration flag: hide extended modes (Talking Face and AI Scene Clips) by default while preserving their implementation
export const SHOW_EXTENDED_MODES = false;

export interface ChoiceStepProps {
  onSelectPromptFlow: () => void;
  onSelectImagesAudioFlow: () => void;
  onSelectCustomMediaFlow: () => void;
  onSelectAiClipsFlow?: () => void;
  onBack: () => void;
}

interface CardConfig {
  id: 'prompt' | 'images_audio' | 'custom_media' | 'ai_clips';
  title: string;
  description: string;
  icon: 'sparkles' | 'image' | 'user' | 'film';
  badge: string;
  onSelect: () => void;
  isPrimary?: boolean;
}

export const ChoiceStep: React.FC<ChoiceStepProps> = ({
  onSelectPromptFlow,
  onSelectImagesAudioFlow,
  onSelectCustomMediaFlow,
  onSelectAiClipsFlow,
  onBack,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const handleCardClick = (id: string, callback: () => void) => {
    if (selectedId) return; // Prevent double trigger
    setSelectedId(id);
    if (shouldReduceMotion) {
      callback();
    } else {
      setTimeout(() => {
        callback();
      }, 220);
    }
  };

  const primaryCards: CardConfig[] = [
    {
      id: 'prompt',
      title: 'Text to video',
      description: 'Turn your written script into an animated film.',
      icon: 'sparkles',
      badge: 'Text',
      onSelect: onSelectPromptFlow,
      isPrimary: true,
    },
    {
      id: 'custom_media',
      title: 'Picture to video',
      description: 'Bring your photograph to life with speech and motion.',
      icon: 'image',
      badge: 'Picture',
      onSelect: onSelectCustomMediaFlow,
      isPrimary: false,
    },
  ];

  const extendedCards: CardConfig[] = [
    {
      id: 'images_audio',
      title: 'Use my photos and voice',
      description: 'Upload photos with custom timing and your voice recording.',
      icon: 'image',
      badge: 'Memories',
      onSelect: onSelectImagesAudioFlow,
    },
    {
      id: 'ai_clips',
      title: 'AI scene clips',
      description: 'Export structured scene prompts and assemble rendered clips.',
      icon: 'film',
      badge: 'Diffusion Clips',
      onSelect: onSelectAiClipsFlow || onSelectPromptFlow,
    },
  ];

  const cards: CardConfig[] = SHOW_EXTENDED_MODES
    ? [...primaryCards, ...extendedCards]
    : primaryCards;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.09,
        delayChildren: shouldReduceMotion ? 0 : 0.05,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 20, scale: shouldReduceMotion ? 1 : 0.98 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.45,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  };

  return (
    <div
      className="step-container"
      style={{
        padding: 'clamp(16px, 2.5dvh, 32px) 0',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(16px, 2dvh, 28px)',
        position: 'relative',
        maxWidth: 'min(980px, 100%)',
        margin: 'auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Top Navigation Row: Back Button */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <button
          type="button"
          onClick={onBack}
          className="btn-secondary"
          aria-label="Back to welcome page"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
          <span className="kbd-hint" title="Keyboard shortcut: Esc">Esc</span>
        </button>
      </div>

      {/* Header Section with Small Introductory Label */}
      <StoryScrollSection
        as="header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            color: 'var(--teal-primary)',
            fontSize: '12px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Creation Mode
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{
            fontSize: 'clamp(22px, 2.2vw, 30px)',
            margin: 0,
            outline: 'none',
            fontWeight: 500,
            color: 'var(--text-primary)',
          }}
        >
          Choose how to create your video
        </h1>
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: 'clamp(14px, 1vw, 16px)',
          }}
        >
          Select your preferred starting format to begin.
        </p>
      </StoryScrollSection>

      {/* Choice Cards: Exactly two compact, balanced, centered cards */}
      <StoryScrollSection delay={0.08}>
        <motion.div
          className="choice-cards-grid"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            maxWidth: '680px',
            margin: '0 auto',
            gap: 'clamp(16px, 2vw, 24px)',
            alignItems: 'stretch',
            width: '100%',
          }}
        >
          {cards.map((card) => (
            <ChoiceCardItem
              key={card.id}
              card={card}
              variants={cardVariants}
              isSelected={selectedId === card.id}
              shouldReduceMotion={shouldReduceMotion}
              onClick={() => handleCardClick(card.id, card.onSelect)}
            />
          ))}
        </motion.div>
      </StoryScrollSection>
    </div>
  );
};

interface ChoiceCardItemProps {
  card: CardConfig;
  variants: any;
  isSelected: boolean;
  shouldReduceMotion: boolean | null;
  onClick: () => void;
}

const ChoiceCardItem: React.FC<ChoiceCardItemProps> = ({
  card,
  variants,
  isSelected,
  shouldReduceMotion,
  onClick,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (shouldReduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      variants={variants}
      whileHover={shouldReduceMotion ? {} : { y: -6 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={`card ${isSelected ? 'card-selected' : ''}`}
      style={{
        padding: 'clamp(20px, 2.5vw, 28px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '20px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        background: 'var(--glass)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-card)',
        boxShadow: isHovered ? 'var(--shadow-card-hover)' : 'var(--shadow-card)',
        transform: isSelected ? 'scale(0.985)' : undefined,
      }}
    >
      {/* Soft Cursor Spotlight Effect Across Glass */}
      {!shouldReduceMotion && isHovered && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, rgba(0, 128, 128, 0.08), transparent 70%)`,
            zIndex: 1,
          }}
        />
      )}

      {/* Ripple Animation on Selection */}
      {isSelected && (
        <motion.div
          aria-hidden="true"
          initial={{ scale: 0, opacity: 0.6 }}
          animate={{ scale: 3, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: '120px',
            height: '120px',
            marginTop: '-60px',
            marginLeft: '-60px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 128, 128, 0.35) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'relative', zIndex: 2 }}>
        {/* Card Icon with Animated Loop on Hover */}
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: card.isPrimary ? 'var(--teal-subtle)' : 'var(--beige-surface)',
            border: '1px solid var(--teal-border)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {card.icon === 'sparkles' && (
            <motion.div
              animate={!shouldReduceMotion && isHovered ? { rotate: [0, 18, -12, 0], scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              style={{ display: 'flex' }}
            >
              <Sparkles size={22} />
            </motion.div>
          )}

          {card.icon === 'image' && (
            <motion.div
              animate={!shouldReduceMotion && isHovered ? { rotateY: [0, 180, 360] } : {}}
              transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
              style={{ display: 'flex', transformStyle: 'preserve-3d' }}
            >
              <Image size={22} />
            </motion.div>
          )}

          {card.icon === 'user' && (
            <motion.div
              animate={!shouldReduceMotion && isHovered ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              style={{ display: 'flex' }}
            >
              <User size={22} />
            </motion.div>
          )}

          {card.icon === 'film' && (
            <motion.div
              animate={!shouldReduceMotion && isHovered ? { scale: [1, 1.14, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              style={{ display: 'flex' }}
            >
              <Film size={22} />
            </motion.div>
          )}
        </div>

        <h2 style={{ fontSize: 'clamp(19px, 1.4vw, 22px)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          {card.title}
        </h2>
        <p style={{ fontSize: '14.5px', color: 'var(--text-muted)', lineHeight: 1.55, margin: 0 }}>
          {card.description}
        </p>
      </div>

      <div style={{ marginTop: 'auto', position: 'relative', zIndex: 2 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className={card.isPrimary ? 'btn-primary' : 'btn-secondary'}
          style={{ width: '100%' }}
        >
          <span>{card.title}</span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
};

export default ChoiceStep;
