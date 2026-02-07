/**
 * Concurrency Utilities
 * Bounded-concurrency parallel processing for async operations.
 */

/**
 * Map over items with bounded concurrency (chunked Promise.all).
 *
 * Unlike a plain `Promise.all(items.map(fn))` which starts ALL promises
 * simultaneously (risking memory exhaustion on large inputs), this function
 * processes items in chunks of `concurrency` size, waiting for each chunk
 * to complete before starting the next.
 *
 * Conceptually equivalent to RxJS `mergeMap(fn, concurrency)`.
 *
 * @param items - Input items to process
 * @param fn - Async function to apply to each item (receives item and its index)
 * @param concurrency - Maximum number of concurrent promises (default: 10)
 * @returns Results array in the same order as input items
 */
export async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number = 10
): Promise<R[]> {
  if (items.length === 0) return [];
  if (concurrency < 1) {
    throw new Error('concurrency must be >= 1');
  }

  const results: R[] = new Array(items.length);

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map((item, j) => fn(item, i + j)));
    for (let j = 0; j < chunkResults.length; j++) {
      results[i + j] = chunkResults[j];
    }
  }

  return results;
}
