// --- Request queue: ensures only one call runs at a time on the client side ---
type Task = () => Promise<void>;

let isProcessing = false;
const queue: Task[] = [];

function drainQueue(): void {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  const task = queue.shift()!;
  task().finally(() => {
    isProcessing = false;
    drainQueue();
  });
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    drainQueue();
  });
}

// --- Timeout para todas as chamadas ao proxy ---
const TIMEOUT_MS = 120_000; // 2 min (inclui retry + delay no backend)

// --- Tipos públicos ---
export type RemoveBackgroundResult = {
  image: string;
  source: 'google';
  apiKeyUsed: string; // 'KEY_1' | 'KEY_2'
};

// --- Chamada genérica (generate-matrix, retouch-matrix) ---
async function callProxy(endpoint: string, body: object): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Erro ${response.status} no servidor.`);
    }

    const data = await response.json() as { result: string };
    return data.result;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido. A IA demorou demais para responder. Tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- Chamada específica: remoção de fundo (retorna source + apiKeyUsed) ---
async function callProxyRemoveBg(body: object): Promise<RemoveBackgroundResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('/api/remove-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error ?? `Erro ${response.status} no servidor.`);
    }

    const data = await response.json() as { source: 'google'; apiKeyUsed: string; image: string };
    if (!data.image) throw new Error('Resposta inválida: nenhuma imagem recebida.');

    return { image: data.image, source: data.source, apiKeyUsed: data.apiKeyUsed };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('Tempo limite excedido. Tente novamente.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- Helper: arquivo → base64 ---
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
  });
}

// --- API pública ---

export const removeBackgroundAPI = (file: File): Promise<RemoveBackgroundResult> =>
  enqueue(async () => {
    const imageBase64 = await fileToBase64(file);
    return callProxyRemoveBg({ imageBase64, mimeType: file.type });
  });

export const generateMatrixAPI = (file: File, customPrompt?: string): Promise<string> =>
  enqueue(async () => {
    const imageBase64 = await fileToBase64(file);
    return callProxy('/api/generate-matrix', { imageBase64, mimeType: file.type, customPrompt });
  });

export const retouchMatrixAPI = (currentImageBase64: string, retouchPrompt: string): Promise<string> =>
  enqueue(async () => {
    const imageBase64 = currentImageBase64.startsWith('data:')
      ? currentImageBase64.split(',')[1]
      : currentImageBase64;
    return callProxy('/api/retouch-matrix', { imageBase64, retouchPrompt });
  });
