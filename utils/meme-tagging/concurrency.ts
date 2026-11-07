/** Map over items with at most `limit` promises in flight, preserving input order. */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;

  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T, index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
};
