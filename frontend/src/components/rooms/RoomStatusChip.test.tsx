import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { Room } from '../../types';
import RoomStatusChip from './RoomStatusChip';

const room = (over: Partial<Room> = {}): Room => ({
  id: 'r1', name: 'Room A', notes: '', batchCount: 0, batches: [], devices: [], latestReading: null, createdAt: '',
  approvalStatus: 'approved', reviewNote: '', areaM2: 12, pendingAreaM2: null, ...over,
});

const show = (r: Room) => render(<LanguageProvider><RoomStatusChip room={r} /></LanguageProvider>);

describe('RoomStatusChip', () => {
  it('says a pending room waits for the supervisor', () => {
    show(room({ approvalStatus: 'pending' }));
    expect(screen.getByText('Waiting for your supervisor')).toBeInTheDocument();
  });

  it('says an approved room is approved', () => {
    show(room());
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByText('Size change waiting')).not.toBeInTheDocument();
  });

  it('shows the reason for a rejected room', () => {
    show(room({ approvalStatus: 'rejected', reviewNote: 'Too small for a batch' }));
    expect(screen.getByText('Not approved: Too small for a batch')).toBeInTheDocument();
  });

  it('shows a note as plain text, never as markup', () => {
    const { container } = show(room({ approvalStatus: 'rejected', reviewNote: '<b>x</b>' }));
    expect(screen.getByText('Not approved: <b>x</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('adds a second chip for a size change that waits on an approved room', () => {
    show(room({ pendingAreaM2: 20 }));
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Size change waiting')).toBeInTheDocument();
  });
});
