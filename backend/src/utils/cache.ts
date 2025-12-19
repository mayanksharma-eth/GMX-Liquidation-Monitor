import { CacheEntry } from '../types';

export class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlSeconds: number = 15) {
    this.ttlMs = ttlSeconds * 1000;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clear(): void {
    this.cache.clear();
  }
}
