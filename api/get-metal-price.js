export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const apiKey = 'trust-me-123';
    const apiUrl = `https://services.bajracharyajyaasa.com/get-metal-prices.php?symbol=${symbol}&api_key=${apiKey}`;

    console.log(`[PROXY] Calling: ${apiUrl}`);

    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
      console.error('[PROXY] API Error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('[PROXY] Error:', error);
    return res.status(500).json({
      error: 'Proxy error',
      details: error.message
    });
  }
}