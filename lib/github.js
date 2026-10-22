// Guarda archivos de datos en el repositorio de GitHub (un solo commit por carga).
// Variables: GITHUB_TOKEN (token con permiso Contents: Read and write sobre el repositorio),
// GITHUB_REPO ("usuario/repositorio") y GITHUB_BRANCH (opcional, "main" por defecto).
const API = 'https://api.github.com';

export function configGithub() {
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO;
  if (!token || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo.trim())) return null;
  return { token, repo: repo.trim(), rama: (process.env.GITHUB_BRANCH || 'main').trim() };
}

async function gh(cfg, metodo, ruta, cuerpo) {
  const r = await fetch(API + '/repos/' + cfg.repo + ruta, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ventas-febeca', ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await r.text();
  if (!r.ok) { const e = new Error('GitHub ' + r.status + ': ' + t.slice(0, 200)); e.status = r.status; throw e; }
  return t ? JSON.parse(t) : {};
}

export const crearBlob = (cfg, buffer) => gh(cfg, 'POST', '/git/blobs', { content: buffer.toString('base64'), encoding: 'base64' }).then((r) => r.sha);

export async function confirmar(cfg, archivos, mensaje) {
  const ref = await gh(cfg, 'GET', '/git/ref/heads/' + encodeURIComponent(cfg.rama));
  const padre = ref.object.sha;
  const commitPadre = await gh(cfg, 'GET', '/git/commits/' + padre);
  const arbol = await gh(cfg, 'POST', '/git/trees', { base_tree: commitPadre.tree.sha, tree: archivos.map((a) => ({ path: a.ruta, mode: '100644', type: 'blob', sha: a.sha })) });
  const commit = await gh(cfg, 'POST', '/git/commits', { message: mensaje, tree: arbol.sha, parents: [padre] });
  await gh(cfg, 'PATCH', '/git/refs/heads/' + encodeURIComponent(cfg.rama), { sha: commit.sha });
  return commit.sha;
}
