import api from './api';
import { ApiResponse } from '../types';

export interface Place {
  code: string;
  name: string;
}

/**
 * The part of an address a point on the map can fill in. The cell comes when the village outlines hold the point,
 * and the village only when the data is sure which village it is.
 */
export interface LocatedPlace {
  province: Place;
  district: Place;
  sector: Place;
  cell?: Place;
  village?: Place;
}

export const locationService = {
  /** The places directly under `parent`. Without a parent, the provinces. */
  getPlaces: (parent?: string) =>
    api.get<ApiResponse<Place[]>>('/locations', { params: parent ? { parent } : {} }),

  /** The place a point is in, down to the village where the data allows. A 404 means it is not inside a Rwanda sector. */
  locate: (lat: number, lng: number) =>
    // Sent in the body, so the point never appears in an address that a proxy might log.
    api.post<ApiResponse<LocatedPlace>>('/locations/locate', { lat, lng }),
};
