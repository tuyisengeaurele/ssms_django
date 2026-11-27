import type { AnnouncementKind } from '../../types';

/** The word for each type, in the order a person picks from. */
export const KIND_WORDS: Record<AnnouncementKind, string> = {
  information: 'annInformation',
  maintenance: 'annMaintenance',
  urgent: 'annUrgent',
};
