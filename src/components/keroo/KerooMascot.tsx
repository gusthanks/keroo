/**
 * The image-generated animation approved by Gustavo, displayed as raster artwork.
 * Historical pose/coin inputs stay compatible with the local mood engine. They
 * never add independently drawn props over the approved illustration.
 */
import React, { useEffect, useState } from 'react';
import type { KerooPose } from '../../core/kerooMood';
import { useOptionalTranslation } from '../../i18n';
import assets from './mascot-assets.json';

export type MascotCoinProp = 'none' | 'mouth_clamp' | 'flipping' | 'hugging' | 'polishing' | 'swallowing';
export interface KerooMascotProps {
  pose?: KerooPose;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  /** Compatibility only. The coin is painted into the approved illustration. */
  coinProp?: MascotCoinProp;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

const SIZE_MAP = { xs: 32, sm: 48, md: 80, lg: 120, xl: 180 };
const PRESENTATIONS: Record<KerooPose, 'idle' | 'attentive' | 'celebrate' | 'rest' | 'playful' | 'saving'> = {
  default_sitting: 'idle',
  waterfall_tears: 'attentive',
  melted_blob: 'rest',
  toast_face: 'attentive',
  peace_dab: 'celebrate',
  sipping_drink: 'idle',
  sleeping_bubble: 'rest',
  cheeky_tongue: 'playful',
  coin_swallowing: 'saving',
  curious_head_tilt: 'attentive',
};

export const KerooMascot: React.FC<KerooMascotProps> = ({
  pose = 'default_sitting', size = 'md', animated = true,
  className = '', onClick, ariaLabel, style,
}) => {
  const { t } = useOptionalTranslation();
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size];
  const safePose = Object.prototype.hasOwnProperty.call(PRESENTATIONS, pose) ? pose : 'default_sitting';
  const presentation = PRESENTATIONS[safePose];
  const portrait = pixelSize <= 48;
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [animationFailed, setAnimationFailed] = useState(false);

  useEffect(() => {
    if (!animated || portrait) return;
    const onVisibility = () => setVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [animated, portrait]);

  const still = presentation === 'rest' ? assets.rest : assets.still;
  const playing = animated && visible && !portrait && presentation !== 'rest' && !animationFailed;
  const source = portrait ? assets.portrait : playing ? assets.idle : still;
  const portraitSources = assets.portraitSizes.map(({ src, width }) => `${src} ${width}w`).join(', ');

  return (
    <div
      role={onClick ? 'button' : 'img'}
      aria-label={ariaLabel || t(`pet.aria.${safePose}`)}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      } : undefined}
      className={`inline-flex items-center justify-center select-none relative ${onClick ? 'cursor-pointer rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand active:scale-95 motion-safe:transition-transform' : ''} ${className}`}
      style={{ width: pixelSize, height: pixelSize, ...style }}
      data-testid="keroo-mascot-container"
      data-pose={safePose}
      data-presentation={presentation}
    >
      <picture
        key={safePose}
        className={`block w-full h-full ${playing ? `keroo-motion-${presentation}` : ''}`}
        data-testid="keroo-artwork"
      >
        {playing && <source media="(prefers-reduced-motion: reduce)" type="image/png" srcSet={still} />}
        <img
          src={source}
          srcSet={portrait ? portraitSources : undefined}
          sizes={portrait ? `${pixelSize}px` : undefined}
          width={512}
          height={portrait ? 512 : 448}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
          className="block w-full h-full object-contain pointer-events-none"
          onError={playing ? () => setAnimationFailed(true) : undefined}
        />
      </picture>
    </div>
  );
};
