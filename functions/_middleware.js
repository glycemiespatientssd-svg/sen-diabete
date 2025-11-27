// functions/_middleware.js
export async function onRequest(context) {
  const { next } = context;
  
  // Laisser passer toutes les requêtes - l'auth se fait côté client
  // C'est plus fiable pour les SPA (Single Page Applications)
  return next();
}
