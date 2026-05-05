const SUPABASE_URL = 'https://dktkrsclizjwfsolgfir.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdGtyc2NsaXpqd2Zzb2xnZmlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDE1NjEsImV4cCI6MjA5MzIxNzU2MX0.Q8q9ATWw9j1gxDDstOPyjgXtcGzS_fhZO_V_J6utwAU';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async function(event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/trends_cache?select=*&order=refreshed_at.desc&limit=1`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) {
      throw new Error(`Supabase read failed: ${res.status}`);
    }

    const rows = await res.json();

    if (!rows || rows.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ empty: true, message: 'No trends yet — first refresh is scheduled for tonight.' })
      };
    }

    const row = rows[0];
    const data = typeof row.trends_data === 'string' ? JSON.parse(row.trends_data) : row.trends_data;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...data,
        refreshed_at: row.refreshed_at
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
