import { cookieDe, leerToken, esPublico, proveedores } from '../lib/auth.js';

// Quién está viendo: { usuario, rol, marcas? } con sesión, o { publico } sin sesión.
export async function GET(request) {
  const s = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  let cuerpo = { publico: esPublico(process.env.DASH_PUBLICO) };
  if (s) {
    cuerpo = { usuario: s.usuario, rol: s.rol };
    if (s.rol === 'proveedor') { const p = proveedores(process.env.DASH_PROVEEDORES).get(s.usuario) || { marcas: [], ocultar: [] }; cuerpo.marcas = p.marcas; cuerpo.ocultar = p.ocultar; }
  }
  return new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
