// functions/_middleware.js
export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  
  // Pages autorisées sans authentification
  const publicPages = ['/login.html', '/admin.html', '/assets/'];
  const isPublicPage = publicPages.some(page => url.pathname.includes(page));
  
  // Vérifier l'authentification via localStorage (côté client)
  // Pour les pages protégées
  if (!isPublicPage && (url.pathname === '/' || url.pathname === '/index.html')) {
    // Renvoyer la page index normalement, la vérification se fera côté client
    return next();
  }
  
  return next();
}
