/**
 * Where the map pictures come from. The default is OpenStreetMap's free server, which is meant for light use and asks for
 * the credit line below. To use another provider, set both values in the environment. Nothing else needs to change.
 *
 * The browser asks this server for map pictures, so it sees the viewer's address and the area being looked at. It is
 * never sent a farm's name or position: the pins are drawn here, in the browser.
 */
export const TILE_URL: string =
  (import.meta.env.VITE_MAP_TILES_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const TILE_ATTRIBUTION: string =
  (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined)
  || '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/** The middle of Rwanda, for when no farm has a position. */
export const RWANDA_CENTRE: [number, number] = [-1.94, 29.87];
export const RWANDA_ZOOM = 8;
