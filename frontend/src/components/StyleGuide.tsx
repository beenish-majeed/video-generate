import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, Info, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';

interface StyleGuideProps {
  onClose?: () => void;
}

export const StyleGuide: React.FC<StyleGuideProps> = ({ onClose }) => {
  const [activeChip, setActiveChip] = useState<'all' | 'cinematic' | 'nostalgic' | 'dreamy'>('cinematic');
  const [textValue, setTextValue] = useState('Golden sunlight filtering through the mountain pines at dawn.');
  const [showTooltip, setShowTooltip] = useState(false);

  const colorTokens = [
    { name: '--bg', hex: '#F6F1FF', desc: 'Airy Pastel Base', role: 'Main Page Canvas' },
    { name: '--blob-lavender', hex: '#CDB8FF', desc: 'Soft Lavender Blob', role: 'Background Drift' },
    { name: '--blob-peach', hex: '#FFC9B5', desc: 'Warm Peach Blob', role: 'Background Drift' },
    { name: '--blob-sky', hex: '#B9DDFF', desc: 'Airy Sky Blob', role: 'Background Drift' },
    { name: '--blob-pink', hex: '#FFD3E8', desc: 'Soft Rose Blob', role: 'Accent Drift' },
    { name: '--glass', hex: 'rgba(255,255,255,0.6)', desc: 'Frosted Glass Surface', role: 'Cards & Panels' },
    { name: '--glass-border', hex: 'rgba(255,255,255,0.85)', desc: 'Subtle Glass Border', role: 'Card Outlines' },
    { name: '--text', hex: '#241F3A', desc: 'Deep Violet Navy', role: 'Primary Text (14.2:1 AA)' },
    { name: '--text-muted', hex: '#5E587A', desc: 'Muted Lavender Slate', role: 'Secondary Text (5.95:1 AA)' },
    { name: '--accent', hex: '#6C4DFF', desc: 'Vibrant Violet Accent', role: 'Primary CTA & Focus' },
    { name: '--accent-2', hex: '#B28CFF', desc: 'Lilac Gradient Stop', role: 'Gradient Accent' },
  ];

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100dvh',
        padding: 'clamp(24px, 4vw, 48px) clamp(16px, 4vw, 48px)',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        zIndex: 2,
      }}
    >
      <div style={{ width: '100%', maxWidth: '1280px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        
        {/* Style Guide Header */}
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            alignItems: 'center',
            textAlign: 'center',
            paddingBottom: '24px',
            borderBottom: '1px solid rgba(205, 184, 255, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between', width: '100%' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--glass)',
                border: '1px solid var(--glass-border)',
                boxShadow: 'var(--shadow-sm)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--accent)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <Sparkles size={14} />
              Memory Studio • Design System
            </div>

            {onClose && (
              <button
                onClick={onClose}
                className="btn-secondary"
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                  minHeight: '38px',
                }}
              >
                Exit Style Guide
              </button>
            )}
          </div>

          <h1 className="heading-hero" style={{ margin: 0, maxWidth: '840px', textWrap: 'balance' }}>
            Light, ethereal <span className="accent-italic">dreamy pastel</span> design system.
          </h1>

          <p className="page-lead" style={{ margin: 0, maxWidth: '640px' }}>
            Soft, airy, grainy aesthetics crafted for serene video creation. Built with local serif typography, frosted light glass, and soft lavender-tinted glows.
          </p>
        </header>

        {/* Section 1: Color Tokens */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 className="editorial-title" style={{ margin: 0 }}>
              Color <span className="accent-italic">Tokens</span>
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Airy pastel canvas, gradient drifting blobs, translucent frosted glass, and WCAG AA verified typography.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              width: '100%',
            }}
          >
            {colorTokens.map((token) => (
              <div
                key={token.name}
                style={{
                  background: 'var(--glass)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-card)',
                  padding: '16px',
                  boxShadow: 'var(--shadow-card)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '100%',
                    height: '64px',
                    borderRadius: '16px',
                    background: token.name === '--glass' ? 'rgba(255,255,255,0.6)' : token.hex,
                    border: '1px solid rgba(108, 77, 255, 0.15)',
                    boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.8), var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {token.name === '--glass' && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      60% Frosted
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                    {token.name}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)' }}>
                    {token.hex}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {token.role}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Status Alert Pastel Tokens */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '16px',
              marginTop: '8px',
            }}
          >
            <div
              style={{
                background: 'var(--accent-success-bg)',
                border: '1px solid rgba(27, 110, 68, 0.2)',
                borderRadius: 'var(--radius-card)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--accent-success)',
              }}
            >
              <CheckCircle2 size={20} />
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Success Pastel (#1B6E44 on #D1F4E0)</strong>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>Passes WCAG AA (5.5:1 contrast)</span>
              </div>
            </div>

            <div
              style={{
                background: 'var(--accent-danger-bg)',
                border: '1px solid rgba(184, 40, 70, 0.2)',
                borderRadius: 'var(--radius-card)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--accent-danger)',
              }}
            >
              <AlertCircle size={20} />
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Danger Pastel (#B82846 on #FFE4E8)</strong>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>Passes WCAG AA (5.2:1 contrast)</span>
              </div>
            </div>

            <div
              style={{
                background: 'var(--accent-warning-bg)',
                border: '1px solid rgba(138, 82, 0, 0.2)',
                borderRadius: 'var(--radius-card)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--accent-warning)',
              }}
            >
              <Info size={20} />
              <div>
                <strong style={{ fontSize: '14px', display: 'block' }}>Warning Pastel (#8A5200 on #FFF0D4)</strong>
                <span style={{ fontSize: '12px', opacity: 0.9 }}>Passes WCAG AA (5.8:1 contrast)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Typography Specimens */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 className="editorial-title" style={{ margin: 0 }}>
              Typography <span className="accent-italic">Hierarchy</span>
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Self-hosted elegant serif with gradient italic emphasis paired with clean UI sans.
            </p>
          </div>

          <div
            style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-card)',
              padding: 'clamp(20px, 3vw, 36px)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Hero Display Headline (--text-hero, serif + gradient italic)
              </span>
              <h1 className="heading-hero" style={{ margin: '8px 0 0' }}>
                Every memory deserves a <span className="accent-italic">timeless</span> voice.
              </h1>
            </div>

            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Page Title (--text-title, editorial-title)
              </span>
              <h2 className="editorial-title" style={{ margin: '8px 0 0' }}>
                Choose your <span className="accent-italic">creative</span> pathway.
              </h2>
            </div>

            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Section Heading (--text-heading)
              </span>
              <h3 style={{ margin: '8px 0 0', fontSize: 'var(--text-heading)', fontWeight: 600, color: 'var(--text)' }}>
                Fine-tune pacing, tone, and visual narration.
              </h3>
            </div>

            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>
                Body Lead & UI Text (--text-body, sans)
              </span>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-body)', lineHeight: 'var(--leading-normal)', color: 'var(--text-secondary)' }}>
                Craft heartfelt narrative scripts automatically tailored to your target duration. Every word is timed and rendered with synchronized vocal cadence.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Shared Button Set */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 className="editorial-title" style={{ margin: 0 }}>
              Button <span className="accent-italic">Set</span>
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Unified button design across all pages: Primary (accent gradient + glow), Secondary (glass with accent border), and Ghost.
            </p>
          </div>

          <div
            style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-card)',
              padding: 'clamp(20px, 3vw, 36px)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              alignItems: 'center',
            }}
          >
            {/* Primary Button */}
            <button
              className="btn-primary"
              style={{
                background: 'var(--accent-gradient)',
                borderRadius: 'var(--radius-pill)',
                boxShadow: 'var(--shadow-glow-accent)',
                padding: '12px 28px',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              Get Started <ArrowRight size={18} />
            </button>

            {/* Secondary Button */}
            <button
              className="btn-secondary"
              style={{
                background: 'var(--glass)',
                border: '1px solid var(--accent-2)',
                color: 'var(--accent)',
                borderRadius: 'var(--radius-pill)',
                padding: '12px 26px',
                fontSize: '15px',
                fontWeight: 600,
              }}
            >
              Secondary Action
            </button>

            {/* Ghost Button */}
            <button
              className="btn-ghost"
              style={{
                borderRadius: 'var(--radius-pill)',
                padding: '12px 22px',
                fontSize: '15px',
                fontWeight: 500,
              }}
            >
              Back to Choice
            </button>

            {/* Disabled Button */}
            <button
              disabled
              className="btn-primary"
              style={{
                background: 'var(--accent-gradient)',
                borderRadius: 'var(--radius-pill)',
                padding: '12px 28px',
                fontSize: '15px',
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
            >
              Disabled Action
            </button>
          </div>
        </section>

        {/* Section 4: Frosted Glass Cards */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 className="editorial-title" style={{ margin: 0 }}>
              Frosted Glass <span className="accent-italic">Cards</span>
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              24px border radius, 18px backdrop blur, soft lavender glow shadow, and interactive hover response.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
              width: '100%',
            }}
          >
            {/* Standard Glass Card */}
            <motion.div
              whileHover={{ y: -4, boxShadow: 'var(--shadow-card-hover)' }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background: 'var(--glass)',
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-card)',
                padding: '28px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(205, 184, 255, 0.4) 0%, rgba(255, 201, 181, 0.4) 100%)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                }}
              >
                <Sparkles size={22} />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
                  Interactive Option Card
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  Hover lifts card gently by 4px and intensifies the lavender glow shadow with buttery 60fps easing.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)', fontWeight: 600, fontSize: '14px', marginTop: 'auto' }}>
                Explore Pathway <ChevronRight size={16} />
              </div>
            </motion.div>

            {/* Fallback Glass Card */}
            <div
              style={{
                background: 'var(--glass-fallback)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-card)',
                padding: '28px',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(185, 221, 255, 0.4) 0%, rgba(255, 211, 232, 0.4) 100%)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                }}
              >
                <CheckCircle2 size={22} />
              </div>

              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '20px', fontWeight: 600, color: 'var(--text)' }}>
                  Solid Fallback Card (85% White)
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  High-contrast solid opacity fallback ensures legibility on devices or browsers without backdrop filter support.
                </p>
              </div>

              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginTop: 'auto' }}>
                Fallback specification: rgba(255, 255, 255, 0.85)
              </span>
            </div>
          </div>
        </section>

        {/* Section 5: Inputs, Chips, Tooltips & Error Banners */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <h2 className="editorial-title" style={{ margin: 0 }}>
              Form Controls & <span className="accent-italic">Interactive</span> Elements
            </h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Light glass input fields, readable textarea, chips, tooltips, and soft error banners.
            </p>
          </div>

          <div
            style={{
              background: 'var(--glass)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-card)',
              padding: 'clamp(20px, 3vw, 36px)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* Filter Chips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                Filter & Mode Chips (--radius-pill)
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {(['all', 'cinematic', 'nostalgic', 'dreamy'] as const).map((chip) => {
                  const isActive = activeChip === chip;
                  return (
                    <button
                      key={chip}
                      onClick={() => setActiveChip(chip)}
                      style={{
                        padding: '8px 18px',
                        borderRadius: 'var(--radius-pill)',
                        border: isActive ? '1px solid var(--accent)' : '1px solid var(--glass-border)',
                        background: isActive ? 'var(--accent-gradient)' : 'rgba(255, 255, 255, 0.7)',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: isActive ? 'var(--shadow-glow-accent)' : 'var(--shadow-sm)',
                        transition: 'all 0.2s ease',
                        textTransform: 'capitalize',
                      }}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input & Script Textarea */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label htmlFor="styleguide-input" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                    Video Concept / Idea Prompt
                  </label>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      aria-label="More information about concept prompt"
                      onClick={() => setShowTooltip(!showTooltip)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <Info size={16} />
                    </button>
                    {showTooltip && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '100%',
                          right: 0,
                          marginBottom: '8px',
                          background: 'rgba(36, 31, 58, 0.95)',
                          color: '#ffffff',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          width: '200px',
                          boxShadow: 'var(--shadow-dropdown)',
                          zIndex: 10,
                        }}
                      >
                        Keep prompts concise with mood, lighting, and camera angle.
                      </div>
                    )}
                  </div>
                </div>

                <input
                  id="styleguide-input"
                  type="text"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(255, 255, 255, 0.75)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="styleguide-script" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                  Narrative Script Textarea (High Readability)
                </label>
                <textarea
                  id="styleguide-script"
                  rows={3}
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'rgba(255, 255, 255, 0.75)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    fontFamily: 'var(--font-sans)',
                    outline: 'none',
                    boxSizing: 'border-box',
                    resize: 'none',
                  }}
                />
              </div>
            </div>

            {/* Pastel Error Banner */}
            <div
              style={{
                background: 'var(--accent-danger-bg)',
                border: '1px solid rgba(184, 40, 70, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: 'var(--accent-danger)',
              }}
            >
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                <strong style={{ display: 'block', fontWeight: 600 }}>Audio duration exceeds preset limit</strong>
                Audio sample exceeds 30.0s for this preset. You may choose a longer preset or trim the file.
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>Synthesizing Voice & Lip Sync</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>75%</span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: '8px',
                  borderRadius: 'var(--radius-pill)',
                  background: 'rgba(205, 184, 255, 0.3)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: '75%',
                    height: '100%',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--accent-gradient)',
                    boxShadow: 'var(--shadow-glow-accent)',
                  }}
                />
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default StyleGuide;
