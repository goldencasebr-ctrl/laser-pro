import type { Config } from '@netlify/edge-functions';

const BIREFNET_VERSION = 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405);
  }

  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) {
    return jsonResponse({ error: 'REPLICATE_API_TOKEN nao configurado.' }, 500);
  }

  const contentType = request.headers.get('Content-Type') ?? 'application/octet-stream';
  if (!ALLOWED_TYPES.has(contentType)) {
    return jsonResponse({ error: 'Formato nao suportado. Use PNG, JPG ou WEBP.' }, 400);
  }

  const contentLengthHeader = request.headers.get('Content-Length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength && contentLength > MAX_SIZE_BYTES) {
    return jsonResponse({ error: 'Arquivo muito grande. O limite e 10 MB.' }, 413);
  }

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_SIZE_BYTES) {
    return jsonResponse({ error: 'Arquivo muito grande. O limite e 10 MB.' }, 413);
  }

  const bytes = new Uint8Array(arrayBuffer);
  const dataUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;

  const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: BIREFNET_VERSION,
      input: { image: dataUrl },
    }),
  });

  if (!replicateRes.ok) {
    const errorPayload = await replicateRes.json().catch(() => null) as { detail?: string } | null;
    return jsonResponse(
      { error: errorPayload?.detail ?? `Erro Replicate ${replicateRes.status}` },
      replicateRes.status,
    );
  }

  const prediction = await replicateRes.json() as { id: string; status: string };
  return jsonResponse({ id: prediction.id, status: prediction.status }, 200);
};

export const config: Config = {
  path: '/api/upload-file',
};
