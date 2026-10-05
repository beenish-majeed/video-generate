import React from 'react';
import { DoodlePerson, DoodleStar, DoodleSparkle, DoodlePlant } from '../Doodles';
import Sticker from '../Sticker';
import Tape from '../Tape';
import { ArrowRight } from 'lucide-react';

interface HeroStepProps {
  onNext: () => void;
}

export const HeroStep: React.FC<HeroStepProps> = ({ onNext }) => {
  return (
    <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
      <Tape rotation="-2deg" style={{ position: 'absolute', top: '10px', left: '30px' }} />
      <Sticker label="MEMORY STUDIO #01" rotation="3deg" variant="terracotta" className="absolute top-4 right-6" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
        <p className="handwritten" style={{ fontSize: '24px' }}>
          Hello friend, welcome to your creative corner...
        </p>
        <h1 className="editorial-title" style={{ fontSize: '36px', lineHeight: 1.15 }}>
          Breathe gentle life into a treasured photo and voice.
        </h1>
        <p style={{ color: 'var(--ink-muted)', fontSize: '16px', maxWidth: '560px', lineHeight: 1.6 }}>
          Every photograph holds a quiet story waiting to be told. Together, we’ll combine your photo, a voice,
          and a narrative into a handcrafted cinematic memory.
        </p>
      </div>

      {/* Dreamy Hero Card */}
      <div
        style={{
          position: 'relative',
          padding: '24px',
          borderRadius: '12px',
          backgroundColor: 'var(--paper-cream-alt)',
          border: '1px solid var(--paper-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: '180px',
          boxShadow: 'var(--shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 2, maxWidth: '360px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DoodleSparkle size={20} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-terracotta)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Handcrafted Video Pipeline
            </span>
          </div>
          <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', color: 'var(--ink-primary)' }}>
            Turn photos into living motion pictures
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
            No complex settings—just your story, crafted frame by frame.
          </p>
        </div>

        {/* Nostalgic Figure Doodle */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', zIndex: 2 }}>
          <DoodlePlant size={56} />
          <DoodlePerson width={100} height={120} color="var(--ink-primary)" />
          <DoodleStar size={28} className="animate-pulse" />
        </div>
      </div>

      {/* Footer Call to Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <p className="handwritten" style={{ fontSize: '20px', color: 'var(--ink-muted)' }}>
          Takes less than two minutes to sketch your idea →
        </p>
        <button onClick={onNext} className="btn-terracotta">
          <span>Open Sketchbook</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};

export default HeroStep;
