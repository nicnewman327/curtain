// Lightweight function that triggers the background digest and also serves cached digest from Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // GET — load digest from Supabase
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/digest?id=eq.1&select=content,created_at', {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });
      const data = await res.json();
      const row = Array.isArray(data) ? data[0] : data;
      return { statusCode: 200, headers, body: JSON.stringify(row || { content: '', created_at: null }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  // POST — trigger background refresh
  if (event.httpMethod === 'POST') {
    try {
      // Fire and forget — call background function via internal URL
      const bgUrl = process.env.URL + '/.netlify/functions/digest-background';
      fetch(bgUrl, { method: 'POST' }).catch(e => console.log('Background trigger:', e.message));
      return { statusCode: 202, headers, body: JSON.stringify({ status: 'refresh triggered' }) };
    } catch(e) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
