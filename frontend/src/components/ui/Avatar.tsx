/** First letters of the first two names. */
export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]);
  return letters.length ? letters.join('').toUpperCase() : '?';
}

/** A round set of initials. The name is always written beside it, so it is hidden from screen readers. */
export default function Avatar({ name }: { name: string }) {
  return (
    <span className="row-avatar" aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
