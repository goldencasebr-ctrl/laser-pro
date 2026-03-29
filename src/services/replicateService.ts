const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 120_000;

export type RemoveBackgroundOptions = {
  signal?: AbortSignal;
};

function createAbortError(): Error {
  const error = new Error('Operacao cancelada.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null) as {
    error?: string;
    detail?: string;
  } | null;

  if (payload?.error) return payload.error;
  if (payload?.detail) return payload.detail;
  return fallback;
}

function normalizePredictionOutput(output: unknown): string | null {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) {
    const firstOutput = output.find((value): value is string => typeof value === 'string');
    return firstOutput ?? null;
  }
  return null;
}

export async function removeBackgroundAPI(
  file: File,
  options: RemoveBackgroundOptions = {},
): Promise<string> {
  const { signal } = options;
  throwIfAborted(signal);

  const startRes = await fetch('/api/upload-file', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
    signal,
  });

  if (!startRes.ok) {
    throw new Error(await readErrorMessage(startRes, `Erro ${startRes.status} ao iniciar processamento.`));
  }

  const { id } = await startRes.json() as { id: string };
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    throwIfAborted(signal);
    await sleep(POLL_INTERVAL_MS, signal);

    const pollRes = await fetch(`/api/poll-prediction?id=${id}`, { signal });
    if (!pollRes.ok) {
      throw new Error(await readErrorMessage(pollRes, `Erro ${pollRes.status} ao consultar processamento.`));
    }

    const { status, output, error } = await pollRes.json() as {
      status: string;
      output: unknown;
      error: string | null;
    };

    if (status === 'succeeded') {
      const normalizedOutput = normalizePredictionOutput(output);
      if (!normalizedOutput) {
        throw new Error('Processamento concluido, mas sem resultado valido.');
      }
      return normalizedOutput;
    }

    if (status === 'failed' || status === 'canceled') {
      throw new Error(error ?? 'Falha na remocao de fundo. Tente novamente.');
    }
  }

  throw new Error('Tempo limite excedido. Tente novamente.');
}
