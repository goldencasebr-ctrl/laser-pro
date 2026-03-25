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
  const rawName    = request.headers.get('X-File-Name') ?? 'image.jpg';
  // Remove caracteres especiais do nome do arquivo
  const fileName   = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Lê o body como Uint8Array — mais confiável que ArrayBuffer no Deno
  const bytes = new Uint8Array(await request.arrayBuffer());

  // Content-Length é header proibido na Fetch API — o Deno calcula automaticamente
  const replicateRes = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      Authorization:         `Bearer ${token}`,
      'Content-Type':        contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
    body: bytes,
  });

  if (!replicateRes.ok) {
    const err = await replicateRes.json().catch(() => ({})) as { detail?: string };
    return new Response(
      JSON.stringify({ error: err.detail ?? `Falha no upload (${replicateRes.status}).` }),
      { status: replicateRes.status, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const file = await replicateRes.json() as { urls: { get: string } };

  return new Response(JSON.stringify({ url: file.urls.get }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/upload-file',
};
