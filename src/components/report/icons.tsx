// One Hackney line icons: 24px grid, 2px rounded strokes, currentColor.

type IconProps = { className?: string };

function Icon({ className = "h-6 w-6", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z" />
  </Icon>
);
export const IconChat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L4 19.8l1.2-4.4a8 8 0 1 1 15.3-3.9z" />
    <path d="M9 11.5h.01M12.5 11.5h.01M16 11.5h.01" />
  </Icon>
);
export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3v10.5H4z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Icon>
);
export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Icon>
);
export const IconUser = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </Icon>
);
export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4-4" />
  </Icon>
);
/** Pound coin: council tax. */
export const IconPound = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.5 8.6a2.4 2.4 0 0 0-4.2 1.6c0 1.6.6 2.4.6 3.8 0 1.1-.6 1.8-1.4 2.2h5.6M9 12.6h4.2" />
  </Icon>
);
/** Wheelie bin: collections. */
export const IconBin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 7h14M9.5 7V5h5v2M6.5 7l1 12h9l1-12" />
    <circle cx="8.5" cy="20" r="1" />
    <circle cx="15.5" cy="20" r="1" />
    <path d="M10.5 11v4.5M13.5 11v4.5" />
  </Icon>
);
/** Parking sign. */
export const IconParking = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M10 16.5v-9h2.8a2.6 2.6 0 0 1 0 5.2H10" />
  </Icon>
);
/** Spanner: repairs. */
export const IconWrench = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.7 6.3a4 4 0 0 0-5.3 5.3l-5.2 5.2a1.6 1.6 0 0 0 2.3 2.3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.4 2.4-2.2-.4-.4-2.2z" />
  </Icon>
);
export const IconTrophy = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 4.5h8v5a4 4 0 0 1-8 0zM8 6.5H5a3 3 0 0 0 3 3.5M16 6.5h3a3 3 0 0 1-3 3.5M12 13.5v3M8.5 20h7M10 16.5h4l.5 3.5h-5z" />
  </Icon>
);
export const IconSun = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
);
export const IconMoon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
);
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Icon>
);
export const IconStar = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z" />
  </Icon>
);
export const IconSparkle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7z" />
  </Icon>
);
export const IconMic = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
  </Icon>
);
export const IconMicOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.6 2.7M12 17.5V21M8.5 21h7M3 3l18 18" />
  </Icon>
);
