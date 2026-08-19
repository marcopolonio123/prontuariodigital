import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function I({ size = 20, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function LogoMark({ size = 26, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      <path d="M12 2.4l7.6 2.9v6.1c0 5.1-3.2 8.6-7.6 10.2C7.6 20 4.4 16.5 4.4 11.4V5.3L12 2.4z" fill="currentColor" opacity="0.16" />
      <path d="M12 2.4l7.6 2.9v6.1c0 5.1-3.2 8.6-7.6 10.2C7.6 20 4.4 16.5 4.4 11.4V5.3L12 2.4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6.8 11.6h2.4l1.2-2.5 2.1 5 1.2-2.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const IconFace = (p: IconProps) => (
  <I {...p}>
    <path d="M4 8V6.5A2.5 2.5 0 0 1 6.5 4H8" />
    <path d="M16 4h1.5A2.5 2.5 0 0 1 20 6.5V8" />
    <path d="M20 16v1.5a2.5 2.5 0 0 1-2.5 2.5H16" />
    <path d="M8 20H6.5A2.5 2.5 0 0 1 4 17.5V16" />
    <path d="M9 10h.01M15 10h.01" strokeWidth={2.4} />
    <path d="M9.4 14.4c.8.7 1.7 1 2.6 1s1.8-.3 2.6-1" />
  </I>
);

export const IconFingerprint = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3.6c-4.6 0-8.4 3.7-8.4 8.3 0 2.7-.4 4.7-1 6.1" />
    <path d="M12 6.6a5.4 5.4 0 0 0-5.4 5.4c0 2.8-.5 4.9-1.3 6.5" />
    <path d="M12 9.6a2.4 2.4 0 0 0-2.4 2.4c0 2.7-.6 4.9-1.6 6.7" />
    <path d="M12 3.6c4.6 0 8.4 3.7 8.4 8.3 0 2.7.4 4.7 1 6.1" />
    <path d="M12 6.6a5.4 5.4 0 0 1 5.4 5.4c0 2.8.5 4.9 1.3 6.5" />
    <path d="M12 9.6a2.4 2.4 0 0 1 2.4 2.4c0 2.7.6 4.9 1.6 6.7" />
    <path d="M12 12.6v2.6c0 2.2-.4 4.1-1.2 5.7" />
  </I>
);

export const IconUsers = (p: IconProps) => (
  <I {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </I>
);

export const IconChart = (p: IconProps) => (
  <I {...p}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2 2.8h7.4A2.5 2.5 0 0 1 21 10.3v7.2a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <path d="M6.8 14.6h2.1l1.3-2.5 1.9 4.6 1.3-2.1h3.8" />
  </I>
);

export const IconGear = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
  </I>
);

export const IconPlus = (p: IconProps) => (
  <I {...p}><path d="M12 5v14M5 12h14" /></I>
);

export const IconCamera = (p: IconProps) => (
  <I {...p}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3.4" />
  </I>
);

export const IconUpload = (p: IconProps) => (
  <I {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5M12 3v12" />
  </I>
);

export const IconDownload = (p: IconProps) => (
  <I {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </I>
);

export const IconX = (p: IconProps) => (
  <I {...p}><path d="M18 6L6 18M6 6l12 12" /></I>
);

export const IconCheck = (p: IconProps) => (
  <I {...p}><path d="M20 6L9 17l-5-5" /></I>
);

export const IconTrash = (p: IconProps) => (
  <I {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </I>
);

export const IconArchive = (p: IconProps) => (
  <I {...p}>
    <rect x="2" y="4" width="20" height="5" rx="1" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </I>
);

export const IconPencil = (p: IconProps) => (
  <I {...p}>
    <path d="M17 3.5a2.6 2.6 0 0 1 3.7 3.7L7.5 20.4 2 22l1.6-5.5L16.8 3.3z" />
    <path d="M14.5 5.8l3.7 3.7" />
  </I>
);

export const IconSearch = (p: IconProps) => (
  <I {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </I>
);

export const IconChevronRight = (p: IconProps) => (
  <I {...p}><path d="M9 18l6-6-6-6" /></I>
);

export const IconChevronLeft = (p: IconProps) => (
  <I {...p}><path d="M15 18l-6-6 6-6" /></I>
);

export const IconArrowRight = (p: IconProps) => (
  <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>
);

export const IconAlert = (p: IconProps) => (
  <I {...p}>
    <path d="M10.3 3.9L1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4.5M12 17.5h.01" />
  </I>
);

export const IconInfo = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4.5M12 8h.01" />
  </I>
);

export const IconActivity = (p: IconProps) => (
  <I {...p}><path d="M22 12h-3.4l-2.8 7.4L9.2 4.6 6.4 12H2" /></I>
);

export const IconShield = (p: IconProps) => (
  <I {...p}>
    <path d="M12 22s8-3.6 8-10V5.2L12 2 4 5.2V12c0 6.4 8 10 8 10z" />
    <path d="M8.8 11.6l2.2 2.2 4.2-4.4" />
  </I>
);

export const IconClock = (p: IconProps) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.2 2" />
  </I>
);

export const IconLock = (p: IconProps) => (
  <I {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    <path d="M12 15v2.5" />
  </I>
);

export const IconPaperclip = (p: IconProps) => (
  <I {...p}>
    <path d="M20.5 11.5l-8 8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </I>
);

export const IconChevronDown = (p: IconProps) => (
  <I {...p}>
    <path d="M6 9l6 6 6-6" />
  </I>
);

export const IconPrescription = (p: IconProps) => (
  <I {...p}>
    <path d="M6 3h6a4 4 0 0 1 0 8H6V3z" />
    <path d="M6 11v10" />
    <path d="M12.5 14.5l6 6M18.5 14.5l-6 6" />
  </I>
);

export const IconDroplet = (p: IconProps) => (
  <I {...p}><path d="M12 2.9S6.2 9.3 6.2 13.6a5.8 5.8 0 0 0 11.6 0C17.8 9.3 12 2.9 12 2.9z" /></I>
);

export const IconCalendar = (p: IconProps) => (
  <I {...p}>
    <rect x="3" y="4.5" width="18" height="17" rx="2" />
    <path d="M8 2.5v4M16 2.5v4M3 10h18" />
  </I>
);

export const IconSyringe = (p: IconProps) => (
  <I {...p}>
    <path d="M18 2l4 4" />
    <path d="M19.5 4.5L8.4 15.6a2 2 0 0 1-1.1.6l-3.6.6.6-3.6a2 2 0 0 1 .6-1.1L16 1" transform="translate(0 2)" />
    <path d="M9.5 11.5l2 2M12.5 8.5l2 2" />
    <path d="M3.5 20.5L2 22" />
  </I>
);

export const IconPill = (p: IconProps) => (
  <I {...p}>
    <path d="M10.2 3.6a5 5 0 0 1 7.1 7.1l-6.6 6.6a5 5 0 0 1-7.1-7.1l6.6-6.6z" />
    <path d="M6.9 6.9l7.1 7.1" />
  </I>
);

export const IconStetho = (p: IconProps) => (
  <I {...p}>
    <path d="M5 3v5.5a4.5 4.5 0 0 0 9 0V3" />
    <path d="M9.5 13v3.5a4.5 4.5 0 0 0 9 0v-2.1" />
    <circle cx="18.5" cy="11.5" r="2.4" />
  </I>
);

export const IconFlask = (p: IconProps) => (
  <I {...p}>
    <path d="M10 2.5v6L4.4 18.2A1.9 1.9 0 0 0 6.1 21h11.8a1.9 1.9 0 0 0 1.7-2.8L14 8.5v-6" />
    <path d="M8.3 2.5h7.4M7.2 15h9.6" />
  </I>
);

export const IconFileText = (p: IconProps) => (
  <I {...p}>
    <path d="M14 2.5H6a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5l-6-6z" />
    <path d="M14 2.5v6h6M9 13h6M9 17h6" />
  </I>
);

export const IconMic = (p: IconProps) => (
  <I {...p}>
    <path d="M12 2.5a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0v-6a3 3 0 0 1 3-3z" />
    <path d="M19 11.5v.5a7 7 0 0 1-14 0v-.5" />
    <path d="M12 19v2.5M8.5 21.5h7" />
  </I>
);

export const IconCreditCard = (p: IconProps) => (
  <I {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19" />
    <path d="M6 15h4.5" />
  </I>
);

export const IconRefresh = (p: IconProps) => (
  <I {...p}>
    <path d="M3 12a9 9 0 0 1 15.3-6.4L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.3 6.4L3 16" />
    <path d="M3 21v-5h5" />
  </I>
);

export const IconDatabase = (p: IconProps) => (
  <I {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3" />
    <path d="M4 5.5v13c0 1.66 3.6 3 8 3s8-1.34 8-3v-13" />
    <path d="M4 12c0 1.66 3.6 3 8 3s8-1.34 8-3" />
  </I>
);

export const IconMapPin = (p: IconProps) => (
  <I {...p}>
    <path d="M20 10.4c0 5.8-8 11.6-8 11.6s-8-5.8-8-11.6a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10.4" r="3" />
  </I>
);

export const IconPhone = (p: IconProps) => (
  <I {...p}>
    <path d="M21 16.9v2.6a1.9 1.9 0 0 1-2.1 1.9 18.9 18.9 0 0 1-8.2-2.9 18.6 18.6 0 0 1-5.7-5.7A18.9 18.9 0 0 1 2.1 4.6 1.9 1.9 0 0 1 4 2.5h2.6a1.9 1.9 0 0 1 1.9 1.6c.12.94.34 1.86.66 2.74a1.9 1.9 0 0 1-.43 2L7.6 10a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.43c.88.32 1.8.54 2.74.66a1.9 1.9 0 0 1 1.66 1.97z" />
  </I>
);

export const IconMessage = (p: IconProps) => (
  <I {...p}>
    <path d="M21 12.5a8 8 0 0 1-8 8 8.4 8.4 0 0 1-3.6-.8L3 21l1.3-6.4A8 8 0 1 1 21 12.5z" />
    <path d="M8.5 12.5h.01M12 12.5h.01M15.5 12.5h.01" strokeWidth={2.4} />
  </I>
);

export const IconBell = (p: IconProps) => (
  <I {...p}>
    <path d="M18 9a6 6 0 1 0-12 0c0 6.3-2.5 8-2.5 8h17S18 15.3 18 9z" />
    <path d="M10.3 20.5a2 2 0 0 0 3.4 0" />
  </I>
);

export const IconEye = (p: IconProps) => (
  <I {...p}>
    <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </I>
);

export const IconBrain = (p: IconProps) => (
  <I {...p}>
    <path d="M9.5 2.5A2.5 2.5 0 0 0 7 5v.3A3 3 0 0 0 4 8.3c0 .8.3 1.5.8 2A3.2 3.2 0 0 0 3.5 13a3.2 3.2 0 0 0 1.6 2.8A2.8 2.8 0 0 0 7.9 21.5a2.7 2.7 0 0 0 4.1-2.4V5A2.5 2.5 0 0 0 9.5 2.5z" />
    <path d="M14.5 2.5A2.5 2.5 0 0 1 17 5v.3A3 3 0 0 1 20 8.3c0 .8-.3 1.5-.8 2A3.2 3.2 0 0 1 20.5 13a3.2 3.2 0 0 1-1.6 2.8 2.8 2.8 0 0 1-2.8 5.7 2.7 2.7 0 0 1-4.1-2.4V5A2.5 2.5 0 0 1 14.5 2.5z" />
  </I>
);

export const IconSparkles = (p: IconProps) => (
  <I {...p}>
    <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </I>
);

export const IconSend = (p: IconProps) => (
  <I {...p}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </I>
);

export const IconLogout = (p: IconProps) => (
  <I {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </I>
);

export const IconShare = (p: IconProps) => (
  <I {...p}>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
  </I>
);

export const IconSpinner = ({ size = 20, className = '', ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`spin ${className}`} aria-hidden="true" {...rest}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);
