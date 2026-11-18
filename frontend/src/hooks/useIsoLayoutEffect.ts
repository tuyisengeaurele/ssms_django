import { useEffect, useLayoutEffect } from 'react';

/**
 * A layout effect in the browser, where it runs before the first paint. The build that writes the landing page renders it on a
 * server, where a layout effect does nothing and React warns about it, so there it is a plain effect, which does nothing either.
 */
export const useIsoLayoutEffect = import.meta.env.SSR ? useEffect : useLayoutEffect;
