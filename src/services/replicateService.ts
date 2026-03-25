const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS      = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function removeBackgroundAPI(file: File): Promise<string> {

  // 1. Upload do arquivo binário direto ao Replicate via Edge Function
  //    — sem conversão para base64, sem limite de tamanho da Netlify Function
  const uploadRes = await fetch('/api/upload-file', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    const payload = await uploadRes.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Erro ${uploadRes.status} no upload da imagem.`);
  }

  const { url: imageUrl } = await uploadRes.json() as { url: string };

  // 2. Inicia a predição no Replicate passando apenas a URL (payload mínimo)
  const startRes = await fetch('/api/start-prediction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  if (!startRes.ok) {
    const payload = await startRes.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Erro ${startRes.status} ao iniciar processamento.`);
  }

  const { id } = await startRes.json() as { id: string };

  // 3. Polling até o resultado ficar pronto
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
