// Datos para un proveedor: solo sus marcas; ventas en unidades, sin dólares de venta ni nombres de clientes.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cookieDe, leerToken, proveedores, normMarca } from '../lib/auth.js';

const SIN_DATOS = ['semanal', 'mensual', 'presupuesto', 'acciones'];
const resp = (txt, status = 200) => new Response(txt, { status, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'private, no-store' } });

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const cols = rows.shift() || [];
  return { cols, data: rows.filter((r) => !(r.length === 1 && r[0] === '')).map((r) => Object.fromEntries(cols.map((k, i) => [k, r[i] ?? '']))) };
}
const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const aCsv = (cols, rows) => cols.join(',') + '\n' + rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n') + (rows.length ? '\n' : '');
const leer = async (id) => parseCsv(await readFile(path.join(process.cwd(), 'data', id + '.csv'), 'utf8'));

export async function GET(request) {
  const s = await leerToken(cookieDe(request), process.env.DASH_SECRET);
  if (!s || s.rol !== 'proveedor') return resp('No autorizado.', 401);
  const prov = proveedores(process.env.DASH_PROVEEDORES).get(s.usuario);
  const M = new Set((prov ? prov.marcas : []).map(normMarca));
  const id = new URL(request.url).searchParams.get('id');
  const deSus = (r) => M.has(normMarca(r.marca || (id === 'tubrica' ? 'Tubrica' : '')));
  try {
    if (SIN_DATOS.includes(id)) { const { cols } = await leer(id); return resp(cols.join(',') + '\n'); }
    if (id === 'ventas') { const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter(deSus).map((r) => ({ ...r, venta_usd: r.unidades })))); }
    if (id === 'tubrica') { const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter(deSus).map((r) => ({ ...r, venta_usd: '0' })))); }
    if (id === 'inventario') { const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter(deSus))); }
    if (id === 'pesos') {
      const t = await leer('tubrica'); const cods = new Set(t.data.filter((r) => M.has(normMarca(r.marca || 'Tubrica'))).map((r) => r.codigo));
      const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter((r) => cods.has(r.codigo))));
    }
    if (id === 'clientes_ventas') { const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter(deSus).map((r) => ({ ...r, venta_usd: Number(r.venta_usd) > 0 ? '1' : '-1' })))); }
    if (id === 'clientes_codigos') { const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter(deSus).map((r) => ({ ...r, venta_usd: Number(r.venta_usd) > 0 ? '1' : '-0.001' })))); } // sin montos: cuenta si compró algún código
    if (id === 'clientes') {
      const cv = await leer('clientes_ventas'); const ids = new Set(cv.data.filter(deSus).map((r) => r.id));
      const { cols, data } = await leer(id); return resp(aCsv(cols, data.filter((r) => ids.has(r.id)).map((r) => ({ ...r, cliente: 'Cliente ' + r.id }))));
    }
    return resp('No disponible.', 404);
  } catch (e) {
    return resp('No se pudo leer el archivo.', 500);
  }
}
