export async function onRequest(context) {
  const { env } = context;
  
  try {
    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    
    return new Response(JSON.stringify({
      hasApiKey: !!OPENAI_API_KEY,
      apiKeyLength: OPENAI_API_KEY ? OPENAI_API_KEY.length : 0,
      apiKeyPreview: OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 10) + '...' : 'none'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
