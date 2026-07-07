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

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms`);
    throw err;
  }
}

async function callAnthropicWithRetry(apiKey, userMessage) {
  const attempts = [
    { timeout: 25000, wait: 3000 },
    { timeout: 20000, wait: 0 }
  ];
  let lastError = null;

  for (let i = 0; i < attempts.length; i++) {
    const { timeout, wait } = attempts[i];
    console.log(`Anthropic API attempt ${i + 1} of ${attempts.length} (timeout: ${timeout}ms)...`);

    try {
      const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
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
      }, timeout);

      if (response.ok) {
        console.log(`Anthropic API succeeded on attempt ${i + 1}`);
        return response;
      }

      const errText = await response.text();
      const status = response.status;
      console.log(`Attempt ${i + 1} failed with status ${status}: ${errText.substring(0, 300)}`);

      const isRetryable = status === 429 || status === 529 || (status >= 500 && status < 600);
      if (!isRetryable) throw new Error(`Anthropic API error (not retryable): ${status} — ${errText}`);
      lastError = new Error(`HTTP ${status}: ${errText.substring(0, 200)}`);
    } catch (err) {
      console.log(`Attempt ${i + 1} threw: ${err.message}`);
      lastError = err;
    }

    if (i < attempts.length - 1 && wait > 0) {
      console.log(`Waiting ${wait / 1000}s before retry...`);
      await sleep(wait);
    }
  }

  throw lastError || new Error('All Anthropic API attempts failed');
}

exports.handler = async function(event, context) {
  const startTime = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('No Anthropic API key');
    return { statusCode: 500, body: JSON.stringify({ error: 'No API key configured' }) };
  }

  try {
    console.log('Starting Wild and Visible trend refresh...');
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const userMessage = `Today is ${today}. Search the web right now. Find what is SPECIFICALLY trending today — the actual TikTok sound everyone is using, the specific celebrity in the news, the exact product going viral, the real TV moment, the specific social media trend. Search "trending on TikTok today", "viral on Instagram today", "celebrity news today UK", "what is everyone talking about today UK", "trending wellness 2026", "viral products UK this week", "social media trends ${new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}". Return specific named things only. Return your JSON.`;

    const response = await callAnthropicWithRetry(apiKey, userMessage);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Anthropic call completed in ${elapsed}s`);

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

    await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/trends_cache?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }, 5000);

    const insertRes = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/trends_cache`, {
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
    }, 5000);

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase insert failed: ${insertRes.status} — ${errText}`);
    }

    const totalElapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Trends saved successfully in ${totalElapsed}s total`);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, count: parsed.trends.length, elapsed_seconds: totalElapsed })
    };

  } catch (err) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(`Refresh error after ${elapsed}s:`, err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message, elapsed_seconds: elapsed })
    };
  }
};
