import api from './api';
import { ApiResponse } from '../types';

export interface Place {
  code: string;
  name: string;
}

/** The part of an address a point on the map can fill in. Cells and villages have no outlines, so they are not here. */
export interface LocatedPlace {
  province: Place;
  district: Place;
  sector: Place;
}

export const locationService = {
  /** The places directly under `parent`. Without a parent, the provinces. */
  getPlaces: (parent?: string) =>
    api.get<ApiResponse<Place[]>>('/locations', { params: parent ? { parent } : {} }),

  /** The province, district and sector a point is in. A 404 means it is not inside a Rwanda sector. */
  locate: (lat: number, lng: number) =>
    // Sent in the body, so the point never appears in an address that a proxy might log.
    api.post<ApiResponse<LocatedPlace>>('/locations/locate', { lat, lng }),
};
