export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await request.json();

    if (!imageData) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Aucune image fournie' 
      }), { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const OPENAI_API_KEY = env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('❌ Clé API OpenAI manquante');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur manquante' 
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('🔍 Appel API OpenAI...');
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4-vision-preview",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: "ANALYSE CETTE PHOTO D'UN LECTEUR DE GLYCÉMIE. Retourne UNIQUEMENT la valeur numérique en mg/dL sous forme de nombre. Exemple: '112' ou 'Non lisible' si impossible à lire. Ne retourne QUE le nombre ou 'Non lisible'."
            },
            {
              type: "image_url",
              image_url: { 
                url: `data:image/jpeg;base64,${imageData}`,
                detail: "high"
              }
            }
          ]
        }],
        max_tokens: 50,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erreur API OpenAI:', response.status, errorText);
      throw new Error(`Erreur API: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Réponse OpenAI:', data);
    
    const analysis = data.choices[0].message.content.trim();
    console.log('📊 Analyse brute:', analysis);
    
    // Extraction du nombre - plus robuste
    const numberMatch = analysis.match(/\d+/);
    let value = numberMatch ? parseInt(numberMatch[0]) : null;
    
    // Validation de la plage glycémique réaliste
    if (value && (value < 20 || value > 600)) {
      console.log('⚠️ Valeur hors plage réaliste:', value);
      value = null;
    }
    
    let status = 'unknown';
    if (value !== null) {
      if (value < 70) status = 'hypo';
      else if (value <= 126) status = 'normal';
      else if (value <= 200) status = 'hyper';
      else status = 'severe';
    }

    const result = {
      success: true,
      numericValue: value,
      status: status,
      unit: 'mg/dL',
      rawResponse: analysis
    };
    
    console.log('🎯 Résultat final:', result);
    
    return new Response(JSON.stringify(result), { 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('💥 Erreur analyse:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erreur lors de l\'analyse: ' + error.message
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
