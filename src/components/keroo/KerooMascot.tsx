/**
 * src/components/keroo/KerooMascot.tsx
 *
 * Keroo, the lucky frog (Jin Chan) mascot as a flat sticker-style SVG.
 *
 * Built from a tiny "parts kit" so every pose is the same character:
 *   - Body      : ONE continuous Bézier blob whose top edge forms the two eye-bumps ("m")
 *   - Eyes      : tiny dots, or short thick arcs (happy / sleepy)
 *   - Mouth     : one thin stroke (smile, flat, ω, frown, tongue, pucker) or a big open hole
 *   - Limb      : outlined sausage (black stroke + lime stroke on the same path)
 *   - Mitten    : round hand blob; PeaceHand adds two thick fingers
 *   - Legs      : two small bumps peeking under the body
 *   - Coin      : Jin Chan coin with a square hole, plus coin-prop placements
 *   - Glyphs    : "?" and "z" drawn as paths (no <text>, fonts are not guaranteed)
 *
 * Style: flat lime fill, thick uniform near-black outline, no belly patch, no eye whites,
 * no shading, blush only on the playful poses.
 */

import React, { useId, useMemo } from 'react';
import type { KerooPose } from '../../core/kerooMood';
import { useOptionalTranslation } from '../../i18n';

export type MascotCoinProp =
  | 'none'
  | 'mouth_clamp'
  | 'flipping'
  | 'hugging'
  | 'polishing'
  | 'swallowing';

export interface KerooMascotProps {
  pose?: KerooPose;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  coinProp?: MascotCoinProp;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}

const SIZE_MAP: Record<string, number> = {
  xs: 32,
  sm: 48,
  md: 80,
  lg: 120,
  xl: 180,
};

/* ------------------------------------------------------------------------ */
/* Palette & stroke weights                                                  */
/* ------------------------------------------------------------------------ */

const COLOR = {
  body: '#86E63C',
  ink: '#1F1F1F',
  mouth: '#2B2B2B',
  pink: '#F4899A',
  water: '#3DB7F5',
  waterLight: '#9EDBFF',
  gold: '#FFD700',
  goldLight: '#FFF9C4',
  goldEdge: '#C88A00',
  toast: '#F3D9A4',
  crust: '#B9803F',
  cup: '#FFFFFF',
} as const;

/** Silhouette outline width (viewBox units). */
const SW_BODY = 6;
/** Face / detail stroke width. */
const SW_DETAIL = 4.5;
/** Outline thickness on each side of an outlined limb. */
const LIMB_EDGE = 5.5;

type Pt = readonly [number, number];

/** Round to 0.1 so the markup stays short and never contains NaN. */
const r1 = (n: number): number => Math.round(n * 10) / 10;
const pt = (p: Pt): string => `${r1(p[0])} ${r1(p[1])}`;

/* ------------------------------------------------------------------------ */
/* Body geometry                                                             */
/* ------------------------------------------------------------------------ */

/** Shape parameters of the single body blob. */
interface BodySpec {
  /** centre x */
  cx: number;
  /** y of the flat bottom edge */
  by: number;
  /** half width at the widest point */
  hw: number;
  /** total height from bottom to the top of the eye-bumps */
  h: number;
  /** horizontal offset of each eye-bump centre from cx */
  bx: number;
  /** eye-bump radius */
  br: number;
}

const STANDARD: BodySpec = { cx: 100, by: 164, hw: 64, h: 88, bx: 37, br: 19 };

const spec = (over: Partial<BodySpec> = {}): BodySpec => ({ ...STANDARD, ...over });

type Seg = readonly [Pt, Pt, Pt];

/**
 * One closed path: bottom → right cheek → right eye-bump → dip → mirrored left half.
 * Every joint has a continuous tangent, so the outline reads as one soft blob.
 */
function bodyPath(s: BodySpec): string {
  const { cx, by, hw, h, bx, br } = s;
  const top = -h;
  // Right half in local coordinates (x right of centre, y up is negative).
  const p0: Pt = [0, 0];
  const right: Seg[] = [
    // flat bottom curving into the round lower corner
    [[hw * 0.58, 0], [hw, -h * 0.06], [hw, -h * 0.32]],
    // cheek rising to the outer side of the eye-bump
    [[hw, -h * 0.58], [bx + br, top + br * 1.9], [bx + br, top + br]],
    // over the eye-bump
    [[bx + br, top + br * 0.45], [bx + br * 0.55, top], [bx, top]],
    // down into the soft dip between the bumps
    [[bx - br * 0.62, top], [bx - br * 1.08, top + br * 0.6], [0, top + br * 0.6]],
  ];
  const starts: Pt[] = [p0, ...right.slice(0, -1).map((seg) => seg[2])];
  const mirror = (p: Pt): Pt => [-p[0], p[1]];
  const toAbs = (p: Pt): string => pt([cx + p[0], by + p[1]]);

  let d = `M${toAbs(p0)}`;
  for (const [c1, c2, e] of right) d += `C${toAbs(c1)} ${toAbs(c2)} ${toAbs(e)}`;
  for (let i = right.length - 1; i >= 0; i--) {
    const [c1, c2] = right[i];
    d += `C${toAbs(mirror(c2))} ${toAbs(mirror(c1))} ${toAbs(mirror(starts[i]))}`;
  }
  return `${d}Z`;
}

