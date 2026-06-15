const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

exports.handler = async function(event) {
  console.log('Background digest function started');

  if (!ANTHROPIC_KEY) {
    console.error('No ANTHROPIC_API_KEY');
    return { statusCode: 500, body: 'No API key' };
  }

  const prompt = 'Search the web for the latest UK arts and culture reviews published this week from The Guardian, The Times, The Telegraph, The Arts Desk, BBC Culture, Time Out London, The Stage, and The Reviews Hub.\n\n'
    + 'Then write a 650-word digest of the best new films, art exhibitions, theatre and TV on right now or coming up very soon in the UK. '
    + 'Focus on things getting 4 or 5 stars. Include a few choice quotes from reviews, properly attributed with the publication name. '
    + 'Write in an engaging editorial voice — like a knowledgeable friend recommending things. '
    + 'Flowing paragraphs only, no bullet points, no section headers. Bold each event title when first mentioned. Approximately 650 words.';

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: 'You are an authoritative UK arts and culture writer. Search the web for current reviews then write in flowing, engaging prose.',
        messages: [{ role: 'user', content: prompt }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return { statusCode: 500, body: JSON.stringify(data) };
    }

    // Extract only text blocks
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text || '')
      .join('')
      .trim();

    if (!text) {
      console.error('Empty text response. Blocks:', (data.content||[]).map(b=>b.type).join(','));
      return { statusCode: 500, body: 'Empty response' };
    }

    // Save to Supabase
    const saveRes = await fetch(SUPABASE_URL + '/rest/v1/digest?id=eq.1', {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ content: text, created_at: new Date().toISOString() })
    });

    const saveData = await saveRes.text();
    console.log('Saved to Supabase:', saveRes.status, saveData.substring(0, 100));
    return { statusCode: 200, body: 'Digest saved successfully' };

  } catch(e) {
    console.error('Function error:', e.message);
    return { statusCode: 500, body: e.message };
  }
};
