// Sesiones firmadas para el ingreso por usuario (sin base de datos).
// DASH_USERS: editores (ven todo y pueden cargar datos): "usuario:clave,usuario2:clave2".
// DASH_LECTORES (opcional): usuarios que solo ven el dashboard, mismo formato.
// DASH_PUBLICO (opcional): "si" para que cualquiera vea el dashboard sin usuario (sin Cargar datos).
// DASH_SECRET: un texto largo y secreto para firmar las sesiones.
const enc = new TextEncoder();
const dec = new TextDecoder();
export const COOKIE = 'fb_sesion';
export const HORAS = 12;

const b64url = (bytes) => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const desB64url = (s) => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return dec.decode(Uint8Array.from(t, (c) => c.charCodeAt(0)));
};
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export function usuarios(texto) {
  const m = new Map();
  for (const p of String(texto || '').split(/[\n,;]+/)) {
    const i = p.indexOf(':');
    if (i > 0) m.set(p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim());
  }
  return m;
}
export async function claveCorrecta(secret, dada, guardada) {
  if (!guardada || !dada) return false;
  return iguales(await hmac(secret, 'clave:' + dada), await hmac(secret, 'clave:' + guardada));
}
export const esPublico = (v) => /^(si|sí|yes|true|1)$/i.test(String(v || '').trim());
export async function crearToken(usuario, secret, rol = 'editor') {
  const exp = Math.floor(Date.now() / 1000) + HORAS * 3600;
  const cuerpo = b64url(enc.encode(rol + '|' + usuario)) + '.' + exp;
  return cuerpo + '.' + (await hmac(secret, cuerpo));
}
export async function leerToken(token, secret) {
  if (!token || !secret) return null;
  const [u, exp, firma] = token.split('.');
  if (!u || !exp || !firma || !(Number(exp) > Date.now() / 1000)) return null;
  if (!iguales(await hmac(secret, u + '.' + exp), firma)) return null;
  try {
    const t = desB64url(u);
    const i = t.indexOf('|');
    return i > 0 ? { rol: t.slice(0, i), usuario: t.slice(i + 1) } : { rol: 'editor', usuario: t };
  } catch (e) { return null; }
}
export function cookieDe(request) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(/(?:^|;\s*)fb_sesion=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
export function volverSeguro(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/';
}
