const BIREFNET_VERSION = 'f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7';

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
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'imageBase64 e mimeType são obrigatórios.' }),
    };
  }

  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: BIREFNET_VERSION,
      input: {
        image: `data:${mimeType};base64,${imageBase64}`,
        // resolution omitido → saída na resolução original da imagem
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