/** Anchor points derived from a body spec (face, belly, hands). */
interface FrogGeom {
  s: BodySpec;
  eyeL: Pt;
  eyeR: Pt;
  mouth: Pt;
  belly: Pt;
  top: number;
}

function geom(s: BodySpec): FrogGeom {
  const eyeY = s.by - s.h + s.br * 0.95;
  return {
    s,
    eyeL: [s.cx - s.bx, eyeY],
    eyeR: [s.cx + s.bx, eyeY],
    mouth: [s.cx, eyeY + s.br * 0.85],
    belly: [s.cx, s.by - s.h * 0.3],
    top: s.by - s.h,
  };
}

/* ------------------------------------------------------------------------ */
/* Parts kit                                                                 */
/* ------------------------------------------------------------------------ */

const inkStroke = {
  stroke: COLOR.ink,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const Body: React.FC<{ s: BodySpec }> = ({ s }) => (
  <path d={bodyPath(s)} fill={COLOR.body} strokeWidth={SW_BODY} {...inkStroke} />
);

const Shadow: React.FC<{ s: BodySpec; grow?: number }> = ({ s, grow = 1 }) => (
  <ellipse cx={s.cx} cy={s.by + 7} rx={r1(s.hw * 0.92 * grow)} ry={5} fill="#000000" fillOpacity={0.08} />
);

/** Two little leg bumps peeking under the body (draw BEFORE Body). */
const Legs: React.FC<{ s: BodySpec; spread?: number }> = ({ s, spread = 0.5 }) => (
  <g fill={COLOR.body} strokeWidth={SW_DETAIL} {...inkStroke}>
    <ellipse cx={r1(s.cx - s.hw * spread)} cy={s.by + 1} rx={13} ry={8} />
    <ellipse cx={r1(s.cx + s.hw * spread)} cy={s.by + 1} rx={13} ry={8} />
  </g>
);

/** Outlined sausage along any path: black stroke with a lime stroke on top. */
const Limb: React.FC<{ d: string; w?: number; fill?: string }> = ({ d, w = 10, fill = COLOR.body }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} stroke={COLOR.ink} strokeWidth={w + LIMB_EDGE * 2} />
    <path d={d} stroke={fill} strokeWidth={w} />
  </g>
);

/** Straight stubby arm from a to b, with a slight bend. */
const arm = (a: Pt, b: Pt, bend = 0): string => {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const c: Pt = [mx - (dy / len) * bend, my + (dx / len) * bend];
  return `M${pt(a)}Q${pt(c)} ${pt(b)}`;
};

const Mitten: React.FC<{ at: Pt; r?: number }> = ({ at, r = 9 }) => (
  <circle cx={r1(at[0])} cy={r1(at[1])} r={r} fill={COLOR.body} strokeWidth={SW_DETAIL} {...inkStroke} />
);

/** Outlined arm + mitten, for arms that stick out past the silhouette. */
const Arm: React.FC<{ from: Pt; to: Pt; bend?: number; hand?: number }> = ({ from, to, bend = 0, hand = 9 }) => (
  <g>
    <Limb d={arm(from, to, bend)} />
    {hand > 0 && <Mitten at={to} r={hand} />}
  </g>
);

/**
 * Arm lying in front of the body: just its two contour lines, open at the root,
 * so it grows out of the belly the way a doodle arm does (no capsule end).
 */
const FrontArm: React.FC<{ from: Pt; to: Pt; bend?: number; w?: number; hand?: number }> = ({
  from,
  to,
  bend = 0,
  w = 11,
  hand = 9,
}) => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2);
  const ny = (dx / len) * (w / 2);
  const side = (k: 1 | -1): string => arm([from[0] + nx * k, from[1] + ny * k], [to[0] + nx * k, to[1] + ny * k], bend);
  return (
    <g>
      <path d={`${side(1)}${side(-1)}`} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />
      {hand > 0 && <Mitten at={to} r={hand} />}
    </g>
  );
};

/** Round palm with two thick rounded fingers in a V. */
const PeaceHand: React.FC<{ at: Pt; rot?: number }> = ({ at, rot = 0 }) => (
  <g transform={`translate(${pt(at)}) rotate(${rot})`}>
    <Limb d="M-5 -6L-12 -34" w={11} />
    <Limb d="M4 -6L9 -35" w={11} />
    <circle cx={0} cy={0} r={16} fill={COLOR.body} strokeWidth={SW_DETAIL} {...inkStroke} />
    <path d="M-10 -1Q-2 6 9 -3" fill="none" strokeWidth={3.5} {...inkStroke} />
  </g>
);

