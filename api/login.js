import { usuarios, proveedores, claveCorrecta, crearToken, volverSeguro, COOKIE, HORAS } from '../lib/auth.js';

const ir = (location, cookie) => new Response(null, { status: 303, headers: { Location: location, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });

export async function POST(request) {
  const secret = process.env.DASH_SECRET;
  let datos;
  try { datos = await request.formData(); } catch (e) { return ir('/login.html?error=1'); }
  const usuario = String(datos.get('usuario') || '').trim().toLowerCase();
  const clave = String(datos.get('clave') || '');
  const volver = volverSeguro(String(datos.get('volver') || '/'));
  const q = (extra) => '/login.html?' + new URLSearchParams({ ...extra, ...(volver !== '/' ? { volver } : {}) }).toString();
  if (!secret || !process.env.DASH_USERS) return ir(q({ error: 'config' }));
  const editores = usuarios(process.env.DASH_USERS), lectores = usuarios(process.env.DASH_LECTORES);
  const rol = (await claveCorrecta(secret, clave, editores.get(usuario))) ? 'editor'
    : (await claveCorrecta(secret, clave, lectores.get(usuario))) ? 'lector'
    : (await claveCorrecta(secret, clave, (proveedores(process.env.DASH_PROVEEDORES).get(usuario) || {}).clave)) ? 'proveedor' : null;
  if (!rol) {
    await new Promise((r) => setTimeout(r, 700)); // frena los intentos repetidos
    return ir(q({ error: '1', u: usuario }));
  }
  const token = await crearToken(usuario, secret, rol);
  return ir(volver, `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${HORAS * 3600}`);
}

export function GET() {
  return ir('/login.html');
}
