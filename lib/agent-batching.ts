export interface AgentBatchError {
  batchIndex: number;
  message: string;
}

export async function runAgentBatches<TItem, TResult>({
  items,
  batchSize,
  concurrency,
  runBatch,
  fallbackBatch,
}: {
  items: TItem[];
  batchSize: number;
  concurrency: number;
  runBatch: (items: TItem[], batchIndex: number) => Promise<TResult[]>;
  fallbackBatch: (items: TItem[], batchIndex: number, error: unknown) => TResult[] | Promise<TResult[]>;
}): Promise<{ results: TResult[]; errors: AgentBatchError[] }> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be positive");
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be positive");

  const batches = Array.from(
    { length: Math.ceil(items.length / batchSize) },
    (_, index) => items.slice(index * batchSize, (index + 1) * batchSize)
  );
  const outputs: TResult[][] = new Array(batches.length);
  const errors: AgentBatchError[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const batchIndex = cursor++;
      const batch = batches[batchIndex];
      try {
        outputs[batchIndex] = await runBatch(batch, batchIndex);
      } catch (error) {
        errors.push({
          batchIndex,
          message: error instanceof Error ? error.message : String(error),
        });
        outputs[batchIndex] = await fallbackBatch(batch, batchIndex, error);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, () => worker())
  );
  errors.sort((a, b) => a.batchIndex - b.batchIndex);
  return { results: outputs.flat(), errors };
}