type EyeKind = 'dot' | 'happy' | 'sleep' | 'flat';

const Eye: React.FC<{ at: Pt; kind?: EyeKind; r?: number }> = ({ at, kind = 'dot', r = 3.8 }) => {
  const [x, y] = at;
  switch (kind) {
    case 'happy':
      return <path d={`M${pt([x - 5.5, y + 2])}Q${pt([x, y - 5])} ${pt([x + 5.5, y + 2])}`} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />;
    case 'sleep':
      return <path d={`M${pt([x - 6.5, y - 1])}Q${pt([x, y + 5.5])} ${pt([x + 6.5, y - 1])}`} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />;
    case 'flat':
      return <path d={`M${pt([x - 5, y])}L${pt([x + 5, y])}`} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />;
    default:
      return <circle cx={r1(x)} cy={r1(y)} r={r} fill={COLOR.ink} />;
  }
};

const Eyes: React.FC<{ g: FrogGeom; kind?: EyeKind; dx?: number; dy?: number; r?: number }> = ({
  g,
  kind = 'dot',
  dx = 0,
  dy = 0,
  r,
}) => (
  <g>
    <Eye at={[g.eyeL[0] + dx, g.eyeL[1] + dy]} kind={kind} r={r} />
    <Eye at={[g.eyeR[0] + dx, g.eyeR[1] + dy]} kind={kind} r={r} />
  </g>
);

type MouthKind = 'smile' | 'flat' | 'w' | 'frown' | 'tongue' | 'pucker';

const Mouth: React.FC<{ at: Pt; kind?: MouthKind; w?: number }> = ({ at, kind = 'smile', w = 8 }) => {
  const [x, y] = at;
  const line = { fill: 'none', strokeWidth: 3.5, ...inkStroke } as const;
  switch (kind) {
    case 'flat':
      return <path d={`M${pt([x - w - 1.5, y + 2.5])}Q${pt([x - w, y])} ${pt([x - w + 2, y])}L${pt([x + w - 2, y])}Q${pt([x + w, y])} ${pt([x + w + 1.5, y + 2.5])}`} {...line} />;
    case 'w':
      return <path d={`M${pt([x - w, y - 1.5])}Q${pt([x - w / 2, y + 5])} ${pt([x, y - 0.5])}Q${pt([x + w / 2, y + 5])} ${pt([x + w, y - 1.5])}`} {...line} />;
    case 'frown':
      return <path d={`M${pt([x - w, y + 3])}Q${pt([x, y - 4])} ${pt([x + w, y + 3])}`} {...line} />;
    case 'tongue':
      return (
        <g>
          <path d={`M${pt([x - 5, y])}C${pt([x - 5, y + 12])} ${pt([x + 6, y + 12])} ${pt([x + 6, y])}Z`} fill={COLOR.pink} strokeWidth={3.5} {...inkStroke} />
          <path d={`M${pt([x - w, y])}L${pt([x + w, y])}`} {...line} />
        </g>
      );
    case 'pucker':
      return <circle cx={r1(x)} cy={r1(y)} r={3.2} fill={COLOR.mouth} />;
    default:
      return <path d={`M${pt([x - w, y])}Q${pt([x, y + 6])} ${pt([x + w, y])}`} {...line} />;
  }
};

/** Big round open mouth with a tongue blob at the bottom. */
const OpenMouth: React.FC<{ at: Pt; rx: number; ry: number }> = ({ at, rx, ry }) => {
  const [x, y] = at;
  return (
    <g>
      <ellipse cx={r1(x)} cy={r1(y)} rx={rx} ry={ry} fill={COLOR.mouth} />
      <ellipse cx={r1(x)} cy={r1(y + ry * 0.62)} rx={r1(rx * 0.6)} ry={r1(ry * 0.38)} fill={COLOR.pink} />
      <ellipse cx={r1(x)} cy={r1(y)} rx={rx} ry={ry} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />
    </g>
  );
};

const Blush: React.FC<{ g: FrogGeom }> = ({ g }) => (
  <g fill={COLOR.pink} fillOpacity={0.85}>
    <ellipse cx={r1(g.eyeL[0] - 5)} cy={r1(g.eyeL[1] + 14)} rx={5.5} ry={3} />
    <ellipse cx={r1(g.eyeR[0] + 5)} cy={r1(g.eyeR[1] + 14)} rx={5.5} ry={3} />
  </g>
);

/* --- glyphs -------------------------------------------------------------- */

const Question: React.FC<{ at: Pt; scale?: number }> = ({ at, scale = 1 }) => (
  <g transform={`translate(${pt(at)}) scale(${scale})`}>
    <path d="M-8 -9C-8 -19 8 -20 8 -9C8 -2 0 -2 0 6" fill="none" strokeWidth={6} {...inkStroke} />
    <circle cx={0} cy={15} r={3.6} fill={COLOR.ink} />
  </g>
);

