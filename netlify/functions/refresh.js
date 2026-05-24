const SUPABASE_URL = 'https://dktkrsclizjwfsolgfir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGtyc2NsaXpqd2Zzb2xnZmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1NjEsImV4cCI6MjA5MzIxNzU2MX0.Q8q9ATWw9j1gxDDstOPyjgXtcGzS_fhZO_V_J6utwAU';

const SYSTEM_PROMPT = `You are a trend researcher for Wild and Visible, a community for women running small businesses — bakers, hairdressers, beauticians, candle makers, florists, cake makers, crafters, photographers, hypnotherapists, coaches, and therapists.

Search the web and find what is ACTUALLY happening right now today. I want SPECIFIC, NAMED things — not categories or themes.

Search for:
- The exact TikTok sounds, challenges or formats going viral THIS WEEK (name them specifically)
- Specific celebrity news everyone is talking about RIGHT NOW (name the celebrity and what happened)
- Specific products going viral on TikTok Shop, Amazon or social media this week (name the actual product)
- Real news stories from the last 48 hours that women are reacting to (name the story)
- Specific TV shows, films or moments people are obsessing over right now (name them)
- Specific memes or formats spreading across Facebook and Instagram today

BAD example (too vague): "Celebrity relationship drama is trending"
GOOD example (specific): "Sabrina Carpenter posted a cryptic Instagram story and Twitter is obsessed with what it means"

BAD example: "A skincare product is going viral"  
GOOD example: "The £12 CeraVe moisturiser is everywhere on TikTok this week after a creator with 2M followers showed her 30-day results"

BAD example: "A TV show is popular"
GOOD example: "The finale of [specific show name] aired last night and everyone has opinions"

For each specific trend, write one content angle for women in small business — showing how they can ride this exact moment to create a post. The hook must sound like a real woman wrote it, not a marketer.

Return ONLY valid JSON, no markdown, no preamble:
{"trends":[{"topic":"SPECIFIC named trend/person/product/moment","category":"tiktok|celebrity|product|news|tv|meme","urgency":"now|watchlist","biz_angle":"1-2 sentences — how a small business owner can connect THIS specific thing to their content today","hooks":["specific hook referencing the actual trend","second hook","third hook"]}]}

Return exactly 6 trends. All must be real, named, specific things happening right now.`;

exports.handler = async function(event, context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('No Anthropic API key');
    return { statusCode: 500, body: 'No API key' };
  }

  try {
    console.log('Starting trend refresh...');

    // Call Anthropic with web search
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Today is ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Search the web right now and find what is SPECIFICALLY trending today. I want real names — the actual TikTok sound everyone is using, the specific celebrity who is in the news, the exact product going viral, the real TV show everyone is talking about, the specific meme format spreading today. Search for "trending on TikTok today", "viral on Instagram today", "celebrity news today UK", "what is everyone talking about today", "trending products UK 2026", "viral TikTok sound this week". Return specific named things only — no vague themes. Return your JSON.`
        }],
        tools: [{ type: 'web_search_20260209', name: 'web_search' }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract text content from response
    const textContent = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/```json|```/g, '')
      .trim();

    const start = textContent.indexOf('{');
    const end = textContent.lastIndexOf('}');
    if (start === -1) throw new Error('No JSON found in response');

    const parsed = JSON.parse(textContent.slice(start, end + 1));
    if (!parsed.trends || !Array.isArray(parsed.trends)) {
      throw new Error('Invalid trends format');
    }

    console.log(`Got ${parsed.trends.length} trends, saving to Supabase...`);

    // Save to Supabase — delete old record first, then insert fresh one
    const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/trends_cache?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/trends_cache`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        trends_data: JSON.stringify(parsed),
        refreshed_at: new Date().toISOString()
      })
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase insert failed: ${insertRes.status} — ${errText}`);
    }

    console.log('Trends saved successfully');
    return { statusCode: 200, body: JSON.stringify({ success: true, count: parsed.trends.length }) };

  } catch (err) {
    console.error('Refresh error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
