import { COOKIE } from '../lib/auth.js';

export function GET() {
  return new Response(null, { status: 303, headers: { Location: '/login.html?salio=1', 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
}
