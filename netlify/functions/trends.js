exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const body = JSON.parse(event.body || '{}');
  const systemPrompt = body.system;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Search the web for what is trending RIGHT NOW in May 2026. I want: what is viral on TikTok this week, what celebrities are doing or saying that everyone is talking about, what products women are buying and obsessing over, what is in the news affecting everyday women and families, what wellness or lifestyle trends are exploding right now. Then give each trend a content angle specifically for women running small businesses like hairdressers, bakers, cake makers, candle makers, beauticians, hypnotherapists, florists, crafters, photographers and women's circle facilitators. The hooks must feel like something a real woman would post on Facebook or Instagram, not a marketing consultant. Return only the JSON as specified.`
        }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    const data = await response.json();

    // Get the final text response
    const textContent = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const start = textContent.indexOf('{');
    const end = textContent.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found');

    const parsed = JSON.parse(textContent.slice(start, end + 1));
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
