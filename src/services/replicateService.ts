const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 120_000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function removeBackgroundAPI(file: File): Promise<string> {
  const imageBase64 = await fileToBase64(file);

  // 1. Inicia a predição no Replicate
  const startRes = await fetch('/api/start-prediction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: file.type }),
  });

  if (!startRes.ok) {
    const payload = await startRes.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Erro ${startRes.status} ao iniciar processamento.`);
  }

  const { id } = await startRes.json() as { id: string };

  // 2. Polling até o resultado ficar pronto
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(`/api/poll-prediction?id=${id}`);
    if (!pollRes.ok) continue;

    const { status, output, error } = await pollRes.json() as {
      status: string;
      output: string | null;
      error: string | null;
    };

    if (status === 'succeeded') {
      if (!output) throw new Error('Processamento concluído mas sem resultado.');
      return output;
    }

    if (status === 'failed' || status === 'canceled') {
      throw new Error(error ?? 'Falha na remoção de fundo. Tente novamente.');
    }

    // status: 'starting' | 'processing' → continua polling
  }

  throw new Error('Tempo limite excedido. Tente novamente.');
}
