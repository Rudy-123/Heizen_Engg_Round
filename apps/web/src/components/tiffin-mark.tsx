/**
 * The Fernleaf logo: a tiffin carrier, the stacked lunch box that takes meals to offices.
 * Drawn for a teal tile; the body is cream and the side clamps are terracotta.
 */
export function TiffinMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M11 9.5C11 4 21 4 21 9.5"
        fill="none"
        stroke="#fbf6ee"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect x="9.5" y="8.5" width="13" height="3.6" rx="1.8" fill="#fbf6ee" />
      <rect x="8" y="13" width="16" height="4.8" rx="2.2" fill="#fbf6ee" />
      <rect x="8" y="18.6" width="16" height="4.8" rx="2.2" fill="#fbf6ee" fillOpacity="0.86" />
      <rect x="8" y="24.2" width="16" height="4.8" rx="2.2" fill="#fbf6ee" fillOpacity="0.72" />
      <rect x="6.1" y="12.4" width="1.9" height="17.2" rx="0.95" className="fill-terracotta" />
      <rect x="24" y="12.4" width="1.9" height="17.2" rx="0.95" className="fill-terracotta" />
    </svg>
  );
}