const Zee: React.FC<{ at: Pt; size: number }> = ({ at, size }) => {
  const [x, y] = at;
  const s = size;
  return (
    <path
      d={`M${pt([x, y])}L${pt([x + s, y])}L${pt([x, y + s])}L${pt([x + s, y + s])}`}
      fill="none"
      strokeWidth={r1(2 + s * 0.18)}
      {...inkStroke}
    />
  );
};

const Sparkle: React.FC<{ at: Pt; s?: number }> = ({ at, s = 4 }) => {
  const [x, y] = at;
  return (
    <path
      d={`M${pt([x, y - s])}L${pt([x, y + s])}M${pt([x - s, y])}L${pt([x + s, y])}`}
      fill="none"
      stroke={COLOR.goldEdge}
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  );
};

/* --- coin ---------------------------------------------------------------- */

const CoinGradCtx = React.createContext('coinGrad');

/** Jin Chan coin: gold disc, ink outline, inner ring, square hole. squash < 1 = seen at an angle. */
const Coin: React.FC<{ at: Pt; r: number; squash?: number; rot?: number }> = ({ at, r, squash = 1, rot = 0 }) => {
  const grad = React.useContext(CoinGradCtx);
  const rx = r1(r * squash);
  const hole = r1(r * 0.42);
  return (
    <g transform={`translate(${pt(at)}) rotate(${rot})`}>
      <ellipse cx={0} cy={0} rx={rx} ry={r} fill={`url(#${grad})`} strokeWidth={4} {...inkStroke} />
      <ellipse cx={0} cy={0} rx={r1(rx * 0.72)} ry={r1(r * 0.72)} fill="none" stroke={COLOR.goldEdge} strokeWidth={1.8} />
      <rect
        x={r1((-hole * squash) / 2)}
        y={r1(-hole / 2)}
        width={r1(hole * squash)}
        height={hole}
        rx={1}
        fill={COLOR.goldLight}
        strokeWidth={2.5}
        {...inkStroke}
      />
    </g>
  );
};

/** Coin seen edge-on (held in the mouth). */
const CoinEdge: React.FC<{ at: Pt }> = ({ at }) => {
  const grad = React.useContext(CoinGradCtx);
  return (
    <g transform={`translate(${pt(at)})`}>
      <ellipse cx={0} cy={0} rx={14} ry={6} fill={`url(#${grad})`} strokeWidth={4} {...inkStroke} />
      <rect x={-3} y={-2} width={6} height={4} rx={0.8} fill={COLOR.goldLight} strokeWidth={2} {...inkStroke} />
    </g>
  );
};

/** Where a pose wants the coin props to sit. */
interface Anchors {
  mouth: Pt;
  belly: Pt;
  head: Pt;
  hand: Pt;
}

const anchorsOf = (g: FrogGeom, over: Partial<Anchors> = {}): Anchors => ({
  mouth: g.mouth,
  belly: [g.belly[0], g.belly[1] + 2],
  head: [g.s.cx + g.s.hw * 0.85, g.top - 6],
  hand: [g.s.cx + g.s.hw * 0.62, g.s.by - 26],
  ...over,
});

const CoinLayer: React.FC<{ coin: MascotCoinProp; a: Anchors }> = ({ coin, a }) => {
  switch (coin) {
    case 'mouth_clamp':
      return (
        <g data-testid="coin-mouth-clamp">
          <CoinEdge at={[a.mouth[0], a.mouth[1] + 1]} />
        </g>
      );
    case 'flipping':
      return (
        <g data-testid="coin-flipping">
          <Coin at={a.head} r={11} squash={0.6} rot={18} />
          <Sparkle at={[a.head[0] - 15, a.head[1] - 8]} s={3.5} />
          <Sparkle at={[a.head[0] + 13, a.head[1] + 10]} s={3} />
        </g>
      );
    case 'hugging': {
      const [x, y] = a.belly;
      return (
        <g data-testid="coin-hugging">
          <Coin at={[x, y]} r={20} />
          <FrontArm from={[x - 40, y - 12]} to={[x - 18, y + 2]} bend={-3} hand={8} />
          <FrontArm from={[x + 40, y - 12]} to={[x + 18, y + 2]} bend={3} hand={8} />
        </g>
      );
    }
    case 'polishing': {
      const [x, y] = a.hand;
      return (
        <g data-testid="coin-polishing">
          <Coin at={[x, y]} r={17} />
          <path
            d={`M${pt([x + 4, y - 18])}C${pt([x + 16, y - 24])} ${pt([x + 26, y - 10])} ${pt([x + 20, y - 2])}C${pt([x + 14, y + 4])} ${pt([x + 2, y - 6])} ${pt([x + 4, y - 18])}Z`}
            fill="#FFFFFF"
            strokeWidth={3.5}
            {...inkStroke}
          />
          <Mitten at={[x + 18, y - 4]} r={8} />
          <path
            d={`M${pt([x - 22, y - 14])}L${pt([x - 27, y - 19])}M${pt([x - 14, y - 22])}L${pt([x - 16, y - 28])}`}
            fill="none"
            strokeWidth={3}
            {...inkStroke}
          />
        </g>
      );
    }
    case 'swallowing': {
      const [x, y] = a.mouth;
      return (
        <g data-testid="coin-swallowing">
          <Coin at={[x, y - 52]} r={14} squash={0.85} rot={-14} />
          <path
            d={`M${pt([x - 6, y - 88])}L${pt([x - 6, y - 76])}M${pt([x + 5, y - 92])}L${pt([x + 5, y - 78])}`}
            fill="none"
            stroke={COLOR.goldEdge}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      );
    }
    default:
      return null;
  }
};

