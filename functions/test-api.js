export async function onRequest(context) {
  const { env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Clé API non configurée'
      }), { status: 500, headers: corsHeaders });
    }

    // Test simple de l'API OpenAI
    const testResponse = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.text();
      return new Response(JSON.stringify({
        success: false,
        error: `Erreur API OpenAI: ${testResponse.status}`,
        details: errorData
      }), { status: 500, headers: corsHeaders });
    }

    const models = await testResponse.json();
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Connexion OpenAI réussie',
      hasVision: models.data.some(model => model.id.includes('vision')),
      keyPreview: OPENAI_API_KEY.substring(0, 8) + '...'
    }), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { status: 500, headers: corsHeaders });
  }
}
