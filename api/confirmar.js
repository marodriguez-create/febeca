// Crea un solo commit con todos los CSV subidos en una carga. Vercel publica solo al recibirlo.
import { cookieDe, leerToken } from '../lib/auth.js';
import { configGithub, confirmar } from '../lib/github.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const s = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  if (!s || s.rol !== 'editor') return json({ error: 'Necesitas ingresar con un usuario editor.' }, 401);
  const cfg = configGithub();
  if (!cfg) return json({ error: 'sin_github' }, 501);
  let d;
  try { d = await request.json(); } catch (e) { return json({ error: 'Solicitud inválida.' }, 400); }
  const archivos = (Array.isArray(d.archivos) ? d.archivos : []).filter((a) => /^data\/[a-z_]+\.csv$/.test(a.ruta) && /^[0-9a-f]{40}$/.test(a.sha));
  if (!archivos.length) return json({ error: 'No hay archivos.' }, 400);
  try {
    const sha = await confirmar(cfg, archivos, 'Actualiza datos desde el dashboard (' + s.usuario + '): ' + archivos.map((a) => a.ruta.slice(5)).join(', '));
    return json({ ok: true, commit: sha });
  } catch (e) {
    return json({ error: e.status === 401 || e.status === 403 || e.status === 404 ? 'token' : 'github', detalle: String(e.message).slice(0, 160) }, 502);
  }
}
