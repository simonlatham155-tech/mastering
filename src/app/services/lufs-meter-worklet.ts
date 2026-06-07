/**
 * Shared BS.1770 LUFS meter worklet loader (live + offline contexts).
 * Serializes addModule calls to avoid browser hangs from concurrent worklet loads.
 */

const moduleLoadedForContext = new WeakMap<BaseAudioContext, Promise<void>>();

/** One worklet addModule at a time — concurrent loads have caused 5s+ hangs. */
let globalLoadChain: Promise<void> = Promise.resolve();

export function lufsMeterWorkletUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}worklets/lufs-metering-processor.js`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    }),
  ]);
}

function enqueueWorkletLoad(task: () => Promise<void>): Promise<void> {
  const run = globalLoadChain.then(task, task);
  globalLoadChain = run.catch(() => undefined);
  return run;
}

export interface EnsureLufsMeterWorkletOptions {
  moduleLoadTimeoutMs?: number;
  retries?: number;
}

/**
 * Load lufs-metering-processor into a context (deduped per context, serialized globally).
 */
export async function ensureLufsMeterWorkletModule(
  context: BaseAudioContext,
  options: EnsureLufsMeterWorkletOptions = {}
): Promise<void> {
  const timeoutMs = options.moduleLoadTimeoutMs ?? 15_000;
  const retries = options.retries ?? 1;

  let loadPromise = moduleLoadedForContext.get(context);
  if (loadPromise) {
    await withTimeout(loadPromise, timeoutMs, 'LUFS worklet load');
    return;
  }

  loadPromise = enqueueWorkletLoad(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await withTimeout(
          context.audioWorklet.addModule(lufsMeterWorkletUrl()),
          timeoutMs,
          'LUFS worklet load'
        );
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  });

  moduleLoadedForContext.set(context, loadPromise);

  try {
    await loadPromise;
  } catch (err) {
    moduleLoadedForContext.delete(context);
    throw err;
  }
}

/** Warm the worklet script cache before addModule (e.g. on first page load). */
export function preloadLufsMeterWorkletScript(): void {
  const url = lufsMeterWorkletUrl();
  void fetch(url, { cache: 'force-cache' }).catch(() => undefined);
}
