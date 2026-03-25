import type { Config } from "@netlify/edge-functions";

const BIREFNET_VERSION = 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = Deno.env.get('REPLICATE_API_TOKEN');
  if (!token) {
    return new Response(JSON.stringify({ error: 'Token não configurado.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const contentType = request.headers.get('Content-Type') ?? 'application/octet-stream';

  // Recebe o arquivo binário e converte para base64 data URL
  const arrayBuffer = await request.arrayBuffer();
  const bytes       = new Uint8Array(arrayBuffer);
  const binary      = bytes.reduce((s, b) => s + String.fromCharCode(b), '');
  const base64      = btoa(binary);
  const dataUrl     = `data:${contentType};base64,${base64}`;

  // Inicia a predição direto — sem passar pela Files API
  const replicateRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: BIREFNET_VERSION,
      input:   { image: dataUrl },
    }),
  });

  if (!replicateRes.ok) {
    const err = await replicateRes.json().catch(() => ({})) as { detail?: string };
    return new Response(
      JSON.stringify({ error: err.detail ?? `Erro Replicate ${replicateRes.status}` }),
      { status: replicateRes.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const prediction = await replicateRes.json() as { id: string; status: string };

  return new Response(
    JSON.stringify({ id: prediction.id, status: prediction.status }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const config: Config = {
  path: '/api/upload-file',
};
