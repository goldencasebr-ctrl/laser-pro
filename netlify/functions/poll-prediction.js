exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Parâmetro id ausente.' }) };
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'REPLICATE_API_TOKEN não configurado.' }),
    };
  }

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return { statusCode: response.status, body: JSON.stringify({ error: text }) };
  }

  const prediction = await response.json();

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
    }),
  };
};
