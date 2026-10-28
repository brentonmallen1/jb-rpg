import type { SVGProps } from 'react'

/** Small stroke icons that take the current text colour. Decorative unless given a label. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number; label?: string }

function Icon({ size = 18, label, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const PresentIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></Icon>
)
export const LinkIcon = (p: IconProps) => (
  <Icon {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Icon>
)
export const BookIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 7c-2-1.6-5-2.2-9-1.8v13c4-.4 7 .2 9 1.8 2-1.6 5-2.2 9-1.8v-13c-4-.4-7 .2-9 1.8z" /><path d="M12 7v13" /></Icon>
)
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
)
export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}><path d="M3 3l18 18" /><path d="M10.6 5.1A10 10 0 0 1 22 12a14 14 0 0 1-3 3.7M6.6 6.6A14 14 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4.4-1.1" /></Icon>
)
export const EyeIcon = (p: IconProps) => (
  <Icon {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>
)
export const LockIcon = (p: IconProps) => (
  <Icon {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>
)
export const GemIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 2l7 7-7 13L5 9z" /></Icon>
)
export const WoundIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /><path d="M13 7l-2 4 3 1-2 4" /></Icon>
)
export const LevelIcon = (p: IconProps) => (
  <Icon {...p}><path d="M6 15l6-6 6 6" /><path d="M6 20l6-6 6 6" /></Icon>
)
export const SunIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
)
export const MoonIcon = (p: IconProps) => (
  <Icon {...p}><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" /></Icon>
)
export const SparkIcon = (p: IconProps) => (
  <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Icon>
)
export const FlashIcon = (p: IconProps) => (
  <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></Icon>
)
export const FlashOffIcon = (p: IconProps) => (
  <Icon {...p}><path d="M13 2l-3.6 4.8M7.2 9.8L4 14h7l-1 8 4-5.3M16.6 12.6L19 10h-7l.4-3" /><path d="M3 3l18 18" /></Icon>
)
export const GearIcon = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon>
)
export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>
)
export const BackIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Icon>
)
export const UndoIcon = (p: IconProps) => (
  <Icon {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Icon>
)
export const RedoIcon = (p: IconProps) => (
  <Icon {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Icon>
)
export const SoundOnIcon = (p: IconProps) => (
  <Icon {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></Icon>
)
export const SoundOffIcon = (p: IconProps) => (
  <Icon {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M16 9l5 6M21 9l-5 6" /></Icon>
)
export const KeyboardIcon = (p: IconProps) => (
  <Icon {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></Icon>
)

/** A twenty-sided die outline. */
export function D20Icon({ size = 120, label = 'Twenty-sided die', ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={label} {...rest}>
      <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="color-mix(in srgb, var(--accent) 8%, transparent)" stroke="var(--accent)" strokeWidth="1.6" />
      <polygon points="50,24 72,62 28,62" fill="none" stroke="var(--accent)" strokeWidth="1.3" />
      <path
        d="M50 4L50 24M90 27L72 62M90 73L72 62M50 96L72 62M50 96L28 62M10 73L28 62M10 27L28 62M10 27L50 24M90 27L50 24"
        stroke="color-mix(in srgb, var(--accent) 55%, transparent)"
        strokeWidth="0.9"
        fill="none"
      />
      <text x="50" y="54" textAnchor="middle" fontSize="15" fontFamily="var(--font-display)" fill="var(--text-primary)">20</text>
    </svg>
  )
}
