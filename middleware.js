// Corre en Vercel antes de cada página o archivo. Sin sesión válida no se entrega nada
// (ni el dashboard ni los datos) y se envía a la pantalla de ingreso, salvo que
// DASH_PUBLICO = "si": entonces cualquiera puede ver el dashboard (sin Cargar datos).
import { cookieDe, leerToken, esPublico } from './lib/auth.js';

export const config = {
  matcher: ['/((?!login\\.html|api/login|favicon\\.ico).*)'],
};

export default async function middleware(request) {
  const usuario = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  if (usuario || esPublico(process.env.DASH_PUBLICO)) return new Response(null, { headers: { 'x-middleware-next': '1' } });
  const url = new URL(request.url);
  if (url.pathname.startsWith('/data/') || url.pathname.startsWith('/api/')) {
    return new Response('Necesitas ingresar con tu usuario.', { status: 401 });
  }
  const destino = new URL('/login.html', request.url);
  if (url.pathname !== '/' || url.search) destino.searchParams.set('volver', url.pathname + url.search);
  return Response.redirect(destino.toString(), 302);
}
