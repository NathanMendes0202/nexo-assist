import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const CheckIcon = (p: P) => (
  <Svg {...p}><path d="M3.5 8.5l3 3 6-6.5" /></Svg>
);
export const AlertIcon = (p: P) => (
  <Svg {...p}><path d="M8 5v3.5M8 11h.01" /><path d="M7.1 2.6L1.8 12a1 1 0 00.9 1.5h10.6a1 1 0 00.9-1.5L8.9 2.6a1 1 0 00-1.8 0z" /></Svg>
);
export const CrossIcon = (p: P) => (
  <Svg {...p}><path d="M4 4l8 8M12 4l-8 8" /></Svg>
);
export const ChevronRightIcon = (p: P) => (
  <Svg {...p}><path d="M6 3.5L10.5 8 6 12.5" /></Svg>
);
export const SendIcon = (p: P) => (
  <Svg {...p}><path d="M14 2L7 9M14 2l-4.5 12-2.5-5.5L1.5 6 14 2z" /></Svg>
);
export const ChatIcon = (p: P) => (
  <Svg {...p}><path d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v4.5a2 2 0 01-2 2H7l-3 2.5V11a2 2 0 01-1.5-2z" /></Svg>
);
export const UserIcon = (p: P) => (
  <Svg {...p}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5" /></Svg>
);
export const LogoutIcon = (p: P) => (
  <Svg {...p}><path d="M6.5 2.5h-3v11h3M10 5l3 3-3 3M13 8H6.5" /></Svg>
);
export const PlusIcon = (p: P) => (
  <Svg {...p}><path d="M8 3v10M3 8h10" /></Svg>
);
export const SparkIcon = (p: P) => (
  <Svg {...p}><path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12l-1.4-3.6L3 7l3.6-1.4z" /></Svg>
);

export const SearchIcon = (p: P) => (
  <Svg {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></Svg>
);
export const PauseIcon = (p: P) => (
  <Svg {...p}><path d="M5.5 3.5v9M10.5 3.5v9" /></Svg>
);
export const ReturnIcon = (p: P) => (
  <Svg {...p}><path d="M6 3L2.5 6.5 6 10M2.5 6.5H10a3.5 3.5 0 010 7H7" /></Svg>
);
export const HeadsetIcon = (p: P) => (
  <Svg {...p}><path d="M2.5 9V8a5.5 5.5 0 0111 0v1" /><rect x="2" y="9" width="3" height="4.5" rx="1" /><rect x="11" y="9" width="3" height="4.5" rx="1" /></Svg>
);

export function NexoMark({ size = 24, tone = 'light' }: { size?: number; tone?: 'light' | 'blue' }) {
  const front = tone === 'light' ? '#FFFFFF' : '#037AF6';
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 28 25" fill="none" aria-hidden="true">
      <rect width="28" height="24.7" rx="6" fill={front} fillOpacity={tone === 'light' ? 0.7 : 0.25} />
      <path d="M6 18V7l8 7V7M22 7v11" stroke={front} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
