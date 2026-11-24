import { useEffect, useState } from 'react';

/** First letters of the first two names. */
export function initialsOf(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]);
  return letters.length ? letters.join('').toUpperCase() : '?';
}

/** A picture of ours (`/api/photos/<token>`), the preview of a file the person just chose (`blob:`), or a picture on https. Anything else is not drawn. */
const SAFE_SOURCE = /^(?:\/api\/photos\/[\w-]+|blob:https?:\/\/[\w.:-]+\/[\w-]+|https:\/\/[\w.-]+(?::\d+)?\/[\w./%-]*)$/;

/** The address to draw, or null. The address comes from the server and from the browser, and an image tag is only given one that is known to be a picture. */
export function safePhotoSource(url?: string | null): string | null {
  return url && SAFE_SOURCE.test(url) ? url : null;
}

interface Props {
  name: string;
  /** The person's photo, when they have one and the viewer may see it. */
  photoUrl?: string | null;
  /** The circle it sits in: the small one in lists by default, or `identity-avatar` and `topbar-avatar`. */
  className?: string;
}

/**
 * A round photo, or the initials when there is none or it cannot be loaded. The name is always written beside it, so it is
 * hidden from screen readers.
 */
export default function Avatar({ name, photoUrl, className = 'row-avatar' }: Props) {
  const [failed, setFailed] = useState(false);

  // A new photo gets another chance, after one that could not be loaded.
  useEffect(() => { setFailed(false); }, [photoUrl]);

  const source = safePhotoSource(photoUrl);

  return (
    <span className={className} aria-hidden="true">
      {source && !failed ? <img src={source} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} /> : initialsOf(name)}
    </span>
  );
}
