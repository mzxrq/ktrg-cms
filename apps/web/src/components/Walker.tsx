/** A small walker with a staff: the figure that stands where the visitor is on a rally's trail. Drawn in the colour around it. */
export function Walker({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 34" aria-hidden="true" fill="none" className={className}>
      <circle cx="11" cy="5" r="3.4" fill="currentColor" />
      <path d="M11 9 L10 20 M10 12 L5 17 M10 12 L15 16 M10 20 L6 30 M10 20 L15 30" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 8 L18 31" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
