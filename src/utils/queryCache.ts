/**
 * queryCache — Simple in-memory query result cache with TTL.
 *
 * Used by dashboard components to avoid redundant Supabase queries
 * when the same data was fetched recently (e.g., on re-mounts or
 * manual refreshes within a short window).
 *
 * @example
 *   const data = await queryCache.fetch(
 *     'admin-worksheets',
 *     () => supabase.from('worksheet_submissions').select('...'),
 *     { ttl: 30_000 }  // 30-second cache
 *   );
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

interface FetchOptions {
  /** Time-to-live in milliseconds. Default 30_000 (30s). */
  ttl?: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Invalidate a specific cache key. Call this after mutations.
 */
export function invalidateCache(key: string): void {
  store.delete(key);
}

/**
 * Invalidate all cache entries whose key starts with the given prefix.
 * Useful when multiple keys share a prefix (e.g., 'admin-').
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/**
 * Fetch data with caching. If a valid cache entry exists, returns it
 * immediately. Otherwise calls the fetcher, stores the result, and returns it.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => T | PromiseLike<T>,
  options: FetchOptions = {}
): Promise<T> {
  const { ttl = 30_000 } = options;
  const now = Date.now();

  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing && now < existing.expiresAt) {
    return existing.data;
  }

  const data = await fetcher();
  store.set(key, { data, expiresAt: now + ttl });
  return data;
}

/**
 * Clear all cached entries.
 */
export function clearAllCaches(): void {
  store.clear();
}

/**
 * Get the number of entries currently in the cache.
 */
export function cacheSize(): number {
  return store.size;
}
