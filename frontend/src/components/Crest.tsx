import { useId, useMemo } from 'react'
import { CHARGES, crestFor, type CrestSpec } from '../lib/crest'
import type { Character, Emblem, ThemeName } from '../types'

interface CrestProps {
  character: Character
  variant: number
  theme: ThemeName
  /** The emblem the table chose from the emblem service; drawn instead of the built-in crest */
  emblem?: Emblem | null
  size?: number
  className?: string
}

/** The hero's crest, in the theme's own form: a shield, a mission patch, a tag, a sigil, a mark, a badge. */
export function Crest({ emblem, ...props }: CrestProps) {
  return emblem ? <EmblemImage emblem={emblem} size={props.size} className={props.className} /> : <BuiltInCrest {...props} />
}

/** An emblem's SVG as an image: its ids can't clash with the page's, and it can't run anything */
export function EmblemImage({ emblem, size = 120, className }: { emblem: Emblem; size?: number; className?: string }) {
  const src = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emblem.svg)}`, [emblem.svg])
  return <img className={`crest crest--emblem ${className ?? ''}`} src={src} width={size} height={size} alt={emblem.description || 'The hero\'s crest'} />
}

function BuiltInCrest({ character, variant, theme, size = 120, className }: Omit<CrestProps, 'emblem'>) {
  const spec = useMemo(() => crestFor(character, variant), [character, variant])
  const id = useId()
  return (
    <svg
      className={`crest ${className ?? ''}`}
      width={size}
      height={size * 1.1}
      viewBox="0 0 100 110"
      role="img"
      aria-label={`The crest of ${spec.name}: ${spec.charge}`}
    >
      {RECIPES[theme](spec, id)}
    </svg>
  )
}

/** A charge centred on (cx, cy), drawn with stroked lines */
function Charge({ spec, cx, cy, size, color, halo }: { spec: CrestSpec; cx: number; cy: number; size: number; color: string; halo?: string }) {
  const s = size / 24
  const d = CHARGES[spec.charge].d
  return (
    <g transform={`translate(${cx - size / 2} ${cy - size / 2}) scale(${s})`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {halo && <path d={d} stroke={halo} strokeWidth={4.2} />}
      <path d={d} stroke={color} strokeWidth={2} />
    </g>
  )
}

// Heraldic tinctures for Fantasy: a colour and a metal
const TINCTURES = [['#7e2a1d', '#d9a557'], ['#2f5d4a', '#d9a557'], ['#1f3552', '#d8d2c4'], ['#3b2050', '#d8d2c4']]
const SHIELD = 'M10 8h80v40c0 30-20 46-40 56-20-10-40-26-40-56z'

const RECIPES: Record<ThemeName, (spec: CrestSpec, id: string) => React.ReactNode> = {
  fantasy: (spec, id) => {
    const [colour, metal] = TINCTURES[spec.palette]
    const fields = [
      null,
      <path key="d" d="M0 0h100L0 110z" fill={metal} />,
      <rect key="d" x="50" width="50" height="110" fill={metal} />,
      <rect key="d" y="52" width="100" height="58" fill={metal} />,
      <path key="d" d="M0 92L50 48l50 44v20L50 68 0 112z" fill={metal} />,
      <g key="d" fill={metal}><rect width="50" height="52" /><rect x="50" y="52" width="50" height="58" /></g>,
    ]
    return (
      <>
        <defs><clipPath id={`${id}s`}><path d={SHIELD} /></clipPath></defs>
        <g clipPath={`url(#${id}s)`}>
          <rect width="100" height="110" fill={colour} />
          {fields[spec.division]}
        </g>
        <path d={SHIELD} fill="none" stroke="#f2e6cf" strokeWidth="2.5" />
        <Charge spec={spec} cx={50} cy={50} size={44} color="#f2e6cf" halo="#17110c" />
      </>
    )
  },

  deep_space: (spec, id) => {
    const side = spec.division % 3
    return (
      <>
        <circle cx="50" cy="55" r="46" fill="var(--bg-secondary)" stroke="var(--accent)" strokeWidth="2.5" />
        <circle cx="50" cy="55" r="29" fill="color-mix(in srgb, var(--accent) 12%, var(--bg-primary))" stroke="var(--accent)" strokeWidth="1" />
        {/* Stars around the rim, one bright one wherever the seed puts it */}
        <g fill="var(--accent)">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2 + spec.turn * Math.PI
            const bright = i === spec.palette * 3
            return <circle key={i} cx={50 + 37.5 * Math.cos(a)} cy={55 + 37.5 * Math.sin(a)} r={bright ? 2.6 : 1.3} opacity={bright ? 1 : 0.7} />
          })}
        </g>
        <clipPath id={`${id}c`}><circle cx="50" cy="55" r="29" /></clipPath>
        <g clipPath={`url(#${id}c)`}>
          <circle cx={side === 0 ? 50 : side === 1 ? 20 : 80} cy="96" r="26" fill="var(--accent)" opacity=".8" />
        </g>
        <ellipse cx="50" cy="55" rx="27" ry="7" fill="none" stroke="var(--text-primary)" strokeWidth=".8" transform={`rotate(${-30 + spec.turn * 60} 50 55)`} />
        <Charge spec={spec} cx={50} cy={50} size={26} color="var(--text-primary)" />
      </>
    )
  },

  cyberpunk: spec => (
    <>
      <path d="M18 10h60l16 16v62l-12 12H6V30z" fill="var(--accent)" />
      <path d="M18 10h60l16 16v62l-12 12H6V30z" fill="none" stroke="var(--bg-primary)" strokeWidth="1.5" transform="translate(5 5) scale(.9)" />
      <g fill="var(--bg-primary)">
        {[0, 4, 7, 11, 14, 19, 22, 26, 29, 33].map((x, i) => <rect key={x} x={14 + x} y="80" width={(i + spec.division) % 3 + 1} height="10" />)}
      </g>
      {/* A serial, not a name: the hash of the hero's answers */}
      <text x="15" y="54" fontFamily="var(--font-display)" fontWeight="700" fontSize="27" letterSpacing="1" fill="var(--bg-primary)">{spec.code.slice(0, 4)}</text>
      <text x="15" y="70" fontFamily="var(--font-display)" fontSize="11" letterSpacing="1.5" fill="var(--bg-primary)" opacity=".75">{`#${spec.code.slice(4)}-${spec.division}${spec.palette}`}</text>
      {spec.palette % 2 === 0 && <rect x="80" y="74" width="8" height="8" fill="var(--danger)" />}
    </>
  ),

  horror: spec => {
    const sides = [3, 4, 6][spec.division % 3]
    const r = 30
    const points = Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + spec.turn * Math.PI / 3
      return `${50 + r * Math.cos(a)},${55 + r * Math.sin(a)}`
    }).join(' ')
    return (
      <>
        <g fill="none" stroke="var(--accent)" strokeWidth="1.6">
          <circle cx="50" cy="55" r="44" />
          <circle cx="50" cy="55" r="36" />
          <polygon points={points} />
        </g>
        <g stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2
            return <line key={i} x1={50 + 47 * Math.cos(a)} y1={55 + 47 * Math.sin(a)} x2={50 + 52 * Math.cos(a)} y2={55 + 52 * Math.sin(a)} />
          })}
        </g>
        <Charge spec={spec} cx={50} cy={55} size={28} color="var(--text-primary)" />
      </>
    )
  },

  insanity: spec => (
    <>
      <g fill="none" stroke="var(--accent)" strokeLinecap="round" transform={`rotate(${spec.turn * 360} 50 55)`}>
        <path d="M14 60a36 36 0 0 1 66-26" strokeWidth="1.8" strokeDasharray={spec.division % 2 ? '30 6 4 6' : '18 8'} />
        <path d="M88 64a40 38 0 0 1-64 22" strokeWidth="1.8" strokeDasharray="22 10" />
        <path d="M84 26l6-5M16 92l-6 4M76 98l2 6" strokeWidth="1.8" />
      </g>
      <circle cx={30 + spec.palette * 12} cy="26" r="2.5" fill="var(--danger)" />
      <Charge spec={spec} cx={50} cy={56} size={36} color="var(--accent)" />
    </>
  ),

  modern: spec => {
    const shape = spec.division % 3
    return (
      <>
        {shape === 0 && <circle cx="50" cy="55" r="44" fill="var(--accent)" />}
        {shape === 1 && <rect x="8" y="13" width="84" height="84" rx="20" fill="var(--accent)" />}
        {shape === 2 && <path d="M50 9l40 23v46L50 101 10 78V32z" fill="var(--accent)" />}
        <Charge spec={spec} cx={50} cy={55} size={42} color="var(--bg-primary)" />
      </>
    )
  },
}
