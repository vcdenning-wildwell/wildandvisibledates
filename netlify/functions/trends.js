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
          content: `Generate 6 trending content topics for May 2026 relevant to women who run small businesses of any kind — including hairdressers, bakers, cake makers, hypnotherapists, coaches, holistic therapists, makers, crafters, virtual assistants, cleaners, childminders, fitness instructors, beauticians, artists, photographers, florists, and any other type of small business run by a woman. Topics should be about real everyday things these women deal with: showing up online, pricing, dealing with difficult customers, juggling family and business, confidence, getting seen, managing money, burnout, social media, word of mouth, building a loyal customer base, and growing without losing themselves. Make every topic feel grounded and real, not corporate. Return only the JSON as specified.`
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
