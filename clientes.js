(function () {
  const TODAS = 'Todas';
  const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const largo = (m) => MESL[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  const corto = (m) => MESL[+m.slice(5, 7) - 1].slice(0, 3);
  const nE = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });
  const nP = new Intl.NumberFormat('es-VE', { style: 'percent', maximumFractionDigits: 1 });
  const nC = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
  const ent = (v) => (v == null || isNaN(v) ? '—' : nE.format(v));
  const usd = (v) => (v == null || isNaN(v) ? '—' : (v < 0 ? '-$' : '$') + nE.format(Math.abs(Math.round(v))));
  const usdC = (v) => (v == null || isNaN(v) ? '—' : (v < 0 ? '-$' : '$') + nC.format(Math.abs(v)));
  const pct = (v) => (v == null || isNaN(v) || !isFinite(v) ? '—' : nP.format(v));
  const spct = (v) => (v == null || isNaN(v) || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + nP.format(v));
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const hoy = new Date();
  const MES_EN_CURSO = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  const enCurso = (m) => m === MES_EN_CURSO;

  // ---------- índice ----------
  let SRC = null, IDX = null, memo = new Map();
  function indice() {
    const a = dash.data('clientes'), b = dash.data('clientes_ventas');
    if (a.status !== 'ok' || b.status !== 'ok') return null;
    if (SRC && SRC[0] === a.data && SRC[1] === b.data) return IDX;
    const cli = new Map(a.data.map((r) => [String(r.id), r]));
    const porMes = new Map();
    for (const r of b.data) {
      const c = cli.get(String(r.id));
      if (!c) continue;
      if (!porMes.has(r.mes)) porMes.set(r.mes, []);
      porMes.get(r.mes).push({ id: String(r.id), marca: r.marca, v: Number(r.venta_usd) || 0, c });
    }
    SRC = [a.data, b.data];
    IDX = { cli, porMes, meses: [...porMes.keys()].sort() };
    memo = new Map();
    return IDX;
  }
  let grupoDe = new Map(), topMarcas = new Set();
  const pasaSlot = (marca, slot) => slot === TODAS || (slot.startsWith('Grupo ') ? grupoDe.get(marca) === slot.slice(6) : marca === slot);
  // ventas netas por cliente dentro de cada corte, para un mes, región y filtro de marca/grupo
  function cortes(mes, region, slot) {
    const X = indice();
    if (!X) return null;
    const k = mes + '|' + region + '|' + slot;
    if (memo.has(k)) return memo.get(k);
    const acc = { total: new Map(), marca: new Map(), mreal: new Map(), grupo: new Map(), region: new Map(), estado: new Map(), supervisor: new Map(), asesor: new Map() };
    const sumar = (dim, item, id, v) => {
      const m = acc[dim];
      if (!m.has(item)) m.set(item, new Map());
      const s = m.get(item);
      s.set(id, (s.get(id) || 0) + v);
    };
    for (const r of X.porMes.get(mes) || []) {
      if (region !== TODAS && r.c.region !== region) continue;
      if (!pasaSlot(r.marca, slot)) continue;
      sumar('total', TODAS, r.id, r.v);
      sumar('marca', topMarcas.has(r.marca) ? r.marca : 'Otras', r.id, r.v);
      sumar('mreal', r.marca, r.id, r.v);
      sumar('grupo', grupoDe.get(r.marca) || '—', r.id, r.v);
      sumar('region', r.c.region, r.id, r.v);
      sumar('estado', r.c.estado, r.id, r.v);
      sumar('supervisor', r.c.supervisor, r.id, r.v);
      sumar('asesor', r.c.asesor, r.id, r.v);
    }
    memo.set(k, acc);
    return acc;
  }
  const activos = (mapa) => { let n = 0; if (mapa) for (const v of mapa.values()) if (v > 0) n++; return n; };
  // cantidad de clientes distintos con compra neta positiva
  function count(dim, item, mes, region, slot) {
    if (!['total', 'marca', 'grupo', 'region', 'estado', 'supervisor', 'asesor'].includes(dim)) return undefined;
    const acc = cortes(mes, region || TODAS, slot || TODAS);
    if (!acc) return null;
    return activos(acc[dim].get(item));
  }

  // ---------- pestaña Clientes ----------
  const st = { top: '20', buscar: '', cruzada: '' };
  function cardTitulo(id, titulo, extra) { const h = el('div', 'fb-cardhead'); h.append(el('h2', 'fb-h2', titulo)); if (extra) h.append(extra); return h; }
  function barras(box, filas, opt) {
    box.replaceChildren();
    if (!filas.length) { box.append(el('p', 'fb-empty', 'Sin datos para este filtro.')); return; }
    const max = Math.max(...filas.map((f) => Math.abs(f.v)), opt.max || 0) || 1;
    for (const f of filas) {
      const row = el('div', 'cl-bar');
      const n = el('span', 'cl-bar-n', f.label);
      const track = el('span', 'cl-bar-t');
      const fill = el('i'); fill.style.width = Math.max(0.5, (100 * Math.max(0, f.v)) / max) + '%';
      if (f.color) fill.style.background = f.color;
      track.append(fill);
      const v = el('span', 'cl-bar-v', f.txt);
      row.append(n, track, v);
      if (f.title) row.title = f.title;
      box.append(row);
    }
  }
  function columnas(box, pts) {
    box.replaceChildren();
    const cerr = pts.filter((p) => !enCurso(p.mes) && p.v != null);
    const vmax = cerr.length > 1 ? cerr.reduce((a, b) => (b.v > a.v ? b : a)).mes : null;
    const vmin = cerr.length > 1 ? cerr.reduce((a, b) => (b.v < a.v ? b : a)).mes : null;
    const max = Math.max(1, ...pts.map((p) => p.v || 0));
    const wrap = el('div', 'cl-cols');
    for (const p of pts) {
      const c = el('div', 'cl-col' + (p.sel ? ' cl-sel' : '') + (enCurso(p.mes) ? ' cl-curso' : ''));
      const val = el('span', 'cl-col-v', ent(p.v));
      const bar = el('i'); bar.style.height = Math.max(2, (100 * (p.v || 0)) / max) + '%';
      if (p.mes === vmax) bar.style.background = 'var(--color-ok)';
      else if (p.mes === vmin) bar.style.background = 'var(--color-bad)';
      const lab = el('span', 'cl-col-l', corto(p.mes) + (enCurso(p.mes) ? '*' : ''));
      const t = el('div', 'cl-col-b'); t.append(bar);
      c.append(val, t, lab);
      c.title = largo(p.mes) + ': ' + ent(p.v) + ' clientes';
      wrap.append(c);
    }
    box.append(wrap);
  }
  function tablaClientes(box, filas, cols) {
    box.replaceChildren();
    const t = el('table', 'fb-table cl-table');
    const tr = el('tr');
    for (const c of cols) tr.append(el('th', c.l ? 'cl-l' : null, c.t));
    const th = el('thead'); th.append(tr); t.append(th);
    const tb = el('tbody');
    for (const r of filas) {
      const row = el('tr');
      for (const c of cols) { const td = el('td', c.l ? 'cl-l' : null, c.f(r)); if (c.cls) { const k = c.cls(r); if (k) td.classList.add(k); } row.append(td); }
      tb.append(row);
    }
    if (!filas.length) { const row = el('tr'); const td = el('td', 'fb-empty', 'Sin clientes para este filtro.'); td.colSpan = cols.length; row.append(td); tb.append(row); }
    t.append(tb);
    box.append(t);
  }
  function porCliente(mes, region, slot) {
    const X = indice();
    const m = new Map();
    for (const r of (X && X.porMes.get(mes)) || []) {
      if (region !== TODAS && r.c.region !== region) continue;
      if (!pasaSlot(r.marca, slot)) continue;
      const o = m.get(r.id) || { id: r.id, c: r.c, v: 0, marcas: new Set() };
      o.v += r.v;
      if (r.v > 0) o.marcas.add(r.marca);
      m.set(r.id, o);
    }
    return m;
  }

  function render(ctx) {
    const X = indice();
    const pag = $('#pag-clientes');
    if (!pag) return;
    const vacio = $('#cl-estado');
    if (!X) { vacio.hidden = false; vacio.textContent = 'Cargando clientes…'; $('#cl-contenido').hidden = true; return; }
    vacio.hidden = true; $('#cl-contenido').hidden = false;
    const { sel, meses } = ctx;
    const mes = sel.mes, region = sel.region, slot = sel.slot;
    const iM = meses.indexOf(mes), prev = meses[iM - 1];
    const act = porCliente(mes, region, slot);
    const ant = prev ? porCliente(prev, region, slot) : new Map();
    const activosAhora = [...act.values()].filter((o) => o.v > 0);
    const activosAntes = new Set([...ant.values()].filter((o) => o.v > 0).map((o) => o.id));
    // clientes que compraron en algún mes anterior del año
    const vistos = new Set();
    for (const m of meses.slice(0, Math.max(0, iM))) for (const o of porCliente(m, region, slot).values()) if (o.v > 0) vistos.add(o.id);
    const nuevos = activosAhora.filter((o) => !vistos.has(o.id));
    const perdidos = [...ant.values()].filter((o) => o.v > 0 && !(act.get(o.id) && act.get(o.id).v > 0));
    const ventaTot = activosAhora.reduce((a, o) => a + o.v, 0);
    const nAnt = activosAntes.size;
    const parcial = enCurso(mes) ? ' (mes en curso)' : '';
    // indicadores
    const k = $('#cl-kpis');
    k.replaceChildren();
    const tile = (lab, val, sub, cls) => { const c = el('div', 'fb-card'); c.setAttribute('data-source', 'clientes clientes_ventas'); c.append(el('div', 'fb-label', lab), el('div', 'fb-big', val)); const s = el('div', 'fb-delta' + (cls ? ' ' + cls : ''), sub); c.append(s); k.append(c); };
    const varC = nAnt ? activosAhora.length / nAnt - 1 : null;
    tile('Clientes únicos · ' + largo(mes), ent(activosAhora.length), prev ? (enCurso(mes) ? 'Mes en curso · ' + ent(nAnt) + ' en ' + MESL[+prev.slice(5, 7) - 1] : spct(varC) + ' vs. ' + largo(prev)) : 'Primer mes del período', enCurso(mes) || varC == null ? '' : varC >= 0 ? 'fb-pos' : 'fb-neg');
    tile('Clientes nuevos', ent(nuevos.length), iM > 0 ? 'Primera compra del año en ' + MESL[+mes.slice(5, 7) - 1] : 'Enero es el primer mes cargado', '');
    tile('Clientes perdidos', ent(perdidos.length), prev ? 'Compraron en ' + MESL[+prev.slice(5, 7) - 1] + ' y no en ' + MESL[+mes.slice(5, 7) - 1] + parcial : '—', '');
    tile('Venta promedio por cliente', usd(activosAhora.length ? ventaTot / activosAhora.length : null), 'Venta del mes / clientes únicos', '');
    // clientes por mes
    columnas($('#cl-meses'), meses.map((m) => ({ mes: m, v: activos(new Map([...porCliente(m, region, slot).values()].map((o) => [o.id, o.v]))), sel: m === mes })));
    // cobertura por marca (ignora el filtro de marca, respeta región y grupo)
    const slotG = sel.grupo !== TODAS ? 'Grupo ' + sel.grupo : TODAS;
    const acc = cortes(mes, region, slotG);
    const base = activos(acc.total.get(TODAS));
    const cob = [...acc.mreal.entries()].map(([mk, m]) => ({ mk, n: activos(m) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
    $('#cl-n-cob').textContent = 'De ' + ent(base) + ' clientes que compraron en ' + largo(mes) + (region !== TODAS ? ' en ' + region : '') + (sel.grupo !== TODAS ? ' (' + sel.grupo + ')' : '') + ', qué porcentaje compró cada marca.';
    barras($('#cl-cob'), cob.slice(0, 15).map((x) => ({ label: x.mk, v: x.n / (base || 1), txt: pct(x.n / (base || 1)) + ' · ' + ent(x.n), color: x.mk === sel.marca ? 'var(--color-fg)' : null })), { max: 1 });
    // venta cruzada
    const selC = $('#cl-cruzada');
    const opciones = cob.map((x) => x.mk);
    if (!st.cruzada || !opciones.includes(st.cruzada)) st.cruzada = sel.marca !== TODAS && opciones.includes(sel.marca) ? sel.marca : opciones[0] || '';
    selC.replaceChildren(...opciones.map((mk) => new Option(mk, mk)));
    selC.value = st.cruzada;
    const compA = acc.mreal.get(st.cruzada);
    const idsA = new Set(compA ? [...compA].filter(([, v]) => v > 0).map(([id]) => id) : []);
    const opp = cob.filter((x) => x.mk !== st.cruzada).map((x) => {
      const mB = acc.mreal.get(x.mk);
      let n = 0;
      for (const id of idsA) if (mB && (mB.get(id) || 0) > 0) n++;
      return { mk: x.mk, n };
    }).sort((a, b) => b.n - a.n).slice(0, 12);
    $('#cl-n-cruz').textContent = ent(idsA.size) + ' clientes compraron ' + st.cruzada + ' en ' + largo(mes) + '. Cada barra muestra cuántos de ellos también compraron esa otra marca, y qué porcentaje son de los clientes de ' + st.cruzada + '.';
    barras($('#cl-cruz'), opp.map((x) => ({ label: x.mk, v: x.n, txt: ent(x.n) + ' · ' + pct(idsA.size ? x.n / idsA.size : null), color: '#1BAF7A', title: x.n + ' clientes compraron ' + st.cruzada + ' y ' + x.mk + '; ' + (idsA.size - x.n) + ' compraron ' + st.cruzada + ' pero no ' + x.mk + '.' })), { max: idsA.size || 1 });
    // ranking
    const q = st.buscar.trim().toLowerCase();
    let rk = [...act.values()].filter((o) => o.v !== 0).map((o) => ({ ...o, prev: ant.get(o.id) ? ant.get(o.id).v : null })).sort((a, b) => b.v - a.v);
    rk.forEach((o, i) => { o.pos = i + 1; });
    if (q) rk = rk.filter((o) => o.c.cliente.toLowerCase().includes(q) || o.c.asesor.toLowerCase().includes(q) || o.c.estado.toLowerCase().includes(q));
    const totalRk = rk.length;
    if (st.top !== 'todos') rk = rk.slice(0, +st.top);
    $('#cl-n-rank').textContent = ent(totalRk) + (q ? ' clientes coinciden con la búsqueda.' : ' clientes con compras en ' + largo(mes) + '.') + (st.top !== 'todos' && totalRk > rk.length ? ' Se muestran los primeros ' + rk.length + '.' : '');
    const varCls = (o) => (o.prev == null || o.prev <= 0 || enCurso(mes) ? '' : o.v >= o.prev ? 'fb-pos' : 'fb-neg');
    tablaClientes($('#cl-rank'), rk, [
      { t: '#', f: (o) => o.pos },
      { t: 'Cliente', l: true, f: (o) => o.c.cliente },
      { t: 'Estado', l: true, f: (o) => o.c.estado },
      { t: 'Asesor', l: true, f: (o) => o.c.asesor },
      { t: 'Venta', f: (o) => usd(o.v) },
      { t: 'Mes anterior', f: (o) => usd(o.prev) },
      { t: 'Var.', f: (o) => (o.prev > 0 ? spct(o.v / o.prev - 1) + (enCurso(mes) ? ' parcial' : '') : 'nuevo en el mes'), cls: varCls },
      { t: 'Marcas', f: (o) => ent(o.marcas.size) },
    ]);
    // perdidos y nuevos
    $('#cl-t-perd').textContent = 'Clientes perdidos · ' + ent(perdidos.length);
    $('#cl-n-perd').textContent = prev ? 'Compraron en ' + largo(prev) + ' y todavía no en ' + largo(mes) + parcial + '. Ordenados por lo que compraron el mes anterior.' : '';
    tablaClientes($('#cl-perd'), perdidos.sort((a, b) => b.v - a.v).slice(0, 25), [
      { t: 'Cliente', l: true, f: (o) => o.c.cliente },
      { t: 'Estado', l: true, f: (o) => o.c.estado },
      { t: 'Asesor', l: true, f: (o) => o.c.asesor },
      { t: 'Compra mes anterior', f: (o) => usd(o.v) },
    ]);
    $('#cl-t-nue').textContent = 'Clientes nuevos · ' + ent(nuevos.length);
    $('#cl-n-nue').textContent = 'Compraron en ' + largo(mes) + ' por primera vez en el año.';
    tablaClientes($('#cl-nue'), nuevos.sort((a, b) => b.v - a.v).slice(0, 25), [
      { t: 'Cliente', l: true, f: (o) => o.c.cliente },
      { t: 'Estado', l: true, f: (o) => o.c.estado },
      { t: 'Asesor', l: true, f: (o) => o.c.asesor },
      { t: 'Compra del mes', f: (o) => usd(o.v) },
    ]);
  }

  let ultimoCtx = null;
  const redibujar = () => { if (ultimoCtx && window.fbPagina === 'clientes') render(ultimoCtx); };
  document.addEventListener('change', (e) => {
    if (e.target.id === 'cl-top') { st.top = e.target.value; redibujar(); }
    if (e.target.id === 'cl-cruzada') { st.cruzada = e.target.value; redibujar(); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'cl-buscar') { st.buscar = e.target.value; redibujar(); } });
  window.fbClientes = {
    count,
    setContexto(g, top) { const nuevo = [...top].join('|'); if (g !== grupoDe || nuevo !== [...topMarcas].join('|')) { grupoDe = g; topMarcas = new Set(top); memo = new Map(); } },
    render(ctx) { ultimoCtx = ctx; render(ctx); },
    listo: () => !!indice(),
  };
})();