/* ------------------------------------------------------------------------ */
/* Poses                                                                     */
/* ------------------------------------------------------------------------ */

interface PoseProps {
  coin: MascotCoinProp;
  animated: boolean;
}

/** Shared "sitting frog" skeleton: shadow, legs, body. */
const Sitting: React.FC<{ s: BodySpec }> = ({ s }) => (
  <g>
    <Shadow s={s} />
    <Legs s={s} />
    <Body s={s} />
  </g>
);

/** A doodle hand resting on the lap: an "n" arc that opens into the body's bottom edge. */
const ArmNub: React.FC<{ x: number; by: number; w?: number; h?: number }> = ({ x, by, w = 7, h = 15 }) => (
  <path
    d={`M${pt([x - w, by - 1])}C${pt([x - w, by - h])} ${pt([x + w, by - h])} ${pt([x + w, by - 1])}`}
    fill="none"
    strokeWidth={SW_DETAIL}
    {...inkStroke}
  />
);

/** Two little hands resting on the lower front of the body. */
const RestingArms: React.FC<{ g: FrogGeom }> = ({ g }) => (
  <g>
    <ArmNub x={g.s.cx - g.s.hw * 0.42} by={g.s.by} />
    <ArmNub x={g.s.cx + g.s.hw * 0.42} by={g.s.by} />
  </g>
);

const DefaultSitting: React.FC<PoseProps> = ({ coin }) => {
  const g = geom(spec());
  return (
    <g data-testid="pose-default-sitting">
      <Sitting s={g.s} />
      {coin !== 'hugging' && <RestingArms g={g} />}
      <Eyes g={g} />
      {coin !== 'mouth_clamp' && <Mouth at={g.mouth} kind="smile" w={7} />}
      <CoinLayer coin={coin} a={anchorsOf(g)} />
    </g>
  );
};

const WaterfallTears: React.FC<PoseProps> = ({ coin }) => {
  const g = geom(spec());
  const { cx, by } = g.s;
  const [lx, ly] = g.eyeL;
  const [rx, ry] = g.eyeR;
  const jet = (x: number, y: number, dir: 1 | -1): string =>
    `M${pt([x, y])}C${pt([x + dir * 14, y - 6])} ${pt([x + dir * 30, y - 6])} ${pt([x + dir * 42, y + 3])}`;
  const drops: Pt[] = [
    [12, 116], [26, 126], [188, 116], [174, 126], [18, 82], [182, 82],
  ];
  return (
    <g data-testid="pose-waterfall-tears">
      <ellipse cx={cx} cy={by + 6} rx={86} ry={8} fill={COLOR.waterLight} fillOpacity={0.7} />
      <Legs s={g.s} />
      <Body s={g.s} />
      <Limb d={jet(lx - 6, ly + 8, -1)} w={13} fill={COLOR.water} />
      <Limb d={jet(rx + 6, ry + 8, 1)} w={13} fill={COLOR.water} />
      {drops.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={3.2} fill={COLOR.water} strokeWidth={2.5} {...inkStroke} />
      ))}
      <Arm from={[cx - g.s.hw + 2, by - 44]} to={[lx + 2, ly + 3]} bend={-4} hand={12} />
      <Arm from={[cx + g.s.hw - 2, by - 44]} to={[rx - 2, ry + 3]} bend={4} hand={12} />
      {coin !== 'mouth_clamp' && <Mouth at={[cx, g.mouth[1] + 8]} kind="frown" w={6} />}
      <CoinLayer coin={coin} a={anchorsOf(g, { mouth: [cx, g.mouth[1] + 8] })} />
    </g>
  );
};

const MeltedBlob: React.FC<PoseProps> = ({ coin }) => {
  const s = spec({ by: 166, hw: 76, h: 64, bx: 40, br: 14 });
  const g = geom(s);
  const hand: Pt = [s.cx + s.hw - 2, s.by - 26];
  return (
    <g data-testid="pose-melted-blob">
      <Shadow s={s} grow={1.05} />
      <Body s={s} />
      <Eyes g={g} r={3.4} dy={1} />
      {coin !== 'mouth_clamp' && <Mouth at={[s.cx, g.mouth[1] + 2]} kind="flat" w={11} />}
      <Limb d={`M${pt([hand[0] - 2, hand[1] - 6])}L${pt([hand[0] + 1, hand[1] - 18])}`} w={7} />
      <Mitten at={hand} r={10} />
      <CoinLayer coin={coin} a={anchorsOf(g, { hand: [s.cx + 40, s.by - 22] })} />
    </g>
  );
};

