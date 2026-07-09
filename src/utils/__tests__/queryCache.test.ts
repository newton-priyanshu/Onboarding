import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchWithCache,
  invalidateCache,
  invalidateCacheByPrefix,
  clearAllCaches,
  cacheSize,
} from '../queryCache';

describe('queryCache', () => {
  beforeEach(() => {
    clearAllCaches();
  });

  describe('fetchWithCache', () => {
    it('returns data from the fetcher on first call (cache miss)', async () => {
      const fetcher = vi.fn().mockResolvedValue('result-1');
      const result = await fetchWithCache('key-1', fetcher);
      expect(result).toBe('result-1');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('returns cached data on subsequent call (cache hit)', async () => {
      const fetcher = vi.fn().mockResolvedValue('result-1');
      await fetchWithCache('key-1', fetcher);
      const result = await fetchWithCache('key-1', fetcher);
      expect(result).toBe('result-1');
      expect(fetcher).toHaveBeenCalledTimes(1); // Only called once
    });

    it('calls fetcher again after TTL expires', async () => {
      const fetcher = vi.fn().mockResolvedValue('result-1');
      await fetchWithCache('key-ttl', fetcher, { ttl: 10 }); // 10ms TTL

      // Wait for TTL to expire
      await new Promise(r => setTimeout(r, 20));

      const result = await fetchWithCache('key-ttl', fetcher, { ttl: 10 });
      expect(result).toBe('result-1');
      expect(fetcher).toHaveBeenCalledTimes(2); // Called again after TTL
    }, 10000);

    it('caches different keys independently', async () => {
      const fetcherA = vi.fn().mockResolvedValue('A');
      const fetcherB = vi.fn().mockResolvedValue('B');

      const resultA1 = await fetchWithCache('key-a', fetcherA);
      const resultB1 = await fetchWithCache('key-b', fetcherB);
      const resultA2 = await fetchWithCache('key-a', fetcherA);
      const resultB2 = await fetchWithCache('key-b', fetcherB);

      expect(resultA1).toBe('A');
      expect(resultB1).toBe('B');
      expect(resultA2).toBe('A');
      expect(resultB2).toBe('B');
      expect(fetcherA).toHaveBeenCalledTimes(1);
      expect(fetcherB).toHaveBeenCalledTimes(1);
    });

    it('works with synchronous fetchers', async () => {
      const fetcher = vi.fn().mockReturnValue('sync-result');
      const result = await fetchWithCache('sync-key', fetcher);
      expect(result).toBe('sync-result');
    });

    it('uses default TTL of 30 seconds when not specified', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');
      await fetchWithCache('default-ttl', fetcher);
      await fetchWithCache('default-ttl', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('handles fetcher rejection gracefully', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Fetch failed'));
      await expect(fetchWithCache('error-key', fetcher)).rejects.toThrow('Fetch failed');
    });

    it('does not cache when fetcher throws', async () => {
      const fetcher = vi.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockResolvedValueOnce('second success');

      await expect(fetchWithCache('retry-key', fetcher)).rejects.toThrow('First fail');
      const result = await fetchWithCache('retry-key', fetcher);
      expect(result).toBe('second success');
      expect(fetcher).toHaveBeenCalledTimes(2); // Not cached from the failed call
    });
  });

  describe('invalidateCache', () => {
    it('removes a specific key from the cache', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');
      await fetchWithCache('invalidate-me', fetcher);
      invalidateCache('invalidate-me');
      await fetchWithCache('invalidate-me', fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2); // Called again after invalidation
    });

    it('does not affect other keys', async () => {
      const fetcherA = vi.fn().mockResolvedValue('A');
      const fetcherB = vi.fn().mockResolvedValue('B');

      await fetchWithCache('key-a', fetcherA);
      await fetchWithCache('key-b', fetcherB);
      invalidateCache('key-a');
      await fetchWithCache('key-a', fetcherA);
      await fetchWithCache('key-b', fetcherB);

      expect(fetcherA).toHaveBeenCalledTimes(2); // Re-fetched
      expect(fetcherB).toHaveBeenCalledTimes(1); // Still cached
    });
  });

  describe('invalidateCacheByPrefix', () => {
    it('removes all keys matching the prefix', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');

      await fetchWithCache('admin-users', fetcher);
      await fetchWithCache('admin-settings', fetcher);
      await fetchWithCache('other-key', fetcher);

      invalidateCacheByPrefix('admin-');

      await fetchWithCache('admin-users', fetcher);
      await fetchWithCache('admin-settings', fetcher);
      await fetchWithCache('other-key', fetcher);

      expect(fetcher).toHaveBeenCalledTimes(5); // 2 admin keys re-fetched (3rd was cached)
    });

    it('does not remove keys that do not match the prefix', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');

      await fetchWithCache('keep-me', fetcher);
      invalidateCacheByPrefix('delete-');
      await fetchWithCache('keep-me', fetcher);

      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('handles empty cache gracefully', () => {
      expect(() => invalidateCacheByPrefix('nothing-')).not.toThrow();
    });
  });

  describe('clearAllCaches', () => {
    it('removes all cached entries', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');

      await fetchWithCache('key-1', fetcher);
      await fetchWithCache('key-2', fetcher);
      clearAllCaches();

      await fetchWithCache('key-1', fetcher);
      await fetchWithCache('key-2', fetcher);

      expect(fetcher).toHaveBeenCalledTimes(4); // All re-fetched
    });
  });

  describe('cacheSize', () => {
    it('returns 0 for empty cache', () => {
      expect(cacheSize()).toBe(0);
    });

    it('returns the number of cached entries', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');

      await fetchWithCache('key-1', fetcher);
      expect(cacheSize()).toBe(1);

      await fetchWithCache('key-2', fetcher);
      expect(cacheSize()).toBe(2);

      invalidateCache('key-1');
      expect(cacheSize()).toBe(1);

      clearAllCaches();
      expect(cacheSize()).toBe(0);
    });
  });
});
