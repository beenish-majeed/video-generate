import React from 'react';
import HeroScene from '../HeroScene';
import Tape from '../Tape';
import Sticker from '../Sticker';
import { ArrowRight } from 'lucide-react';

interface HeroStepProps {
  onNext: () => void;
}

export const HeroStep: React.FC<HeroStepProps> = ({ onNext }) => {
  return (
    <div
      style={{
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        position: 'relative',
        maxWidth: '780px',
        margin: '0 auto',
      }}
    >
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />
      <Sticker label="MEMORY STUDIO" rotation="3deg" variant="terracotta" />

      {/* Warm Short Header Line */}
      <header style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
        <p className="handwritten" style={{ fontSize: '24px', color: 'var(--ink-terracotta)' }}>
          Welcome, traveler of memories...
        </p>
        <h1 className="editorial-title" style={{ fontSize: '34px', lineHeight: 1.2 }}>
          Turn your photo and voice into a quiet, living video memory.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '16px', lineHeight: 1.5 }}>
          Combine a single portrait with a short voice sample to craft a personal animated film.
        </p>
      </header>

      {/* Calm Illustrated Scene (Lone figure on soft green hill under warm sky) */}
      <main style={{ margin: '8px 0' }}>
        <HeroScene />
      </main>

      {/* Single Clear "Begin" Button with Keyboard Focus Support */}
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
        <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-muted)' }}>
          Ready to sketch your first scene? →
        </p>
        <button
          type="button"
          onClick={onNext}
          className="btn-terracotta"
          aria-label="Begin creating your video memory"
          style={{ fontSize: '17px', padding: '14px 32px' }}
        >
          <span>Begin</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
};

export default HeroStep;