/** Bread-slice outline (rounded box with a bulging crown) centred on cx,cy. */
function breadPath(cx: number, cy: number, w: number, h: number): string {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const neck = y0 + h * 0.36;
  const lip = w * 0.07;
  const c = 6;
  return (
    `M${pt([x0 + c, y1])}L${pt([x1 - c, y1])}Q${pt([x1, y1])} ${pt([x1, y1 - c])}L${pt([x1, neck])}` +
    `C${pt([x1 + lip, neck - h * 0.06])} ${pt([x1 + lip, y0 + h * 0.06])} ${pt([cx + w * 0.3, y0 + h * 0.02])}` +
    `C${pt([cx + w * 0.16, y0 - h * 0.02])} ${pt([cx - w * 0.16, y0 - h * 0.02])} ${pt([cx - w * 0.3, y0 + h * 0.02])}` +
    `C${pt([x0 - lip, y0 + h * 0.06])} ${pt([x0 - lip, neck - h * 0.06])} ${pt([x0, neck])}` +
    `L${pt([x0, y1 - c])}Q${pt([x0, y1])} ${pt([x0 + c, y1])}Z`
  );
}

/** Rounded-rect hole path (used as the toast's cut-out window). */
function roundRect(cx: number, cy: number, w: number, h: number, rad: number): string {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  return (
    `M${pt([x0 + rad, y0])}H${r1(x0 + w - rad)}Q${pt([x0 + w, y0])} ${pt([x0 + w, y0 + rad])}` +
    `V${r1(y0 + h - rad)}Q${pt([x0 + w, y0 + h])} ${pt([x0 + w - rad, y0 + h])}` +
    `H${r1(x0 + rad)}Q${pt([x0, y0 + h])} ${pt([x0, y0 + h - rad])}V${r1(y0 + rad)}Q${pt([x0, y0])} ${pt([x0 + rad, y0])}Z`
  );
}

const ToastFace: React.FC<PoseProps> = ({ coin }) => {
  // Taller blob: the sides hide behind the slice and the face fills the cut-out.
  const s = spec({ h: 100 });
  const g = geom(s);
  const { cx, by } = s;
  const tc: Pt = [cx, 104];
  return (
    <g data-testid="pose-toast-face">
      <Sitting s={s} />
      <Eyes g={g} dy={10} />
      {coin !== 'mouth_clamp' && <Mouth at={[cx, g.mouth[1] + 8]} kind="flat" w={6} />}
      <path
        d={`${breadPath(tc[0], tc[1], 140, 106)}${roundRect(tc[0], tc[1] + 6, 104, 62, 12)}`}
        fillRule="evenodd"
        fill={COLOR.toast}
        strokeWidth={SW_BODY}
        {...inkStroke}
      />
      <path d={breadPath(tc[0], tc[1] - 1, 124, 92)} fill="none" stroke={COLOR.crust} strokeWidth={3} strokeLinejoin="round" />
      <path d={roundRect(tc[0], tc[1] + 6, 104, 62, 12)} fill="none" strokeWidth={SW_DETAIL} {...inkStroke} />
      <Mitten at={[cx - 42, by - 9]} r={10} />
      <Mitten at={[cx + 42, by - 9]} r={10} />
      <CoinLayer coin={coin} a={anchorsOf(g, { mouth: [cx, g.mouth[1] + 8] })} />
    </g>
  );
};

const PeaceDab: React.FC<PoseProps> = ({ coin }) => {
  const s = spec({ cx: 114, hw: 58, h: 84, bx: 33, br: 17 });
  const g = geom(s);
  const { cx, by } = s;
  return (
    <g data-testid="pose-peace-dab">
      <Shadow s={s} />
      <g transform={`rotate(-7 ${cx} ${by})`}>
        <Arm from={[cx - 42, by - 44]} to={[cx - 62, by - 84]} bend={-4} hand={0} />
        <PeaceHand at={[cx - 64, by - 90]} rot={2} />
        <Legs s={s} />
        <Body s={s} />
        <ArmNub x={cx + s.hw * 0.22} by={by} />
        <Eyes g={g} />
        <Blush g={g} />
        {coin !== 'mouth_clamp' && <Mouth at={g.mouth} kind="smile" w={8} />}
        <CoinLayer coin={coin} a={anchorsOf(g)} />
      </g>
    </g>
  );
};

