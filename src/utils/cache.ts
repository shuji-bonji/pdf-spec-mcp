/**
 * LRU Cache
 * Size-limited Least Recently Used cache implementation
 */

export interface CacheOptions {
  maxSize?: number;
  debug?: boolean;
  name?: string;
}

export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;
  private readonly debug: boolean;
  private readonly name: string;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? 50;
    this.debug = options.debug ?? false;
    this.name = options.name ?? 'LRUCache';
    this.cache = new Map();
  }

  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    if (this.debug) {
      console.error(`[${this.name}] Cache hit: ${String(key)}`);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
