import React, { useRef, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowLeft, Sparkles, Image, User } from 'lucide-react';

export const ENABLE_PROMPT_PATH = true;

export interface ChoiceStepProps {
  onSelectPromptFlow: () => void;
  onSelectImagesAudioFlow: () => void;
  onSelectCustomMediaFlow: () => void;
  onBack: () => void;
}

interface CardConfig {
  id: 'prompt' | 'images_audio' | 'custom_media';
  title: string;
  description: string;
  icon: 'sparkles' | 'image' | 'user';
  badge: string;
  onSelect: () => void;
  isPrimary?: boolean;
}

export const ChoiceStep: React.FC<ChoiceStepProps> = ({
  onSelectPromptFlow,
  onSelectImagesAudioFlow,
  onSelectCustomMediaFlow,
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

  const cards: CardConfig[] = [
    {
      id: 'prompt',
      title: 'Write an idea',
      description: 'Type an idea, pick an animated visual style, and generate scenes with gentle camera moves.',
      icon: 'sparkles',
      badge: 'AI Concept',
      onSelect: onSelectPromptFlow,
      isPrimary: true,
    },
    {
      id: 'images_audio',
      title: 'Use my photos and voice',
      description: 'Upload 1 to 30 photos with custom timing, your voice recording, and optional face lip sync.',
      icon: 'image',
      badge: 'Your Memories',
      onSelect: onSelectImagesAudioFlow,
    },
    {
      id: 'custom_media',
      title: 'A talking face',
      description: 'Bring a single portrait photo to life with synchronized facial expressions and speech.',
      icon: 'user',
      badge: 'Portrait Animator',
      onSelect: onSelectCustomMediaFlow,
    },
  ];

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
        maxWidth: 'min(1280px, 100%)',
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
        </button>
      </div>

      {/* Header Section */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="editorial-title"
          style={{ fontSize: 'clamp(26px, 2.8vw, 36px)', margin: 0, outline: 'none' }}
        >
          How would you like to begin?
        </h1>
        <p className="page-lead" style={{ margin: 0 }}>
          Choose your creative path below to begin crafting your personal film.
        </p>
      </header>

      {/* Three Choice Cards: Staggered entrance, Hover lift & Spotlight, Ripple feedback */}
      <motion.div
        className="choice-cards-grid"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
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
            background: `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.45), transparent 70%)`,
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
            background: 'radial-gradient(circle, rgba(108, 77, 255, 0.3) 0%, transparent 70%)',
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
            background: card.isPrimary
              ? 'linear-gradient(135deg, rgba(205, 184, 255, 0.4) 0%, rgba(255, 201, 181, 0.4) 100%)'
              : 'linear-gradient(135deg, rgba(185, 221, 255, 0.4) 0%, rgba(255, 211, 232, 0.4) 100%)',
            border: '1px solid var(--glass-border)',
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
