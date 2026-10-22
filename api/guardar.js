// Recibe un CSV comprimido (gzip) desde Cargar datos y lo deja listo en GitHub. Solo editores.
import { gunzipSync } from 'node:zlib';
import { cookieDe, leerToken } from '../lib/auth.js';
import { configGithub, crearBlob } from '../lib/github.js';

const PERMITIDOS = ['ventas', 'tubrica', 'pesos', 'inventario', 'clientes', 'clientes_ventas', 'semanal', 'mensual', 'presupuesto', 'acciones'];
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const s = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  if (!s || s.rol !== 'editor') return json({ error: 'Necesitas ingresar con un usuario editor.' }, 401);
  const cfg = configGithub();
  if (!cfg) return json({ error: 'sin_github' }, 501);
  const id = new URL(request.url).searchParams.get('id');
  if (!PERMITIDOS.includes(id)) return json({ error: 'Conjunto de datos desconocido.' }, 400);
  let csv;
  try { csv = gunzipSync(Buffer.from(await request.arrayBuffer())); } catch (e) { return json({ error: 'Archivo dañado.' }, 400); }
  if (!csv.length || csv.length > 60 * 1024 * 1024) return json({ error: 'Archivo vacío o demasiado grande.' }, 400);
  try {
    const sha = await crearBlob(cfg, csv);
    return json({ ruta: 'data/' + id + '.csv', sha });
  } catch (e) {
    return json({ error: e.status === 401 || e.status === 403 || e.status === 404 ? 'token' : 'github', detalle: String(e.message).slice(0, 160) }, 502);
  }
}
