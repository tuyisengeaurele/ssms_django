import { Room } from '../types';

/** Only an approved room can hold a batch or a sensor. */
export const usableRooms = (rooms: Room[]): Room[] => rooms.filter((r) => r.approvalStatus === 'approved');
