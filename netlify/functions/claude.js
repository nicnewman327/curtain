const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function supabase(path, method, body) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: method || 'GET',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch(e) { return { ok: res.ok, status: res.status, data: text }; }
}

exports.handler = async function(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  // ── Diary operations ──────────────────────────────────────────────────────
  if (body.action === 'diary_load') {
    const res = await supabase('diary?order=created_at.desc', 'GET');
    return { statusCode: 200, headers, body: JSON.stringify(res.data) };
  }

  if (body.action === 'diary_save') {
    const item = body.item;
    const res = await supabase('diary', 'POST', {
      title: item.title,
      type: item.type,
      venue: item.venue,
      dates: item.dates,
      note: item.note || '',
      rating: item.rating || 0,
      source: item.source || 'rec',
      summary: item.summary || '',
      press: item.press || '',
      match_reason: item.matchReason || ''
    });
    return { statusCode: 200, headers, body: JSON.stringify(res.data) };
  }

  if (body.action === 'diary_update') {
    const res = await supabase('diary?id=eq.' + body.id, 'PATCH', body.fields);
    return { statusCode: 200, headers, body: JSON.stringify(res.data) };
  }

  if (body.action === 'diary_delete') {
    await supabase('diary?id=eq.' + body.id, 'DELETE');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  if (body.action === 'diary_autofill') {
    if (!ANTHROPIC_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: 'No API key' }) };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: 'Write a single sentence description (max 25 words) for this UK cultural event: "' + body.title + '" (category: ' + body.type + '). Just the sentence, nothing else.' }]
      })
    });
    const data = await res.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    return { statusCode: 200, headers, body: JSON.stringify({ description: text.trim() }) };
  }

  // ── Claude recommendations ────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model || 'claude-sonnet-4-6',
        max_tokens: body.max_tokens || 1500,
        system: body.system || '',
        messages: body.messages || []
      })
    });

    const data = await response.json();
    if (data.stop_reason === 'max_tokens') {
      return { statusCode: 200, headers, body: JSON.stringify({ error: 'Response cut off — try again' }) };
    }
    return { statusCode: response.status, headers, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