const SippingDrink: React.FC<PoseProps> = ({ coin }) => {
  const g = geom(spec());
  const { cx, by } = g.s;
  const [lx, ly] = g.eyeL;
  const [rx, ry] = g.eyeR;
  const cupTop = by - 44;
  const lens = (x: number, y: number): string => `M${pt([x - 13, y - 7])}h26v8q0 8 -8 8h-10q-8 0 -8 -8Z`;
  return (
    <g data-testid="pose-sipping-drink">
      <Sitting s={g.s} />
      <Blush g={g} />
      <g fill={COLOR.ink} strokeWidth={3} {...inkStroke}>
        <path d={lens(lx + 2, ly)} />
        <path d={lens(rx - 2, ry)} />
        <path d={`M${pt([lx + 14, ly - 1])}Q${pt([cx, ly - 5])} ${pt([rx - 14, ry - 1])}`} fill="none" strokeWidth={4} />
      </g>
      {coin !== 'mouth_clamp' && <Mouth at={[cx - 2, g.mouth[1] + 2]} kind="pucker" />}
      <Limb d={`M${pt([cx + 8, cupTop + 6])}L${pt([cx + 2, g.mouth[1] + 3])}`} w={3} fill={COLOR.pink} />
      <path
        d={`M${pt([cx - 13, cupTop])}L${pt([cx + 13, cupTop])}L${pt([cx + 10, by - 6])}Q${pt([cx + 10, by - 2])} ${pt([cx + 6, by - 2])}L${pt([cx - 6, by - 2])}Q${pt([cx - 10, by - 2])} ${pt([cx - 10, by - 6])}Z`}
        fill={COLOR.cup}
        strokeWidth={SW_DETAIL}
        {...inkStroke}
      />
      <path d={`M${pt([cx - 11, cupTop + 12])}L${pt([cx + 11, cupTop + 12])}`} stroke={COLOR.pink} strokeWidth={3} strokeLinecap="round" />
      <FrontArm from={[cx - 42, by - 26]} to={[cx - 15, by - 21]} bend={-3} hand={9} />
      <FrontArm from={[cx + 42, by - 26]} to={[cx + 15, by - 21]} bend={3} hand={9} />
      <CoinLayer coin={coin} a={anchorsOf(g, { belly: [cx, by - 26] })} />
    </g>
  );
};

const SleepingBubble: React.FC<PoseProps> = ({ coin, animated }) => {
  const s = spec({ by: 166, hw: 68, h: 80, bx: 38, br: 16 });
  const g = geom(s);
  const bubble: Pt = [s.cx + 15, g.mouth[1] + 5];
  return (
    <g data-testid="pose-sleeping-bubble">
      <Sitting s={s} />
      {coin !== 'hugging' && <RestingArms g={g} />}
      <Eyes g={g} kind="sleep" dy={2} />
      {coin !== 'mouth_clamp' && <Mouth at={[s.cx, g.mouth[1] + 2]} kind="smile" w={5} />}
      <Zee at={[146, 58]} size={9} />
      <Zee at={[160, 38]} size={12} />
      <Zee at={[175, 14]} size={15} />
      <CoinLayer coin={coin} a={anchorsOf(g, { belly: [s.cx, s.by - 18] })} />
      <g className={animated ? 'keroo-bubble' : undefined}>
        <circle cx={r1(bubble[0])} cy={r1(bubble[1])} r={12} fill="#FFFFFF" fillOpacity={0.7} stroke={COLOR.waterLight} strokeWidth={3} />
        <path d={`M${pt([bubble[0] - 6, bubble[1] - 3])}Q${pt([bubble[0] - 5, bubble[1] - 8])} ${pt([bubble[0], bubble[1] - 8])}`} fill="none" stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" />
      </g>

    </g>
  );
};

const CheekyTongue: React.FC<PoseProps> = ({ coin }) => {
  const s = spec({ hw: 58, h: 88, bx: 33, br: 16 });
  const g = geom(s);
  const { cx, by } = s;
  return (
    <g data-testid="pose-cheeky-tongue">
      <Shadow s={s} />
      <Arm from={[cx - 40, by - 50]} to={[cx - 78, by - 56]} bend={4} />
      <Arm from={[cx + 40, by - 50]} to={[cx + 78, by - 56]} bend={-4} />
      <Legs s={s} />
      <Body s={s} />
      <Eyes g={g} />
      <Blush g={g} />
      {coin !== 'mouth_clamp' && <Mouth at={g.mouth} kind="tongue" w={10} />}
      <CoinLayer coin={coin} a={anchorsOf(g)} />
    </g>
  );
};

const CoinSwallowing: React.FC<PoseProps> = ({ coin }) => {
  const s = spec({ h: 94 });
  const g = geom(s);
  const { cx, by } = s;
  const mouth: Pt = [cx, g.eyeL[1] + 22];
  return (
    <g data-testid="pose-coin-swallowing">
      <Shadow s={s} />
      <Arm from={[cx - 52, by - 40]} to={[cx - 74, by - 64]} bend={-3} hand={8} />
      <Arm from={[cx + 52, by - 40]} to={[cx + 74, by - 64]} bend={3} hand={8} />
      <Legs s={s} />
      <Body s={s} />
      <Eye at={[g.eyeL[0] - 6, g.eyeL[1] - 4]} r={3.4} />
      <Eye at={[g.eyeR[0] + 6, g.eyeR[1] - 4]} r={3.4} />
      {coin !== 'mouth_clamp' && <OpenMouth at={mouth} rx={32} ry={27} />}
      <CoinLayer coin={coin} a={anchorsOf(g, { mouth })} />
    </g>
  );
};

