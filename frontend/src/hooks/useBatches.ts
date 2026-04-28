import { useState, useEffect } from 'react';
import { batchService } from '../services/batch.service';
import { Batch } from '../types';

export function useBatches(farmId: string) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = () => {
    if (!farmId) return;
    setLoading(true);
    batchService
      .getByFarm(farmId)
      .then((r) => setBatches(r.data.data))
      .catch(() => setError('Failed to load batches.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refetch(); }, [farmId]);

  return { batches, loading, error, refetch };
}
