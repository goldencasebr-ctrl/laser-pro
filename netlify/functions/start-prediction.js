exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'REPLICATE_API_TOKEN não configurado.' }),
    };
  }

  let imageBase64, mimeType;
  try {
    ({ imageBase64, mimeType } = JSON.parse(event.body || '{}'));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Body inválido.' }) };
  }

  if (!imageBase64 || !mimeType) {
    return { statusCode: 400, body: JSON.stringify({ error: 'imageBase64 e mimeType são obrigatórios.' }) };
  }

  // Busca o ID da versão mais recente do modelo rembg
  const modelRes = await fetch('https://api.replicate.com/v1/models/cjwbw/rembg/versions', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!modelRes.ok) {
    const text = await modelRes.text();
    return { statusCode: modelRes.status, body: JSON.stringify({ error: `Erro ao buscar versão do modelo: ${text}` }) };
  }

  const { results } = await modelRes.json();
  const versionId = results[0].id;

  // Cria a predição com a versão correta
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: versionId,
      input: {
        image: `data:${mimeType};base64,${imageBase64}`,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return { statusCode: response.status, body: JSON.stringify({ error: text }) };
  }

  const prediction = await response.json();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: prediction.id, status: prediction.status }),
  };
};
