import { useState, useEffect } from 'react';
import { farmService } from '../services/farm.service';
import { Farm } from '../types';

export function useFarms() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = () => {
    setLoading(true);
    farmService
      .getAll()
      .then((r) => setFarms(r.data.data))
      .catch(() => setError('Failed to load farms.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refetch(); }, []);

  return { farms, loading, error, refetch };
}
