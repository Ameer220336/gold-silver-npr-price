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
    // Get API keys from environment variables (comma-separated)
    const apiKeysString = process.env.VITE_GOLD_API_SECRET || process.env.VITE_GOLD_API_KEY;
    
    if (!apiKeysString) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Split comma-separated keys into array
    const apiKeys = apiKeysString.split(',').map(key => key.trim()).filter(key => key);
    
    if (apiKeys.length === 0) {
      return res.status(500).json({ error: 'No valid API keys found' });
    }

    // Extract query parameters
    const { symbol, startTimestamp, endTimestamp, groupBy } = req.query;

    // Determine endpoint type based on parameters
    let goldApiUrl;
    if (startTimestamp && endTimestamp && groupBy) {
      // Historical data endpoint
      goldApiUrl = `https://api.gold-api.com/history?symbol=${symbol}&startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&groupBy=${groupBy}`;
    } else if (symbol) {
      // Current price endpoint
      goldApiUrl = `https://api.gold-api.com/price/${symbol}`;
    } else {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    // Try each API key until one succeeds
    let lastError = null;
    
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      
      try {
        // Fetch from Gold API
        const response = await fetch(goldApiUrl, {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Success! Return the data
          return res.status(200).json(data);
        }
        
        // If rate limited or unauthorized, try next key
        if (response.status === 429 || response.status === 401) {
          console.log(`API key ${i + 1}/${apiKeys.length} failed with status ${response.status}, trying next...`);
          lastError = { status: response.status, message: `Key ${i + 1} rate limited or unauthorized` };
          continue;
        }
        
        // For other errors, return immediately
        return res.status(response.status).json({ 
          error: `Gold API returned ${response.status}` 
        });
        
      } catch (fetchError) {
        console.error(`Error with API key ${i + 1}:`, fetchError.message);
        lastError = { status: 500, message: fetchError.message };
        continue;
      }
    }
    
    // All keys failed
    return res.status(lastError?.status || 429).json({ 
      error: 'All API keys exhausted or rate limited',
      details: lastError?.message,
      keysAttempted: apiKeys.length
    });
  } catch (error) {
    console.error('Error in gold-proxy:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
