import type { ComponentType } from 'react';
import { Navigate, Route } from 'react-router-dom';

/**
 * The landing page and its address in each language: / is English, /fr French and /rw Kinyarwanda. /en is not a page, but people
 * will type it, so it goes to the root (the host does this first, this is for the app).
 */
export function landingRoutes(Landing: ComponentType) {
  return (
    <>
      <Route path="/" element={<Landing />} />
      <Route path="/fr" caseSensitive element={<Landing />} />
      <Route path="/rw" caseSensitive element={<Landing />} />
      <Route path="/en" caseSensitive element={<Navigate to="/" replace />} />
    </>
  );
}
