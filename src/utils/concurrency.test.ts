/**
 * Unit tests for mapConcurrent utility
 */
import { describe, it, expect } from 'vitest';
import { mapConcurrent } from './concurrency.js';

describe('mapConcurrent', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapConcurrent(items, async (n) => n * 2, 3);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('returns empty array for empty input', async () => {
    const results = await mapConcurrent([], async (n: number) => n * 2, 3);
    expect(results).toEqual([]);
  });

  it('passes correct index to callback', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const indices: number[] = [];
    await mapConcurrent(
      items,
      async (_item, index) => {
        indices.push(index);
        return index;
      },
      2
    );
    expect(indices.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('respects concurrency limit', async () => {
    let running = 0;
    let maxRunning = 0;
    const concurrency = 3;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapConcurrent(
      items,
      async () => {
        running++;
        if (running > maxRunning) maxRunning = running;
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        running--;
      },
      concurrency
    );

    expect(maxRunning).toBeLessThanOrEqual(concurrency);
  });

  it('propagates errors from callback', async () => {
    const items = [1, 2, 3, 4, 5];
    await expect(
      mapConcurrent(
        items,
        async (n) => {
          if (n === 3) throw new Error('boom');
          return n;
        },
        2
      )
    ).rejects.toThrow('boom');
  });

  it('throws for concurrency < 1', async () => {
    await expect(mapConcurrent([1, 2, 3], async (n) => n, 0)).rejects.toThrow(
      'concurrency must be >= 1'
    );
  });

  it('handles concurrency=1 (sequential)', async () => {
    const order: number[] = [];
    const items = [1, 2, 3, 4, 5];
    const results = await mapConcurrent(
      items,
      async (n) => {
        order.push(n);
        return n * 10;
      },
      1
    );
    expect(results).toEqual([10, 20, 30, 40, 50]);
    // With concurrency=1, items are processed in strict order
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles concurrency > items.length', async () => {
    const items = [1, 2, 3];
    const results = await mapConcurrent(items, async (n) => n + 100, 100);
    expect(results).toEqual([101, 102, 103]);
  });
});
