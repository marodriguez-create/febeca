/*
 * Reemplazo local del entorno "dash" de Claude para publicar el dashboard en Vercel.
 * Lee los datos de la carpeta data/ (un CSV por conjunto de datos) y ofrece lo mismo
 * que usa la página: dash.data, dash.calc, dash.onData, filtros, enlaces y colores.
 * La pestaña Cargar datos funciona en el navegador: aplica el archivo al momento y
 * descarga los CSV nuevos para subirlos a la carpeta data/ del repositorio.
 */
(function () {
  'use strict';

  // ---------- conjuntos de datos: id -> archivo en data/ ----------
  const DATASETS = {
    ventas: 'data/ventas.csv',
    tubrica: 'data/tubrica.csv',
    pesos: 'data/pesos.csv',
    inventario: 'data/inventario.csv',
    clientes: 'data/clientes.csv',
    clientes_ventas: 'data/clientes_ventas.csv',
    semanal: 'data/semanal.csv',
    mensual: 'data/mensual.csv',
    presupuesto: 'data/presupuesto.csv',
    acciones: 'data/acciones.csv',
    clientes_codigos: 'data/clientes_codigos.csv',
  };

  // ---------- lector de CSV (con comillas) ----------
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [], field = '', i = 0, q = false;
    const n = text.length;
    while (i < n) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          q = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { q = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const columns = rows.shift() || [];
    const data = [];
    for (const r of rows) {
      if (r.length === 1 && r[0] === '') continue;
      const o = {};
      for (let k = 0; k < columns.length; k++) o[columns[k]] = r[k] ?? '';
      data.push(o);
    }
    return { columns, data };
  }

  // ---------- estado ----------
  const raw = {};      // id -> {status, data, columns, message}
  const calcs = {};    // id -> {inputs, fn, title, description}
  const cache = {};    // id -> {key, result}
  const subs = [];
  let version = 0;

  for (const id of Object.keys(DATASETS)) raw[id] = { status: 'loading', data: [], columns: [] };

  let pend = false;
  function notify() {
    version++;
    if (pend) return;
    pend = true;
    requestAnimationFrame(() => {
      pend = false;
      for (const fn of subs.slice()) { try { fn(); } catch (e) { console.error(e); } }
    });
  }

  function cargar(id) {
    const url = DATASETS[id] + '?v=' + Date.now().toString(36).slice(0, -3);
    return fetch(url, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then((t) => { const p = parseCsv(t); raw[id] = { status: 'ok', data: p.data, columns: p.columns }; })
      .catch((e) => { raw[id] = { status: 'error', data: [], columns: [], message: 'No se pudo leer ' + DATASETS[id] + ' (' + e.message + ')' }; })
      .finally(notify);
  }
  // los más pequeños primero, para que la página aparezca antes
  ['pesos', 'acciones', 'mensual', 'presupuesto', 'semanal', 'inventario', 'clientes', 'ventas', 'clientes_ventas', 'tubrica', 'clientes_codigos'].forEach(cargar);

  function vacio(status, message) { return { status, data: [], rows: [], columns: [], meta: [], refreshing: false, message: message || '' }; }

  function data(id) {
    if (calcs[id]) {
      const c = calcs[id];
      const ins = c.inputs.map((x) => data(x));
      const mal = ins.find((x) => x.status !== 'ok');
      if (mal) return vacio(mal.status === 'error' ? 'error' : 'loading', mal.message);
      const key = ins.map((x) => x._ref).join('|');
      if (!cache[id] || cache[id].key !== key) {
        let result, err = null;
        try { result = c.fn(...ins.map((x) => x.data)); } catch (e) { err = e; console.error('calc ' + id, e); }
        cache[id] = { key, result, err, ref: id + ':' + version };
      }
      const k = cache[id];
      if (k.err) return vacio('error', String(k.err && k.err.message));
      const d = k.result;
      const cols = Array.isArray(d) && d[0] && typeof d[0] === 'object' ? Object.keys(d[0]) : [];
      return { status: 'ok', data: d, rows: d, columns: cols, meta: [], refreshing: false, message: '', _ref: k.ref };
    }
    const r = raw[id];
    if (!r) return vacio('missing');
    if (r.status !== 'ok') return vacio(r.status, r.message);
    if (!r._ref) r._ref = id + ':' + version + ':' + Math.random().toString(36).slice(2, 7);
    return { status: 'ok', data: r.data, rows: r.data, columns: r.columns, meta: [], refreshing: false, message: '', _ref: r._ref };
  }

  // ---------- filtros (en la dirección de la página, para compartir el enlace) ----------
  function leerParams() {
    const p = {};
    new URLSearchParams(location.search).forEach((v, k) => { p[k] = v; });
    return p;
  }
  let params = leerParams();
  function escribirParams() {
    const u = new URL(location.href);
    u.search = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    history.replaceState(null, '', u);
  }

  let ancho = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - ancho) < 2) return;
    ancho = window.innerWidth;
    notify();
  });

  window.dash = {
    data,
    calc(id, def) { calcs[id] = { inputs: def.inputs || [], fn: def.fn, title: def.title, description: def.description }; },
    loader() { /* sin consultas en vivo en esta versión */ },
    onData(fn) { subs.push(fn); try { fn(); } catch (e) { console.error(e); } },
    params: () => ({ ...params }),
    setParams(p) { params = { ...params, ...p }; escribirParams(); notify(); },
    resetParams() { params = {}; escribirParams(); notify(); },
    setLink(name) { if (name) history.replaceState(null, '', location.pathname + location.search + '#' + name); },
    refresh(id) { if (DATASETS[id]) cargar(id); },
    colors: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'var(--cds-chart-categorical-' + i + ')'),
    _reemplazar(id, csvText) { const p = parseCsv(csvText); raw[id] = { status: 'ok', data: p.data, columns: p.columns }; notify(); },
  };

  // ---------- capacidades de la pestaña Cargar datos ----------
  const blobs = new Map();
  let nBlob = 0;
  const guardar = (nombre, blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  // ---------- guardado en GitHub (para que todos vean los datos nuevos) ----------
  const descargados = [];
  const enGithub = [];          // {ruta, sha} subidos en esta carga, aún sin confirmar
  let modoDescarga = false;     // si GitHub no está configurado, se descargan los CSV
  let confirmarT = null;
  function cajaAviso() {
    let box = document.querySelector('.fb-aviso-local');
    if (!box) { box = document.createElement('div'); box.className = 'fb-aviso-local'; box.setAttribute('role', 'status'); document.body.append(box); }
    return box;
  }
  function mostrar(texto, extra, cerrable) {
    const box = cajaAviso();
    const p1 = document.createElement('div');
    p1.textContent = texto;
    const partes = [p1];
    if (extra) { const p2 = document.createElement('b'); p2.textContent = extra; partes.push(p2); }
    if (cerrable) {
      const c = document.createElement('button');
      c.type = 'button'; c.textContent = 'Cerrar';
      c.addEventListener('click', () => box.remove());
      partes.push(c);
    }
    box.replaceChildren(...partes);
  }
  let avisoT = null;
  function avisoDescarga() {
    clearTimeout(avisoT);
    avisoT = setTimeout(() => mostrar('El dashboard ya muestra los datos nuevos en este navegador. Para que los vean todos, sube estos archivos descargados a la carpeta data/ del repositorio en GitHub (reemplazando los anteriores). Para que se guarde solo, configura GITHUB_TOKEN y GITHUB_REPO en Vercel.', descargados.join(', '), true), 300);
  }
  const MSG_ERR = { token: 'GitHub rechazó el token: revisa GITHUB_TOKEN (permiso Contents: Read and write sobre el repositorio) y GITHUB_REPO.', github: 'GitHub no respondió bien. Inténtalo de nuevo en unos minutos.' };
  async function subirGithub(id, txt) {
    const gz = await new Response(new Blob([txt]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    const r = await fetch('/api/guardar?id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: gz });
    const d = await r.json().catch(() => ({}));
    if (r.status === 501 || r.status === 404) return 'sin_github';
    if (!r.ok) throw new Error(MSG_ERR[d.error] || d.error || ('Error ' + r.status));
    return d;
  }
  function programarConfirmar() {
    clearTimeout(confirmarT);
    mostrar('Guardando los datos nuevos en GitHub…', enGithub.map((a) => a.ruta.slice(5)).join(', '));
    confirmarT = setTimeout(async () => {
      const lote = enGithub.splice(0);
      try {
        const r = await fetch('/api/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archivos: lote }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(MSG_ERR[d.error] || d.error || ('Error ' + r.status));
        mostrar('Listo: los datos quedaron guardados. En 1 a 2 minutos todos los verán al abrir el dashboard (Vercel lo publica solo).', lote.map((a) => a.ruta.slice(5)).join(', '), true);
      } catch (e) {
        mostrar('No se pudieron guardar en GitHub: ' + e.message + ' En este navegador ya se ven los datos nuevos.', '', true);
      }
    }, 2500);
  }

  const LS = 'fb-cargas';
  const leerCargas = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch (e) { return []; } };
  const subsCargas = [];
  const db = {
    doc(path) {
      return {
        async update(d) {
          const id = path.replace(/^datasets\//, '');
          const url = d && d.source && d.source.url;
          const blob = url && blobs.get(url.split('/').pop());
          if (!DATASETS[id] || !blob) return;
          const txt = await blob.text();
          const nombre = DATASETS[id].split('/').pop();
          if (!modoDescarga) {
            let r;
            try { r = await subirGithub(id, txt); } catch (e) {
              mostrar('No se pudo guardar en GitHub: ' + e.message, '', true);
              throw e; // la carga queda como Rechazado y no cambia lo que se ve
            }
            if (r === 'sin_github') modoDescarga = true;
            else { dash._reemplazar(id, txt); enGithub.push(r); programarConfirmar(); return; }
          }
          dash._reemplazar(id, txt);
          guardar(nombre, new Blob([txt], { type: 'text/csv' }));
          if (!descargados.includes(nombre)) descargados.push(nombre);
          avisoDescarga();
        },
      };
    },
    collection(name) {
      const q = {
        orderBy() { return q; },
        limit() { return q; },
        async add(doc) {
          if (name !== 'cargas') return;
          const l = leerCargas();
          l.unshift(doc);
          try { localStorage.setItem(LS, JSON.stringify(l.slice(0, 50))); } catch (e) { /* sin almacenamiento */ }
          for (const cb of subsCargas) cb();
        },
        onSnapshot(ok) {
          const run = () => ok({ docs: leerCargas().map((d) => ({ data: () => d })) });
          subsCargas.push(run);
          run();
          return () => {};
        },
      };
      return q;
    },
  };
  const capacidades = {
    db,
    assets: { async upload(blob) { const id = 'local' + (++nBlob); blobs.set(id, blob); return { id, url: '/_blob/' + id }; } },
    user: { async id() { return window.fbUsuario || 'local'; }, async name() { return window.fbUsuario || 'Este navegador'; }, async profiles(ids) { return Object.fromEntries(ids.map((i) => [i, { name: i === 'local' ? 'Este navegador' : i }])); } },
    downloads: { async save({ filename, data: bytes }) { guardar(filename, new Blob([bytes])); } },
  };
  window.claude = { use: (name) => Promise.resolve(capacidades[name] || null) };
})();
