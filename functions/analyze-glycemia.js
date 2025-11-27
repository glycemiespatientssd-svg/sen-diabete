export async function onRequestPost(context) {
  const { request, env } = context;
  
  console.log('🚀 Début analyse glycémie...');
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Gérer les pré-requêtes CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Vérifier la méthode
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Méthode non autorisée' 
      }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    // Vérifier le content-type
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
    
    console.log('🔑 Clé API OpenAI:', OPENAI_API_KEY ? `Présente (${OPENAI_API_KEY.substring(0, 10)}...)` : 'MANQUANTE');
    
    if (!OPENAI_API_KEY) {
      console.error('❌ CLÉ API OPENAI MANQUANTE');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur incomplète - Clé API manquante' 
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    // Vérifier le format de la clé API
    if (!OPENAI_API_KEY.startsWith('sk-')) {
      console.error('❌ Format de clé API invalide');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Configuration serveur invalide - Format de clé incorrect' 
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('🔗 Appel de l\'API OpenAI...');

    const prompt = `ANALYSE CETTE PHOTO D'UN LECTEUR DE GLYCÉMIE (GLUCOMÈTRE).

INSTRUCTIONS TRÈS IMPORTANTES :
1. Regarde l'écran du lecteur de glycémie
2. Identifie le nombre affiché
3. Retourne UNIQUEMENT le nombre en chiffres
4. Si tu ne vois pas de nombre clair, retourne "Non lisible"

EXEMPLE DE RÉPONSES ATTENDUES :
- "112"
- "85" 
- "Non lisible"

NE RETOURNE QUE LE NOMBRE OU "NON LISIBLE". RIEN D'AUTRE.`;

    const requestBody = {
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
    };

    console.log('📤 Envoi requête à OpenAI...');
    
    const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log('📡 Statut réponse OpenAI:', apiResponse.status);

    if (!apiResponse.ok) {
      let errorMessage = `Erreur API OpenAI: ${apiResponse.status}`;
      
      try {
        const errorData = await apiResponse.json();
        console.error('❌ Détails erreur OpenAI:', errorData);
        
        if (errorData.error?.message) {
          errorMessage = `OpenAI: ${errorData.error.message}`;
        }
        
        // Gestion des erreurs spécifiques
        if (apiResponse.status === 401) {
          errorMessage = 'Clé API OpenAI invalide ou expirée';
        } else if (apiResponse.status === 429) {
          errorMessage = 'Quota API dépassé - Vérifiez votre compte OpenAI';
        } else if (apiResponse.status === 500) {
          errorMessage = 'Erreur interne du serveur OpenAI';
        } else if (apiResponse.status === 404) {
          errorMessage = 'Modèle GPT-4 Vision non disponible - Vérifiez votre abonnement';
        }
      } catch (parseError) {
        console.error('❌ Erreur parsing réponse:', parseError);
      }
      
      return new Response(JSON.stringify({
        success: false,
        error: errorMessage
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const data = await apiResponse.json();
    console.log('✅ Réponse OpenAI reçue avec succès');
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Réponse OpenAI invalide'
      }), { 
        status: 500, 
        headers: corsHeaders 
      });
    }
    
    const analysis = data.choices[0].message.content.trim();
    console.log('📊 Analyse brute OpenAI:', analysis);
    
    // Extraction du nombre
    let value = null;
    let status = 'unknown';
    
    // Vérifier si "Non lisible"
    if (analysis.toLowerCase().includes('non lisible') || 
        analysis.toLowerCase().includes('pas lisible') ||
        analysis.toLowerCase().includes('impossible') ||
        analysis.toLowerCase().includes('error') ||
        analysis.toLowerCase().includes('unable')) {
      console.log('🔍 Image non lisible selon OpenAI');
    } else {
      // Chercher un nombre dans la réponse
      const numberMatch = analysis.match(/\d+/);
      if (numberMatch) {
        value = parseInt(numberMatch[0]);
        console.log('🔢 Valeur numérique extraite:', value);
        
        // Validation de la plage glycémique réaliste (20-600 mg/dL)
        if (value >= 20 && value <= 600) {
          // Déterminer le statut glycémique
          if (value < 70) status = 'hypo';
          else if (value <= 126) status = 'normal';
          else if (value <= 140) status = 'hyper';
          else status = 'severe';
          
          console.log('🎯 Statut glycémique:', status);
        } else {
          console.log('⚠️ Valeur hors plage réaliste:', value);
          value = null;
        }
      } else {
        console.log('🔍 Aucun nombre détecté dans la réponse');
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
    
    console.log('🎉 Résultat final de l\'analyse:', result);
    
    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('💥 Erreur critique analyse:', error);
    
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
