export async function onRequestPost(context) {
  const { request, env } = context;
  
  console.log('🚀 Début analyse glycémie avec GPT-4o...');
  
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
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Méthode non autorisée' 
      }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Content-Type doit être application/json' 
      }), { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const body = await request.json();
    const { imageData } = body;

    console.log('📸 Données image reçues:', imageData ? `Base64 (${imageData.length} caractères)` : 'Aucune');

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
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur incomplète' 
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('🔗 Appel de GPT-4o Vision...');

    const prompt = `Tu es un assistant médical spécialisé dans l'analyse de photos de lecteurs de glycémie (glucomètres).

REGLE ABSOLUE : Réponds UNIQUEMENT avec le nombre affiché sur l'écran du glucomètre, sans aucune autre texte.

INSTRUCTIONS :
1. Examine attentivement l'écran du lecteur de glycémie
2. Identifie la valeur numérique affichée
3. Si la valeur est clairement lisible, retourne UNIQUEMENT le nombre
4. Si l'image n'est pas un glucomètre ou si le nombre n'est pas lisible, retourne UNIQUEMENT "Non lisible"

EXEMPLES DE RÉPONSES CORRECTES :
- "112"
- "85" 
- "Non lisible"

NE JAMAIS AJOUTER de texte explicatif, de commentaires, ou de ponctuation supplémentaire.`;

    const requestBody = {
      model: "gpt-4o",  // ← CHANGEMENT CRITIQUE ICI
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
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
      max_tokens: 20,
      temperature: 0.1
    };

    console.log('📤 Envoi requête à GPT-4o...');
    
    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📡 Statut réponse:', apiResponse.status);

    if (!apiResponse.ok) {
      let errorMessage = `Erreur API: ${apiResponse.status}`;
      
      try {
        const errorData = await apiResponse.json();
        console.error('❌ Détails erreur:', errorData);
        
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch (parseError) {
        console.error('Erreur parsing:', parseError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        error: errorMessage
      }), { 
        status: apiResponse.status, 
        headers: corsHeaders 
      });
    }

    const data = await apiResponse.json();
    console.log('✅ Réponse reçue de GPT-4o');
    
    if (!data.choices || !data.choices[0]?.message) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Réponse invalide de l\'API'
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }
    
    const analysis = data.choices[0].message.content.trim();
    console.log('📊 Analyse brute:', analysis);
    
    let value = null;
    let status = 'unknown';
    
    // Extraction du nombre
    if (!analysis.toLowerCase().includes('non lisible')) {
      const numberMatch = analysis.match(/\d+/);
      if (numberMatch) {
        value = parseInt(numberMatch[0]);
        console.log('🔢 Valeur numérique extraite:', value);
        
        // Validation de la plage glycémique réaliste
        if (value >= 20 && value <= 600) {
          if (value < 70) status = 'hypo';
          else if (value <= 126) status = 'normal';
          else if (value <= 200) status = 'hyper';
          else status = 'severe';
          
          console.log('🎯 Statut glycémique:', status);
        } else {
          console.log('⚠️ Valeur hors plage réaliste:', value);
          value = null;
        }
      }
    }

    const result = {
      success: true,
      numericValue: value,
      status: status,
      unit: 'mg/dL',
      rawResponse: analysis,
      message: value ? `Glycémie: ${value} mg/dL (${status})` : 'Image non lisible'
    };
    
    console.log('🎉 Résultat final:', result);
    
    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('💥 Erreur critique:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Erreur lors du traitement par IA'
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
