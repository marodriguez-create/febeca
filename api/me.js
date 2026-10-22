import { cookieDe, leerToken, esPublico } from '../lib/auth.js';

// Quién está viendo: { usuario, rol } con sesión, o { publico } sin sesión.
export async function GET(request) {
  const s = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  const cuerpo = s ? { usuario: s.usuario, rol: s.rol } : { publico: esPublico(process.env.DASH_PUBLICO) };
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
