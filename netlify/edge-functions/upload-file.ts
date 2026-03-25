import type { Config } from "@netlify/edge-functions";

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

  // — DIAGNÓSTICO: verifica se o body chega aqui —
  const arrayBuffer = await request.arrayBuffer();

  if (arrayBuffer.byteLength === 0) {
    return new Response(
      JSON.stringify({ error: `DIAG: body chegou VAZIO. Content-Type=${contentType}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Usa Blob — mais confiável no Deno para envio via fetch
  const blob = new Blob([arrayBuffer], { type: contentType });

  const replicateRes = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: blob,
  });

  const responseText = await replicateRes.text();

  if (!replicateRes.ok) {
    return new Response(
      JSON.stringify({
        error: `Replicate ${replicateRes.status}: ${responseText} | bodySize=${arrayBuffer.byteLength}`,
      }),
      { status: replicateRes.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const file = JSON.parse(responseText) as { urls: { get: string } };

  return new Response(JSON.stringify({ url: file.urls.get }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/upload-file',
};
