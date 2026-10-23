import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BACKGROUND_IMAGE_URL } from '../../config/background';

interface PaintedLandscapeProps {
  isBrightened?: boolean;
}

export const PaintedLandscape: React.FC<PaintedLandscapeProps> = ({ isBrightened = false }) => {
  const shouldReduceMotion = useReducedMotion();
  const [isVisible, setIsVisible] = useState(true);

  // Tab-Aware Pause: Freeze animation when tab is inactive to save battery & GPU
  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const enableMotion = !shouldReduceMotion && isVisible;

  // Custom user-supplied painting fallback
  if (BACKGROUND_IMAGE_URL && BACKGROUND_IMAGE_URL.trim() !== '') {
    return (
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100dvh',
          zIndex: 0,
          pointerEvents: 'none',
          backgroundImage: `url(${BACKGROUND_IMAGE_URL})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Soft semi-transparent readability overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: isBrightened ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 255, 255, 0.22)',
            backdropFilter: 'blur(2px)',
          }}
        />
      </div>
    );
  }

  // Procedural Oil / Gouache Painted Landscape
  return (
    <div
      aria-hidden="true"
      className="painted-landscape-container"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundColor: '#eef5fb',
      }}
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      >
        <defs>
          {/* Hand-Painted Edge Wobble Filter (feTurbulence + feDisplacementMap) */}
          <filter id="brush-wobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.038" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="7.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Soft Blur for Gouache Clouds */}
          <filter id="cloud-soften" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="18" />
          </filter>

          {/* Sky Gradient (Blue to Atmospheric Warm White) */}
          <linearGradient id="sky-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isBrightened ? '#95C6EF' : '#7FAFE0'} />
            <stop offset="38%" stopColor={isBrightened ? '#C0DCF5' : '#ADD0EE'} />
            <stop offset="72%" stopColor={isBrightened ? '#E5F1FC' : '#D6E7F8'} />
            <stop offset="100%" stopColor={isBrightened ? '#FFFFFF' : '#F4F8FC'} />
          </linearGradient>

          {/* Far Hills Gradient (Atmospheric Misty Cyan-Blue) */}
          <linearGradient id="far-hills-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#98BACB" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#BCD5E0" stopOpacity="0.9" />
          </linearGradient>

          {/* Mid Hills Gradient (Hazy Mountain Teal) */}
          <linearGradient id="mid-hills-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6797A2" />
            <stop offset="100%" stopColor="#81ACAF" />
          </linearGradient>

          {/* Near Hills Gradient (Deep Atmospheric Pine Green) */}
          <linearGradient id="near-hills-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#43767B" />
            <stop offset="100%" stopColor="#55898A" />
          </linearGradient>

          {/* Foreground Meadow Gradient (Warm Yellow, Peach, Pink strokes) */}
          <linearGradient id="meadow-base" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F9DF98" />
            <stop offset="45%" stopColor="#F8BA96" />
            <stop offset="85%" stopColor="#EDA5B9" />
            <stop offset="100%" stopColor="#E59BB3" />
          </linearGradient>

          {/* Subtle Canvas Grain Filter */}
          <filter id="canvas-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="grain" />
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.04 0" />
          </filter>
        </defs>

        {/* 1. SKY BASE WITH SLOW LIGHT SHIMMER */}
        <motion.rect
          x="0"
          y="0"
          width="1440"
          height="900"
          fill="url(#sky-gradient)"
          animate={enableMotion ? { opacity: [0.94, 1, 0.94] } : { opacity: 1 }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* 2. SOFT CLOUDS (Atmospheric Gouache Swells) */}
        <motion.g
          filter="url(#cloud-soften)"
          opacity="0.58"
          animate={enableMotion ? { x: [-22, 28, -22] } : { x: 0 }}
          transition={{ duration: 42, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Cloud Formation Left */}
          <path
            d="M 120 180 C 180 120, 320 125, 380 170 C 440 140, 560 150, 600 210 C 640 270, 520 330, 420 320 C 310 335, 170 310, 110 260 Z"
            fill="#FFFFFF"
          />
          {/* Cloud Formation Center-Right */}
          <path
            d="M 760 140 C 820 90, 960 95, 1020 135 C 1090 110, 1220 125, 1260 180 C 1300 240, 1190 290, 1100 280 C 990 295, 840 270, 750 220 Z"
            fill="#FFFFFF"
          />
          {/* Low Horizon Haze Cloud */}
          <ellipse cx="680" cy="340" rx="420" ry="85" fill="#FFFFFF" opacity="0.45" />
        </motion.g>

        {/* 3. FAR HILLS (Layer 1 - Misty Cyan-Blue Atmospheric Depth) */}
        <motion.g
          filter="url(#brush-wobble)"
          animate={enableMotion ? { x: [-8, 10, -8] } : { x: 0 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path
            d="M -40 430 Q 180 375, 420 415 T 880 395 T 1320 420 Q 1420 425, 1480 440 L 1480 900 L -40 900 Z"
            fill="url(#far-hills-grad)"
          />
        </motion.g>

        {/* 4. MID HILLS (Layer 2 - Hazy Mountain Teal Silhouette) */}
        <motion.g
          filter="url(#brush-wobble)"
          animate={enableMotion ? { x: [10, -12, 10] } : { x: 0 }}
          transition={{ duration: 48, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path
            d="M -40 495 Q 160 450, 360 480 T 780 460 T 1160 475 Q 1340 460, 1480 490 L 1480 900 L -40 900 Z"
            fill="url(#mid-hills-grad)"
          />
        </motion.g>

        {/* 5. NEAR HILLS (Layer 3 - Deep Atmospheric Pine/Sage Ridge) */}
        <motion.g
          filter="url(#brush-wobble)"
          animate={enableMotion ? { x: [-7, 9, -7] } : { x: 0 }}
          transition={{ duration: 38, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path
            d="M -40 565 Q 120 535, 290 550 T 680 525 T 1060 545 Q 1280 530, 1480 560 L 1480 900 L -40 900 Z"
            fill="url(#near-hills-grad)"
          />
        </motion.g>

        {/* 6. WARM GLOWING FOREGROUND FIELD (Yellow, Peach, Pink Strokes) */}
        <motion.g
          filter="url(#brush-wobble)"
          animate={enableMotion ? { x: [4, -5, 4] } : { x: 0 }}
          transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Main Rolling Field Ground */}
          <path
            d="M -40 640 Q 210 610, 480 635 T 980 615 Q 1240 600, 1480 625 L 1480 900 L -40 900 Z"
            fill="url(#meadow-base)"
          />

          {/* Painterly Elongated Brush-Stroke Streaks */}
          {/* Golden Yellow Sunlit Strokes */}
          <path
            d="M 60 670 Q 240 655, 420 675 Q 380 690, 200 685 Z"
            fill="#FEE7A6"
            opacity="0.8"
          />
          <path
            d="M 720 650 Q 940 635, 1140 655 Q 1060 670, 840 665 Z"
            fill="#FFEBB0"
            opacity="0.75"
          />
          <path
            d="M 320 730 Q 560 710, 820 735 Q 740 755, 460 750 Z"
            fill="#FEDE8B"
            opacity="0.7"
          />

          {/* Warm Peach Strokes */}
          <path
            d="M -20 720 Q 180 705, 360 725 Q 260 745, 80 740 Z"
            fill="#FFAA82"
            opacity="0.65"
          />
          <path
            d="M 520 700 Q 780 685, 1020 710 Q 920 730, 640 725 Z"
            fill="#FFB992"
            opacity="0.68"
          />
          <path
            d="M 880 725 Q 1120 705, 1380 730 Q 1260 750, 1000 745 Z"
            fill="#FFAE88"
            opacity="0.62"
          />

          {/* Dusky Warm Rose / Pink Strokes */}
          <path
            d="M 140 780 Q 420 760, 720 785 Q 600 810, 280 805 Z"
            fill="#F69BB3"
            opacity="0.6"
          />
          <path
            d="M 660 770 Q 960 750, 1260 780 Q 1120 805, 780 800 Z"
            fill="#ED8FA9"
            opacity="0.55"
          />
          <path
            d="M -20 830 Q 320 810, 680 835 Q 520 865, 120 860 Z"
            fill="#E98AA4"
            opacity="0.5"
          />
          <path
            d="M 620 820 Q 980 800, 1380 830 Q 1200 865, 740 855 Z"
            fill="#E47E99"
            opacity="0.52"
          />

          {/* Cream Highlights along Ridgeline */}
          <path
            d="M 440 645 Q 680 635, 880 648 Q 800 656, 520 655 Z"
            fill="#FFF8EC"
            opacity="0.55"
          />
        </motion.g>

        {/* 7. SUBTLE CANVAS PAPER TEXTURE OVERLAY */}
        <rect
          x="0"
          y="0"
          width="1440"
          height="900"
          filter="url(#canvas-grain)"
          fill="#000000"
          pointerEvents="none"
        />
      </svg>
    </div>
  );
};

export default PaintedLandscape;
