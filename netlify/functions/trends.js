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
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `It is May 2026. Give me 6 genuinely trending topics right now that women are talking about, buying, watching and sharing. Mix it up across these areas: what is viral on TikTok right now, celebrity news and moments that everyone is discussing, what products or trends women are buying or obsessing over, what is in the news that affects everyday women and families, what wellness or lifestyle trends are taking off, and what is being talked about in small business and self employment circles. For each trend give a real specific content angle that a woman running any kind of small business could use — whether she is a hairdresser, cake maker, hypnotherapist, florist, cleaner, beautician, photographer, crafter or anything else. The hooks should feel like something a real woman would actually post, not a marketing textbook. Return only the JSON as specified.`
        }]
      })
    });

    const data = await response.json();
    const raw = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found');

    const parsed = JSON.parse(raw.slice(start, end + 1));
    return { statusCode: 200, headers, body: JSON.stringify(parsed) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
