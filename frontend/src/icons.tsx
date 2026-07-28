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