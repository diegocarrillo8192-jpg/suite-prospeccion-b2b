export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const size = Math.max(1, Math.min(limit, items.length));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  const results = new Array<R>(items.length);
  let cursor = 0;

  await batches.reduce(
    (chain, batch) =>
      chain.then(() =>
        Promise.all(batch.map((item) => fn(item))).then((values) => {
          const start = cursor;
          cursor += values.length;
          for (let index = 0; index < values.length; index++) {
            results[start + index] = values[index];
          }
        })
      ),
    Promise.resolve()
  );

  return results;
}
