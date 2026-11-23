/** A number as the server keeps it (+250 and nine digits) written the way a person writes it: 0788 123 456. Anything else is returned as it is. */
export function formatRwandaMobile(stored: string | null | undefined): string {
  if (!stored) return '';
  const match = /^\+250(\d{3})(\d{3})(\d{3})$/.exec(stored);
  return match ? `0${match[1]} ${match[2]} ${match[3]}` : stored;
}