const CuriousHeadTilt: React.FC<PoseProps> = ({ coin }) => {
  const g = geom(spec());
  const { cx, by } = g.s;
  return (
    <g data-testid="pose-curious-head-tilt">
      <Shadow s={g.s} />
      <g transform={`rotate(12 ${cx} ${by})`}>
        <Legs s={g.s} />
        <Body s={g.s} />
        <Eyes g={g} />
        {coin !== 'mouth_clamp' && <Mouth at={[g.mouth[0] - 4, g.mouth[1]]} kind="w" w={8} />}
        <FrontArm from={[cx + 50, by - 18]} to={[cx + 28, g.mouth[1] + 10]} bend={6} hand={10} />
        <CoinLayer coin={coin} a={anchorsOf(g)} />
      </g>
      <Question at={[168, 40]} />
    </g>
  );
};

const POSES: Record<KerooPose, React.FC<PoseProps>> = {
  default_sitting: DefaultSitting,
  waterfall_tears: WaterfallTears,
  melted_blob: MeltedBlob,
  toast_face: ToastFace,
  peace_dab: PeaceDab,
  sipping_drink: SippingDrink,
  sleeping_bubble: SleepingBubble,
  cheeky_tongue: CheekyTongue,
  coin_swallowing: CoinSwallowing,
  curious_head_tilt: CuriousHeadTilt,
};

/* ------------------------------------------------------------------------ */
/* Animation (scoped inside the svg, honours reduced motion)                 */
/* ------------------------------------------------------------------------ */

const MOTION_CSS = `
.keroo-breathe{transform-box:view-box;transform-origin:100px 168px;animation:keroo-breathe 3s ease-in-out infinite}
.keroo-bubble{transform-box:fill-box;transform-origin:15% 85%;animation:keroo-bubble 2.8s ease-in-out infinite}
@keyframes keroo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
@keyframes keroo-bubble{0%,100%{transform:scale(0.7)}50%{transform:scale(1.08)}}
@media (prefers-reduced-motion: reduce){.keroo-breathe,.keroo-bubble{animation:none}}
`;

/* ------------------------------------------------------------------------ */
/* Component                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Accessible name of each pose, from the dictionaries (`pet.aria.<pose>`, one key per KerooPose
 * in both pt-BR and en-US). An unknown runtime pose falls back to the default sitting label.
 */
const ariaKeyFor = (pose: KerooPose): string =>
  Object.prototype.hasOwnProperty.call(POSES, pose) ? `pet.aria.${pose}` : 'pet.aria.default_sitting';

export const KerooMascot: React.FC<KerooMascotProps> = ({
  pose = 'default_sitting',
  size = 'md',
  coinProp = 'none',
  animated = true,
  className = '',
  onClick,
  ariaLabel,
  style,
}) => {
  const { t } = useOptionalTranslation();
  const pixelSize = typeof size === 'number' ? size : SIZE_MAP[size] || 80;
  const gradId = `coinGrad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  // Explicit coin prop wins; otherwise some poses bring their own coin.
  const effectiveCoinProp: MascotCoinProp = useMemo(() => {
    if (coinProp !== 'none') return coinProp;
    if (pose === 'coin_swallowing') return 'swallowing';
    if (pose === 'peace_dab') return 'flipping';
    if (pose === 'sleeping_bubble') return 'hugging';
    return 'none';
  }, [coinProp, pose]);

  const Pose = POSES[pose] ?? DefaultSitting;

  return (
    <div
      role="img"
      aria-label={ariaLabel || t(ariaKeyFor(pose))}
      onClick={onClick}
      className={`inline-flex items-center justify-center select-none relative ${
        onClick ? 'cursor-pointer hover:opacity-95 active:scale-95 transition-transform' : ''
      } ${className}`}
      style={{ width: pixelSize, height: pixelSize, ...style }}
      data-testid="keroo-mascot-container"
      data-pose={pose}
      data-coin-prop={effectiveCoinProp}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={gradId} cx="38%" cy="35%" r="70%">
            <stop offset="0%" stopColor={COLOR.goldLight} />
            <stop offset="45%" stopColor={COLOR.gold} />
            <stop offset="100%" stopColor="#F2B600" />
          </radialGradient>
        </defs>
        {animated && <style>{MOTION_CSS}</style>}
        <CoinGradCtx.Provider value={gradId}>
          <g className={animated ? 'keroo-breathe' : undefined}>
            <Pose coin={effectiveCoinProp} animated={animated} />
          </g>
        </CoinGradCtx.Provider>
      </svg>
    </div>
  );
};

