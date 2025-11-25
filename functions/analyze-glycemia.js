export async function onRequestPost(context) {
  const { request } = context;
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await request.json();

    if (!imageData) {
      return new Response(JSON.stringify({ error: 'Aucune image fournie' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    // ✅ CLÉ API OPENAI - À METTRE DANS wrangler.toml
    const OPENAI_API_KEY = context.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur manquante' 
      }), {
        status: 500,
        headers: corsHeaders
      });
    }

    // Appel à OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `ANALYSE CETTE PHOTO D'UN LECTEUR DE GLYCÉMIE et retourne UNIQUEMENT la valeur numérique en mg/dL. 
              RÈGLES : Retourne UNIQUEMENT le nombre (ex: "112") ou "Non lisible" si impossible`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageData}`
                }
              }
            ]
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content.trim();
    const cleanAnalysis = analysis.replace(/[^\d]/g, '');
    const value = parseInt(cleanAnalysis);
    
    let status = 'unknown';
    if (!isNaN(value)) {
      if (value < 70) status = 'hypo';
      else if (value <= 126) status = 'normal';
      else if (value <= 140) status = 'hyper';
      else status = 'severe';
    }

    return new Response(JSON.stringify({
      success: true,
      numericValue: isNaN(value) ? null : value,
      status: status,
      unit: 'mg/dL'
    }), { headers: corsHeaders });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Erreur lors de l\'analyse'
    }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
