export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  
  // Si c'est la racine "/", rediriger vers /login.html
  if (url.pathname === '/') {
    return Response.redirect(`${url.origin}/login.html`, 302);
  }
  
  // Pour toutes les autres URLs, continuer normalement
  return next();
}
