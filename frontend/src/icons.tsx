// Minimal inline SVG icon set — no external dependency. All inherit currentColor.
interface IProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function Lock({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function LockOpen({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 7.5-1.9" />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function Shield({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}
export function Check({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
export function CheckCircle({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12l2.5 2.5L16 9" />
    </svg>
  );
}
export function Ban({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  );
}
export function Eye({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
export function Wallet({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 9h18" />
      <circle cx="16.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function ArrowUpRight({ size = 16, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M7 17L17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}
export function Spinner({ size = 18, className }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={2.4} className={className}>
      <path d="M12 3a9 9 0 1 0 9 9" opacity="0.9" />
    </svg>
  );
}
export function Bolt({ size = 16, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" />
    </svg>
  );
}

export function Coins({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <ellipse cx="8" cy="6" rx="5" ry="2.4" />
      <path d="M3 6v5c0 1.3 2.2 2.4 5 2.4s5-1.1 5-2.4V6" />
      <path d="M11 13.6c.6 1 2.6 1.8 5 1.8 2.8 0 5-1.1 5-2.4V8" />
      <path d="M16 9.4c2.8 0 5-1.1 5-2.4S18.8 4.6 16 4.6c-1.3 0-2.5.2-3.4.6" />
    </svg>
  );
}
export function Users({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17 14.2A5.5 5.5 0 0 1 20.5 19" />
    </svg>
  );
}
export function Plus({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
export function Trash({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
    </svg>
  );
}

export function Grid({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
export function History({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1" />
      <path d="M3.2 18.5v-4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}
export function Receipt({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M5 3.5h14v17l-2.3-1.4-2.3 1.4-2.4-1.4-2.4 1.4-2.3-1.4L5 20.5z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  );
}
export function EyeOff({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6.5 0 10 6.5 10 6.5a15 15 0 0 1-3.3 4M6.5 6.9A15 15 0 0 0 2 11.5S5.5 18 12 18a9.4 9.4 0 0 0 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
export function TrendingUp({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M3 16l6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </svg>
  );
}
export function ArrowRight({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function Copy({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  );
}
export function LogOut({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
export function ChevronDown({ size = 18, className, strokeWidth = 2 }: IProps) {
  return (
    <svg {...base(size)} strokeWidth={strokeWidth} className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}