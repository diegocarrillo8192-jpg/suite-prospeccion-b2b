export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-grad)" />
      <circle cx="27" cy="27" r="12" fill="none" stroke="#ffffff" strokeWidth="5" />
      <line x1="36" y1="36" x2="48" y2="48" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
