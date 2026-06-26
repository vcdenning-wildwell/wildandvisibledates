const SUPABASE_URL = 'https://dktkrsclizjwfsolgfir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGtyc2NsaXpqd2Zzb2xnZmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1NjEsImV4cCI6MjA5MzIxNzU2MX0.Q8q9ATWw9j1gxDDstOPyjgXtcGzS_fhZO_V_J6utwAU';

const SYSTEM_PROMPT = `You are a content strategist working for Wild and Visible, created by Vicky Denning. This trend feed serves a community of female entrepreneurs in midlife (roughly 38-58) building all kinds of businesses — coaches, makers, consultants, service providers, creatives, product businesses.

Your job is to surface what is ACTUALLY happening right now today and give every trend two angles each community member can pull from depending on what kind of post she's making.

Search the web and find SPECIFIC, NAMED things:
- The exact TikTok sounds, challenges or formats going viral THIS WEEK (name them)
- Specific celebrity news everyone is talking about RIGHT NOW (name the celebrity and what happened)
- Specific products going viral on TikTok, Instagram or Amazon this week (name the product)
- Real news stories from the last 48 hours that women are reacting to (name the story)
- Specific TV shows, films or moments people are obsessing over (name them)
- Specific social media trends spreading across Facebook, Instagram, TikTok today
- Wellness, health or lifestyle stories blowing up right now

For each trend give TWO angles:

PERSONAL / LIFESTYLE ANGLE — how a midlife woman can connect this trend to her own life and write something real about it. Identity, relationships, perimenopause, motherhood, body, friendships, energy, rest, the threshold of midlife. Personal-account content that builds connection with her audience.

BUSINESS ANGLE — how a woman running a business can connect this trend to entrepreneurship, visibility, leadership, money, growth, hiring, pricing, burnout, marketing, mindset, or the work of building something. Business-account content that builds authority.

The same trend, two different lenses. Members pick the one that matches what they need to post that day.

All hooks must sound like a real woman wrote them — warm, honest, direct. Not marketing speak. Written for Facebook or Instagram.

BAD: "A celebrity is in the news"
GOOD: "Rebel Wilson opened up about her fertility journey and women everywhere are in the comments sharing their own stories"

Return ONLY valid JSON, no markdown, no preamble:
{"trends":[{"topic":"SPECIFIC named trend/person/product/moment","category":"tiktok|celebrity|product|news|tv|wellness|social","urgency":"now|watchlist","midlife_angle":"1-2 sentences on the personal/lifestyle angle","business_angle":"1-2 sentences on the business angle","midlife_hooks":["hook1","hook2"],"business_hooks":["hook1","hook2"]}]}

Return exactly 6 trends. All must be real, named, specific things happening right now.`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function callAnthropicWithRetry(apiKey, userMessage) {
  const waits = [5000];
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Anthropic API attempt ${attempt} of ${maxAttempts}...`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    if (response.ok) {
      console.log(`Anthropic API succeeded on attempt ${attempt}`);
      return response;
    }

    const errText = await response.text();
    const status = response.status;
    console.log(`Attempt ${attempt} failed: ${status} — ${errText.substring(0, 200)}`);

    const isRetryable = status === 429 || status === 529 || (status >= 500 && status < 600);

    if (!isRetryable) {
      throw new Error(`Anthropic API error (not retryable): ${status} — ${errText}`);
    }

    if (attempt === maxAttempts) {
      throw new Error(`Anthropic API failed after ${maxAttempts} attempts: ${status} — ${errText}`);
    }

    const waitMs = waits[attempt - 1];
    console.log(`Waiting ${waitMs / 1000}s before retry...`);
    await sleep(waitMs);
  }
}

exports.handler = async function(event, context) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('No Anthropic API key');
    return { statusCode: 500, body: 'No API key' };
  }

  try {
    console.log('Starting Wild and Visible trend refresh...');

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const userMessage = `Today is ${today}. Search the web right now. Find what is SPECIFICALLY trending today — the actual TikTok sound everyone is using, the specific celebrity in the news, the exact product going viral, the real TV moment, the specific social media trend. Search "trending on TikTok today", "viral on Instagram today", "celebrity news today UK", "what is everyone talking about today UK", "trending wellness 2026", "viral products UK this week", "social media trends ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}". Return specific named things only. Return your JSON.`;

    const response = await callAnthropicWithRetry(apiKey, userMessage);

    const data = await response.json();
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
    if (!parsed.trends || !Array.isArray(parsed.trends)) throw new Error('Invalid trends format');

    console.log(`Got ${parsed.trends.length} trends, saving to Supabase...`);

    await fetch(`${SUPABASE_URL}/rest/v1/wildwell_trends_cache?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/wildwell_trends_cache`, {
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

    console.log('Wild and Visible trends saved successfully');
    return { statusCode: 200, body: JSON.stringify({ success: true, count: parsed.trends.length }) };

  } catch (err) {
    console.error('Refresh error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
