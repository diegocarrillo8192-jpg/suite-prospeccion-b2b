import { useId } from "react";

export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gradientId})`} />
      <circle cx="28" cy="28" r="11.5" fill="none" stroke="#ffffff" strokeWidth="5" />
      <line x1="36.5" y1="36.5" x2="47" y2="47" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="28" cy="28" r="3.5" fill="#ffffff" />
    </svg>
  );
}
