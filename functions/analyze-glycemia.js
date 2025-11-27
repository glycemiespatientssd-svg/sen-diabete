export async function onRequestPost(context) {
  const { request, env } = context;
  
  console.log('🚀 Début analyse glycémie...');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Gérer les pré-requêtes CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Vérifier que c'est bien une requête POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Méthode non autorisée' 
    }), { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  try {
    // Vérifier le content-type
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Content-Type must be application/json' 
      }), { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    const body = await request.json();
    const { imageData } = body;

    console.log('📸 Données image reçues:', imageData ? `Base64 (${imageData.length} chars)` : 'Aucune');

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
      console.error('❌ Clé API OpenAI manquante dans les variables d\'environnement');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur manquante' 
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('🔑 Clé API OpenAI trouvée, appel API...');

    const prompt = `
ANALYSE CETTE PHOTO D'UN LECTEUR DE GLYCÉMIE (GLUCOMÈTRE).

INSTRUCTIONS TRÈS IMPORTANTES :
1. Regarde l'écran du lecteur de glycémie
2. Identifie le nombre affiché
3. Retourne UNIQUEMENT le nombre en chiffres
4. Si tu ne vois pas de nombre clair, retourne "Non lisible"

EXEMPLE DE RÉPONSES ATTENDUES :
- "112"
- "85" 
- "Non lisible"

NE RETOURNE QUE LE NOMBRE OU "NON LISIBLE". RIEN D'AUTRE.
`;

    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
        max_tokens: 50,
        temperature: 0.1
      })
    });

    console.log('📡 Statut réponse OpenAI:', apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error('❌ Erreur API OpenAI:', apiResponse.status, errorText);
      
      let errorMessage = `Erreur API OpenAI: ${apiResponse.status}`;
      if (apiResponse.status === 401) {
        errorMessage = 'Clé API OpenAI invalide';
      } else if (apiResponse.status === 429) {
        errorMessage = 'Quota API dépassé';
      } else if (apiResponse.status === 500) {
        errorMessage = 'Erreur interne OpenAI';
      }
      
      throw new Error(errorMessage);
    }

    const data = await apiResponse.json();
    console.log('✅ Réponse OpenAI reçue');
    
    const analysis = data.choices[0].message.content.trim();
    console.log('📊 Analyse brute:', analysis);
    
    // Extraction robuste du nombre
    let value = null;
    let status = 'unknown';
    
    // Si "Non lisible" ou similaire
    if (analysis.toLowerCase().includes('non lisible') || 
        analysis.toLowerCase().includes('pas lisible') ||
        analysis.toLowerCase().includes('impossible')) {
      console.log('🔍 Image non lisible');
    } else {
      // Chercher un nombre dans la réponse
      const numberMatch = analysis.match(/\d+/);
      if (numberMatch) {
        value = parseInt(numberMatch[0]);
        console.log('🔢 Valeur extraite:', value);
        
        // Validation de la plage glycémique réaliste
        if (value >= 20 && value <= 600) {
          // Déterminer le statut
          if (value < 70) status = 'hypo';
          else if (value <= 126) status = 'normal';
          else if (value <= 200) status = 'hyper';
          else status = 'severe';
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
      rawResponse: analysis
    };
    
    console.log('🎯 Résultat final:', result);
    
    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('💥 Erreur critique analyse:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Erreur lors de l\'analyse: ' + error.message
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
