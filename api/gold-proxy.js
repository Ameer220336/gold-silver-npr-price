export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the API key from environment variables
    const apiKey = process.env.VITE_GOLD_API_SECRET;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Extract query parameters
    const { symbol, startTimestamp, endTimestamp, groupBy } = req.query;

    // Build the Gold API URL
    const goldApiUrl = `https://api.gold-api.com/history?symbol=${symbol}&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&groupBy=${groupBy}`;

    // Fetch from Gold API
    const response = await fetch(goldApiUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: `Gold API returned ${response.status}` 
      });
    }

    const data = await response.json();
    
    // Return the data
    res.status(200).json(data);
  } catch (error) {
    console.error('Error in gold-proxy:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
