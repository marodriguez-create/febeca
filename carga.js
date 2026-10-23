(function () {
  const PLANTILLA_B64 = () => window.FB_PLANTILLAS && window.FB_PLANTILLAS.mensual;
  const PLANTILLA_SEM_B64 = () => window.FB_PLANTILLAS && window.FB_PLANTILLAS.semanal;
  const TIPOS = {
    ventas: { nombre: 'Ventas', req: ['Región', 'Estado', 'Supervisor', 'Asesor', 'BDF', 'Grupo Compra', 'Marca', 'Mes', 'Clientes activados', 'Venta Neta Dólares', 'Venta Neta Cantidad'] },
    tubrica: { nombre: 'Venta por código con peso', req: ['Región', 'Estado', 'Supervisor', 'Asesor', 'Marca', 'Articulo', 'Mes', 'Venta Neta Dólares', 'Venta Neta Cantidad'] },
    peso: { nombre: 'Tabla de peso', req: ['Codigo', 'Kg', 'Ton'] },
    infocompras: { nombre: 'Infocompras', req: ['ARTICULO', 'DESCRIPCION', 'MARCA', 'INVENTARIO', 'VALORACION', 'COSTO PROMEDIO', 'AVG VTAS MES', 'COBERTURA', 'GRUPO COMPRA'] },
    clientes: { nombre: 'Clientes', req: ['Región', 'Estado', 'Supervisor', 'Asesor', 'Marca', 'Cliente', 'Mes', 'Venta Neta Dólares'] },
    semanal: { nombre: 'Ventas semanales', req: ['Grupo Compra', 'Marca', 'Semana', 'Clientes activados', 'Contribución', 'Rotación', 'Venta Neta'] },
  };
  const HOJAS_SEM = { presupuesto: ['Marca', 'Grupo Compra'], acciones: ['Marcas', 'Acciones'], sheet2: ['Marca', 'Venta Neta'] };
  const PARTE_MAX = 12 * 1024 * 1024;
  const $ = (s) => document.querySelector(s);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const nEnt = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });
  const usd = (v) => '$' + nEnt.format(v);
  const use = (name) => (window.claude && typeof window.claude.use === 'function' ? window.claude.use(name).catch(() => null) : Promise.resolve(null));
  const capDb = use('db'), capAssets = use('assets'), capUser = use('user'), capDown = use('downloads');
  let analisis = null;

  const setMsg = (el, text, cls) => { el.textContent = text; el.className = 'fb-note' + (cls ? ' ' + cls : ''); };
  const enlaceRespaldo = (el, text) => { el.textContent = text + ' Pídele permiso de edición a quien te compartió el dashboard.'; el.className = 'fb-note'; };

  // ---------- lector de Excel (.xlsx) sin librerías ----------
  const decXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)).replace(/&amp;/g, '&');
  const colIdx = (ref) => { let n = 0; for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };
  async function leerXlsx(buf, todas) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('no es xlsx');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const ent = {};
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      ent[td.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, off };
      p += 46 + nlen + xlen + clen;
    }
    const leer = async (name) => {
      const x = ent[name];
      if (!x) return null;
      const start = x.off + 30 + dv.getUint16(x.off + 26, true) + dv.getUint16(x.off + 28, true);
      const data = u8.subarray(start, start + x.csize);
      if (x.method === 0) return td.decode(data);
      const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(s).text();
    };
    const wbx = (await leer('xl/workbook.xml')) || '';
    const rels = (await leer('xl/_rels/workbook.xml.rels')) || '';
    const hojasWb = [...wbx.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ nombre: decXml((m[0].match(/name="([^"]*)"/) || [])[1] || ''), rid: (m[0].match(/r:id="([^"]+)"/) || [])[1] }));
    const destinoDe = (rid) => {
      let destino = 'worksheets/sheet1.xml';
      for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
        if (rid && m[0].includes('Id="' + rid + '"')) { const t = m[0].match(/Target="([^"]+)"/); if (t) destino = t[1]; }
      }
      return 'xl/' + destino.replace(/^\/?xl\//, '');
    };
    const ssx = await leer('xl/sharedStrings.xml');
    const ss = [];
    if (ssx) for (const m of ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(decXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')));
    const parsear = (hoja) => {
    const filas = [];
    for (const rm of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const fila = [];
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = cm[1], inner = cm[3] || '';
        const ref = (at.match(/r="([A-Z]+)\d+"/) || [])[1];
        const t = (at.match(/\bt="([^"]+)"/) || [])[1];
        const v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (t === 's') val = ss[+v] ?? '';
        else if (t === 'inlineStr') val = decXml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (t === 'str' || t === 'e') val = v != null ? decXml(v) : '';
        else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else val = v != null ? Number(v) : '';
        fila[ref ? colIdx(ref) : fila.length] = val;
      }
      for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = '';
      filas.push(fila);
    }
    return filas;
    };
    if (!todas) {
      const hoja = await leer(destinoDe(hojasWb[0] && hojasWb[0].rid));
      if (!hoja) throw new Error('sin hoja');
      return parsear(hoja);
    }
    const out = [];
    for (const hw of hojasWb) { const x = await leer(destinoDe(hw.rid)); if (x) out.push({ nombre: hw.nombre, filas: parsear(x) }); }
    return out;
  }
  function leerCsv(texto) {
    const filas = [];
    let fila = [], cur = '', q = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (q) { if (ch === '"') { if (texto[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
      if (ch === '"') q = true;
      else if (ch === ',' || ch === ';') { fila.push(cur); cur = ''; }
      else if (ch === '\n') { fila.push(cur.replace(/\r$/, '')); filas.push(fila); fila = []; cur = ''; }
      else cur += ch;
    }
    if (cur || fila.length) { fila.push(cur); filas.push(fila); }
    return filas;
  }

  // ---------- plantilla ----------
  capDown.then((d) => { if (!d) { $('#cg-b-plantilla').hidden = true; enlaceRespaldo($('#cg-m-plantilla'), 'La descarga no está disponible en esta vista.'); } });
  const bajar = async (b64, nombre) => {
    const msg = $('#cg-m-plantilla');
    const d = await capDown;
    if (!d) return;
    if (!b64) { setMsg(msg, 'La plantilla todavía está cargando. Inténtalo de nuevo en unos segundos.'); return; }
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try {
      await d.save({ filename: nombre, data: bytes });
      setMsg(msg, 'Plantilla descargada.', 'fb-pos');
    } catch (e) {
      setMsg(msg, e && e.code === 'declined' ? 'Descarga cancelada.' : 'No se pudo descargar la plantilla. Inténtalo de nuevo.');
    }
  };
  $('#cg-b-plantilla').addEventListener('click', () => bajar(PLANTILLA_B64(), 'Plantilla_Datos_Dashboard_Ventas_Febeca.xlsx'));
  $('#cg-b-plantilla-sem').addEventListener('click', () => bajar(PLANTILLA_SEM_B64(), 'Plantilla_Ventas_actualizadas.xlsx'));
  capDown.then((d) => { if (!d) $('#cg-b-plantilla-sem').hidden = true; });

  // ---------- revisión del archivo ----------
  const check = (texto, nivel) => {
    const li = document.createElement('li');
    if (nivel) li.className = nivel;
    li.textContent = texto;
    $('#cg-checks').append(li);
  };
  const esNota = (r) => { const t = norm(r.find((c) => c !== '' && c != null)); return t === '' || t.startsWith('filtros aplicados') || t.startsWith('exported data') || r.some((c) => typeof c === 'string' && norm(c).startsWith('ejemplo')); };
  // el sistema a veces exporta las columnas semanales con otro nombre: se aceptan ambos
  const ALIAS_SEM = { 'venta neta dolares': 'Venta Neta', 'inventario dolares': 'Inventario' };
  const conAlias = (filas) => filas.map((r, i) => (i < 30 ? r.map((c) => (typeof c === 'string' && ALIAS_SEM[norm(c)]) || c) : r));
  const buscarEncabezado = (filas, req) => {
    const rn = req.map(norm);
    for (let i = 0; i < Math.min(filas.length, 30); i++) { const s = new Set(filas[i].map(norm)); if (rn.every((c) => s.has(c))) return i; }
    return -1;
  };
  async function analizar() {
    const file = $('#cg-archivo').files[0];
    const msg = $('#cg-m-carga');
    $('#cg-checks').replaceChildren();
    setMsg(msg, '');
    $('#cg-b-subir').disabled = true;
    analisis = null;
    if (!file) return;
    const tipo = $('#cg-tipo').value;
    setMsg(msg, 'Leyendo ' + file.name + '…');
    if (tipo === 'completa') return analizarCompleta(file, msg);
    let filas, libro = null, hojaUsada = null;
    try {
      if (tipo === 'semanal') {
        if (/\.csv$/i.test(file.name)) { setMsg(msg, 'Las ventas semanales se suben en Excel (.xlsx), con sus hojas.', 'fb-neg'); return; }
        const crudo = await leerXlsx(await file.arrayBuffer(), true);
        libro = crudo.map((h) => ({ nombre: h.nombre, filas: conAlias(h.filas) }));
        const s1 = libro.find((x) => buscarEncabezado(x.filas, TIPOS.semanal.req) >= 0);
        if (!s1 && crudo.some((x) => ['ventas', 'tubrica', 'peso', 'infocompras', 'clientes'].some((k) => buscarEncabezado(x.filas, TIPOS[k].req) >= 0))) {
          $('#cg-tipo').value = 'completa';
          return analizarCompleta(file, msg);
        }
        if (s1 && s1 !== libro[0]) libro = [s1, ...libro.filter((x) => x !== s1)];
        filas = libro[0] ? libro[0].filas : [];
      } else if (/\.csv$/i.test(file.name)) filas = leerCsv(await file.text());
      else {
        // en un libro con varias hojas (por ejemplo la plantilla), se usa la hoja que tenga las columnas de este tipo
        const hojas = await leerXlsx(await file.arrayBuffer(), true);
        const hoja = hojas.find((x) => buscarEncabezado(x.filas, TIPOS[tipo].req) >= 0) || hojas[0];
        filas = hoja ? hoja.filas : [];
        if (hoja && hojas.length > 1) hojaUsada = hoja.nombre;
      }
    } catch (e) {
      setMsg(msg, 'No se pudo leer el archivo. Guárdalo como Excel (.xlsx) o CSV e inténtalo de nuevo.', 'fb-neg');
      return;
    }
    const muestra = filas.slice(0, 8).concat(filas.slice(-6)).map((r) => r.join(' ')).join(' ').toLowerCase();
    const cortado = muestra.includes('exported data limited') || muestra.includes('exceeded the allowed volume');
    const hi = buscarEncabezado(filas, TIPOS[tipo].req);
    if (hi < 0) {
      const otro = Object.keys(TIPOS).find((k) => k !== tipo && buscarEncabezado(filas, TIPOS[k].req) >= 0);
      if (otro) check('Este archivo parece de tipo "' + TIPOS[otro].nombre + '". Cambia el tipo de reporte.', 'cg-x');
      else {
        const rn = TIPOS[tipo].req.map(norm);
        let mejor = -1, faltan = TIPOS[tipo].req;
        for (let i = 0; i < Math.min(filas.length, 30); i++) {
          const s = new Set(filas[i].map(norm));
          const ok = rn.filter((c) => s.has(c)).length;
          if (ok > mejor) { mejor = ok; faltan = TIPOS[tipo].req.filter((c, j) => !s.has(rn[j])); }
        }
        check('Faltan columnas: ' + faltan.join(', ') + '.', 'cg-x');
      }
      setMsg(msg, 'Corrige el archivo o el tipo antes de subirlo.', 'fb-neg');
      return;
    }
    const enc = filas[hi].map((c) => String(c).trim());
    const datos = filas.slice(hi + 1).filter((r) => !esNota(r));
    check('Columnas completas para ' + TIPOS[tipo].nombre + '.' + (hojaUsada ? ' Se usa la hoja «' + hojaUsada + '».' : ''));
    check(nEnt.format(datos.length) + ' filas de datos.');
    if (cortado) check('El sistema cortó este archivo por límite de filas. Vuelve a exportarlo sin Cliente o en dos períodos.', 'cg-x');
    const idx = (n) => enc.findIndex((c) => norm(c) === norm(n));
    let venta = null, meses = [];
    const extra = [];
    if (tipo === 'semanal') {
      const iv = idx('Venta Neta'), is = idx('Semana');
      venta = 1000 * datos.reduce((a, r) => a + (Number(r[iv]) || 0), 0);
      meses = [...new Set(datos.map((r) => String(r[is])).filter(Boolean))].sort();
      check('Venta neta ' + usd(venta) + ' · semanas ' + (meses.length ? meses[0] + ' a ' + meses[meses.length - 1] : 'sin dato') + '.');
      { // filas de otras regiones (no Venezuela) o sin región: solo repiten inventario y rotación por marca
        const ir = idx('Región');
        if (ir >= 0) {
          const VE = new Set(Object.values(REG));
          const fuera = datos.filter((r) => !VE.has(region(r[ir])));
          const otras = [...new Set(fuera.map((r) => String(r[ir] ?? '').trim()).filter(Boolean))];
          if (fuera.length) check('Se omiten ' + nEnt.format(fuera.length) + ' filas de otras regiones' + (otras.length ? ' (' + otras.slice(0, 3).join(', ') + (otras.length > 3 ? '…' : '') + ')' : '') + ' o sin región: solo repiten el inventario y la rotación de cada marca.', 'cg-w');
        }
        if (idx('Presupuesto de contribución') < 0) check('Sin la columna «Presupuesto de contribución»' + (enc.some((c) => /presupuesto/i.test(c)) ? ' (la columna «' + enc.find((c) => /presupuesto/i.test(c)) + '» no se usa porque es otro dato)' : '') + ': el presupuesto de contribución queda vacío.', 'cg-w');
      }
      { const act = totalDataset('semanal', 'venta_usd'); if (act != null) check('Hoy el dashboard tiene ' + usd(act) + ' en ventas semanales. Al actualizar se reemplaza por completo.', 'cg-w'); }
      for (const [clave, nombre] of [['presupuesto', 'Presupuesto'], ['acciones', 'Acciones'], ['sheet2', 'Sheet2']]) {
        const hj = libro.slice(1).find((x) => norm(x.nombre) === norm(nombre));
        const hh = hj ? buscarEncabezado(hj.filas, HOJAS_SEM[clave]) : -1;
        if (!hj || hh < 0) { check('Sin hoja ' + nombre + ' (o sin sus columnas): se conservan los datos anteriores.', 'cg-w'); continue; }
        const enc2 = hj.filas[hh].map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim()));
        const dat2 = hj.filas.slice(hh + 1).filter((r) => r.some((c) => c !== '' && c != null) && !r.some((c) => typeof c === 'string' && norm(c).startsWith('ejemplo')));
        if (!dat2.length) { check('Hoja ' + nombre + ': sin datos, se conservan los datos anteriores.', 'cg-w'); continue; }
        extra.push({ hoja: nombre, enc: enc2, datos: dat2 });
        check('Hoja ' + nombre + ': ' + nEnt.format(dat2.length) + ' filas.');
      }
    }
    if (tipo === 'ventas' || tipo === 'tubrica' || tipo === 'clientes') {
      const iv = idx('Venta Neta Dólares'), im = idx('Mes');
      const ms = new Set();
      venta = 0;
      for (const r of datos) { venta += Number(r[iv]) || 0; if (r[im] !== '') ms.add(String(r[im])); }
      venta *= 1000;
      meses = [...ms].sort((a, b) => { const [ma, ya] = a.split('-').map(Number), [mb, yb] = b.split('-').map(Number); return ya - yb || ma - mb; });
      check('Venta neta ' + usd(venta) + ' · meses ' + (meses.length ? meses[0] + ' a ' + meses[meses.length - 1] : 'sin dato') + '.');
      { const act = totalDataset(tipo === 'tubrica' ? 'tubrica' : 'ventas', 'venta_usd'); if (act != null) check(tipo === 'clientes' ? 'Las ventas del dashboard suman ' + usd(act) + '. Solo se usarán las filas que coincidan con ellas (empresa Febeca).' : 'Hoy el dashboard tiene ' + usd(act) + '. Al actualizar se reemplaza por completo.', 'cg-w'); }
      if (tipo === 'tubrica') {
        const ik = idx('Marca'), ia = idx('Articulo');
        const r = marcasConPeso(datos.map((x) => ({ marca: String(x[ik] ?? '').trim(), codigo: codigoDe(x[ia]) })), null);
        if (col(enc, 'Cliente') >= 0) check('Trae la columna Cliente: también se actualizan los clientes por línea.'); else check('Sin columna Cliente: los clientes por línea quedan como estaban. Agrégala si quieres contarlos por línea.', 'cg-w');
        if (r) check('Marcas con peso: ' + (r.con.join(', ') || 'ninguna') + '.' + (r.sin.length ? ' Se omiten las que no tienen códigos en la tabla de peso: ' + r.sin.slice(0, 5).join(', ') + (r.sin.length > 5 ? '…' : '') + '.' : ''), r.con.length ? (r.sin.length ? 'cg-w' : '') : 'cg-x');
      }
    }
    if (tipo === 'infocompras') {
      const ig = idx('GRUPO COMPRA');
      const gs = [...new Set(datos.map((r) => r[ig]).filter(Boolean))];
      check('Grupos de compra en el archivo: ' + (gs.join(', ') || 'sin dato') + '. Los artículos de los demás grupos que ya estaban se conservan.');
      const ia = idx('ARTICULO'), cods = datos.map((r) => String(r[ia] ?? '').trim()).filter(Boolean), rep = cods.length - new Set(cods).size;
      if (rep) check('Hay ' + nEnt.format(rep) + ' artículos repetidos en el archivo (¿se pegó el reporte dos veces?). Se usará una sola fila por artículo: la última.', 'cg-w');
    }
    if (!datos.length) { check('No hay filas de datos.', 'cg-x'); setMsg($('#cg-m-carga'), 'El archivo no tiene datos debajo del encabezado (solo la fila de ejemplo). Pega los datos y vuelve a subirlo.', 'fb-neg'); return; }
    { // protección: un archivo casi vacío (por ejemplo, la plantilla con solo la fila de ejemplo) no reemplaza los datos
      const dsDe = { ventas: 'ventas', tubrica: 'tubrica', peso: 'pesos', infocompras: 'inventario', clientes: 'clientes_ventas', semanal: 'semanal' };
      const d = dash.data(dsDe[tipo]);
      const actualN = d.status === 'ok' ? d.data.length : 0;
      if (actualN >= 50 && datos.length < actualN * 0.05) {
        check('Este archivo trae solo ' + nEnt.format(datos.length) + ' filas y el dashboard tiene ' + nEnt.format(actualN) + '. Parece incompleto (¿quedó solo la fila de ejemplo?), así que no se aplica.', 'cg-x');
        setMsg($('#cg-m-carga'), 'Pega los datos completos en la hoja y vuelve a subirla.', 'fb-neg');
        return;
      }
    }
    analisis = { tipo, archivo: file.name, enc, datos, cortado, venta, meses, extra };
    const a = await capAssets;
    if (!a) { enlaceRespaldo(msg, 'Desde esta vista no se pueden subir archivos (se necesita permiso de edición).'); return; }
    $('#cg-b-subir').disabled = false;
    if (cortado) { setMsg(msg, 'Este archivo vino cortado y no se puede aplicar. Vuelve a exportarlo completo.', 'fb-neg'); return; }
    setMsg(msg, 'Listo para actualizar.', 'fb-pos');
  }
  // plantilla mensual completa: se revisa cada hoja llena y se actualiza todo en una sola subida
  const DS_DE = { ventas: 'ventas', tubrica: 'tubrica', peso: 'pesos', infocompras: 'inventario', clientes: 'clientes_ventas' };
  async function analizarCompleta(file, msg) {
    if (/\.csv$/i.test(file.name)) { setMsg(msg, 'La plantilla completa se sube en Excel (.xlsx), con todas sus hojas.', 'fb-neg'); return; }
    let hojas;
    try { hojas = await leerXlsx(await file.arrayBuffer(), true); } catch (e) { setMsg(msg, 'No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.', 'fb-neg'); return; }
    const esMensual = hojas.some((x) => ['ventas', 'tubrica', 'peso', 'infocompras', 'clientes'].some((k) => buscarEncabezado(x.filas, TIPOS[k].req) >= 0));
    if (!esMensual && hojas.some((x) => buscarEncabezado(conAlias(x.filas), TIPOS.semanal.req) >= 0)) {
      $('#cg-tipo').value = 'semanal';
      await analizar();
      check('Este archivo es la plantilla de ventas semanales: se cambió el tipo de reporte automáticamente.', 'cg-w');
      return;
    }
    const items = [];
    for (const k of ['ventas', 'peso', 'clientes', 'tubrica', 'infocompras']) {
      const T = TIPOS[k];
      const hoja = hojas.find((x) => buscarEncabezado(x.filas, T.req) >= 0);
      if (!hoja) { check(T.nombre + ': no está en el archivo, se conserva lo actual.', 'cg-w'); continue; }
      const hi = buscarEncabezado(hoja.filas, T.req);
      const enc = hoja.filas[hi].map((c) => String(c).trim());
      const datos = hoja.filas.slice(hi + 1).filter((r) => !esNota(r));
      const et = T.nombre + ' (hoja «' + hoja.nombre + '»)';
      if (!datos.length) { check(et + ': sin datos, se omite y se conserva lo actual.', 'cg-w'); continue; }
      const muestra = hoja.filas.slice(0, 8).concat(hoja.filas.slice(-6)).map((r) => r.join(' ')).join(' ').toLowerCase();
      if (muestra.includes('exported data limited') || muestra.includes('exceeded the allowed volume')) { check(et + ': el sistema la cortó por límite de filas, no se aplica.', 'cg-x'); continue; }
      const d = dash.data(DS_DE[k]);
      const actualN = d.status === 'ok' ? d.data.length : 0;
      if (actualN >= 50 && datos.length < actualN * 0.05) { check(et + ': trae solo ' + nEnt.format(datos.length) + ' filas y el dashboard tiene ' + nEnt.format(actualN) + '. Parece incompleta, se omite.', 'cg-x'); continue; }
      let venta = null, meses = [];
      if (k === 'ventas' || k === 'tubrica' || k === 'clientes') {
        const iv = enc.findIndex((c) => norm(c) === norm('Venta Neta Dólares')), im = enc.findIndex((c) => norm(c) === 'mes');
        const ms = new Set();
        venta = 0;
        for (const r of datos) { venta += Number(r[iv]) || 0; if (r[im] !== '') ms.add(String(r[im])); }
        venta *= 1000;
        meses = [...ms].sort((a, b) => { const [ma, ya] = a.split('-').map(Number), [mb, yb] = b.split('-').map(Number); return ya - yb || ma - mb; });
      }
      items.push({ tipo: k, archivo: file.name + ' · ' + hoja.nombre, enc, datos, cortado: false, venta, meses, extra: [] });
      if (k === 'infocompras') {
        const ia = enc.findIndex((c) => norm(c) === 'articulo'), cods = datos.map((r) => String(r[ia] ?? '').trim()).filter(Boolean), rep = cods.length - new Set(cods).size;
        if (rep) check(T.nombre + ': hay ' + nEnt.format(rep) + ' artículos repetidos (¿se pegó el reporte dos veces?). Se usará una sola fila por artículo: la última.', 'cg-w');
      }
      check(et + ': ' + nEnt.format(datos.length) + ' filas' + (venta != null ? ' · venta ' + usd(venta) : '') + (meses.length ? ' · ' + meses[0] + ' a ' + meses[meses.length - 1] : '') + '. Se actualiza.');
    }
    if (!items.length) { setMsg(msg, 'No hay hojas con datos para actualizar. Pega los datos en la plantilla y vuelve a subirla.', 'fb-neg'); return; }
    analisis = { tipo: 'completa', archivo: file.name, items };
    const a = await capAssets;
    if (!a) { enlaceRespaldo(msg, 'Desde esta vista no se pueden subir archivos (se necesita permiso de edición).'); return; }
    $('#cg-b-subir').disabled = false;
    setMsg(msg, 'Listo para actualizar ' + items.length + (items.length === 1 ? ' hoja.' : ' hojas.'), 'fb-pos');
  }
  $('#cg-archivo').addEventListener('change', analizar);
  $('#cg-tipo').addEventListener('change', analizar);

  // ---------- subida ----------
  function aCsv(enc, filas) {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cab = enc.map(esc).join(',') + '\n';
    const partes = [];
    let actual = cab, n = 0;
    for (const r of filas) {
      const linea = r.map(esc).join(',') + '\n';
      if (actual.length + linea.length > PARTE_MAX && n > 0) { partes.push(actual); actual = cab; n = 0; }
      actual += linea; n++;
    }
    partes.push(actual);
    return partes;
  }
  // ---------- transformación y aplicación directa al dashboard ----------
  const titulo = (s) => { const t = String(s ?? '').trim(); return t && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s(\-/.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : t; };
  const mesIso = (v) => { const m = String(v ?? '').trim().match(/^(\d{1,2})-(\d{4})$/); return m ? m[2] + '-' + m[1].padStart(2, '0') : ''; };
  const n0 = (x) => { const v = Number(x); return isFinite(v) ? v : 0; };
  const nN = (x) => (x === '' || x == null || !isFinite(Number(x)) ? '' : Number(x));
  const r2 = (x) => Math.round(x * 100) / 100;
  const serialAFecha = (v) => {
    if (v === '' || v == null) return '';
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }
    const d = new Date(v); return isNaN(d) ? String(v) : d.toISOString().slice(0, 10);
  };
  const cabMes = (v) => {
    if (typeof v === 'number' && v > 20000) return serialAFecha(v).slice(0, 7);
    if (/^\d{5}(\.\d+)?$/.test(String(v ?? '').trim()) && Number(v) > 20000) return serialAFecha(Number(v)).slice(0, 7);
    const s = String(v ?? '').trim();
    const m = s.match(/^(\d{4})-(\d{2})/); return m ? m[1] + '-' + m[2] : '';
  };
  const MESES_ES = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };
  const mesDeTexto = (s) => { const m = norm(s).match(/^(?:dias sin inv )?([a-z]+) (\d{4})$/); return m && MESES_ES[m[1]] ? m[2] + '_' + MESES_ES[m[1]] : null; };
  const aCsvObj = (cols, rows) => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return cols.join(',') + '\n' + rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n') + '\n';
  };
  const col = (enc, nombre) => enc.findIndex((c) => norm(c) === norm(nombre));
  const agrupar = (rows, claves, sumas) => {
    const m = new Map();
    for (const r of rows) {
      const k = claves.map((c) => r[c]).join('\u0001');
      const g = m.get(k);
      if (!g) m.set(k, { ...r }); else for (const s of sumas) g[s] = n0(g[s]) + n0(r[s]);
    }
    return [...m.values()].map((g) => { for (const s of sumas) g[s] = r2(n0(g[s])); return g; });
  };
  const REG = { capital: 'Capital', centro: 'Centro', occidente: 'Occidente', oriente: 'Oriente' };
  const region = (s) => REG[norm(s)] || titulo(s);

  // código del artículo: el primer bloque del texto «22-10-029 Codo 90°…» → «22-10-029»
  const codigoDe = (v) => (String(v ?? '').trim().match(/^([A-Za-z0-9][\w.\-/]*)/) || [])[1] || '';
  // marcas que tienen al menos un código con peso (Ton > 0) en la tabla: esas son las que suman toneladas
  function marcasConPeso(filas, pesosNuevos) {
    const pd = pesosNuevos || (dash.data('pesos').status === 'ok' ? dash.data('pesos').data : null);
    if (!pd) return null;
    const codigos = new Set(pd.filter((p) => Number(p.ton) > 0).map((p) => String(p.codigo).trim())); // solo códigos con peso mayor a 0
    const todas = [...new Set(filas.map((r) => r.marca).filter(Boolean))];
    const con = new Set(filas.filter((r) => codigos.has(r.codigo)).map((r) => r.marca));
    return { con: todas.filter((m) => con.has(m)).sort(), sin: todas.filter((m) => !con.has(m)).sort(), set: con };
  }
  function transformar(a) {
    const E = a.enc, R = a.datos;
    if (a.tipo === 'ventas') {
      const ix = Object.fromEntries(['Región', 'Estado', 'Supervisor', 'Asesor', 'BDF', 'Grupo Compra', 'Marca', 'Mes', 'Clientes activados', 'Venta Neta Dólares', 'Venta Neta Cantidad'].map((c) => [c, col(E, c)]));
      const rows = R.map((r) => ({ mes: mesIso(r[ix.Mes]), region: region(r[ix['Región']]), estado: titulo(r[ix.Estado]), supervisor: titulo(r[ix.Supervisor]), asesor: titulo(r[ix.Asesor]), bdf: String(r[ix.BDF] ?? '').trim(), grupo: String(r[ix['Grupo Compra']] ?? '').trim(), marca: String(r[ix.Marca] ?? '').trim(), venta_usd: n0(r[ix['Venta Neta Dólares']]) * 1000, unidades: n0(r[ix['Venta Neta Cantidad']]), clientes: n0(r[ix['Clientes activados']]) })).filter((r) => r.mes && r.marca);
      const g = agrupar(rows, ['mes', 'region', 'estado', 'supervisor', 'asesor', 'bdf', 'grupo', 'marca'], ['venta_usd', 'unidades', 'clientes']);
      return [{ id: 'ventas', nombre: 'ventas_' + hoyTxt() + '.csv', csv: aCsvObj(['mes', 'region', 'estado', 'supervisor', 'asesor', 'bdf', 'grupo', 'marca', 'venta_usd', 'unidades', 'clientes'], g), filas: g.length, rows: g }];
    }
    if (a.tipo === 'tubrica') {
      const ix = Object.fromEntries(['Región', 'Estado', 'Supervisor', 'Asesor', 'Marca', 'Articulo', 'Mes', 'Venta Neta Dólares', 'Venta Neta Cantidad'].map((c) => [c, col(E, c)]));
      const todas = R.map((r) => ({ mes: mesIso(r[ix.Mes]), region: region(r[ix['Región']]), estado: titulo(r[ix.Estado]), supervisor: titulo(r[ix.Supervisor]), asesor: titulo(r[ix.Asesor]), marca: String(r[ix.Marca] ?? '').trim(), codigo: codigoDe(r[ix.Articulo]), venta_usd: n0(r[ix['Venta Neta Dólares']]) * 1000, unidades: n0(r[ix['Venta Neta Cantidad']]) })).filter((r) => r.mes && r.codigo);
      // solo las marcas con códigos en la tabla de peso (si la tabla no está, quedan todas)
      const mp = marcasConPeso(todas, a.pesosNuevos);
      const rows = mp ? todas.filter((r) => mp.set.has(r.marca)) : todas;
      const g = agrupar(rows, ['mes', 'region', 'estado', 'supervisor', 'asesor', 'marca', 'codigo'], ['venta_usd', 'unidades']);
      const nota = mp ? 'Marcas con peso: ' + (mp.con.join(', ') || 'ninguna') + '.' + (mp.sin.length ? ' Sin códigos en la tabla de peso (no se usan): ' + mp.sin.length + ' marcas.' : '') : '';
      const salida = [{ id: 'tubrica', nombre: 'ventas_por_codigo_' + hoyTxt() + '.csv', csv: aCsvObj(['mes', 'region', 'estado', 'supervisor', 'asesor', 'marca', 'codigo', 'venta_usd', 'unidades'], g), filas: g.length, nota }];
      // con la columna Cliente: también los clientes por código (para contar clientes por línea)
      const icl = col(E, 'Cliente');
      if (icl >= 0) {
        const prevC = dash.data('clientes');
        const cliBase = a.clientesNuevos || (prevC.status === 'ok' ? prevC.data : []);
        const idDe = new Map(cliBase.map((c) => [norm(c.cliente), String(c.id)]));
        const sinId = new Set();
        const fc = [];
        R.forEach((r, i) => {
          const cli = String(r[icl] ?? '').trim();
          const mes = mesIso(r[ix.Mes]), codigo = codigoDe(r[ix.Articulo]), marca = String(r[ix.Marca] ?? '').trim();
          if (!cli || !mes || !codigo || (mp && !mp.set.has(marca))) return;
          const id = idDe.get(norm(cli));
          if (!id) { sinId.add(cli); return; }
          fc.push({ id, marca, codigo, mes, venta_usd: n0(r[ix['Venta Neta Dólares']]) * 1000 });
        });
        const gc = agrupar(fc, ['id', 'marca', 'codigo', 'mes'], ['venta_usd']).filter((r) => r.venta_usd !== 0);
        const notaC = 'Clientes por código: ' + nEnt.format(new Set(gc.map((r) => r.id)).size) + ' clientes.' + (sinId.size ? ' ' + nEnt.format(sinId.size) + ' clientes no están en el reporte de Clientes y no se cuentan por línea hasta que lo actualices.' : '');
        salida.push({ id: 'clientes_codigos', nombre: 'clientes_por_codigo_' + hoyTxt() + '.csv', csv: aCsvObj(['id', 'marca', 'codigo', 'mes', 'venta_usd'], gc), filas: gc.length || 1, nota: notaC });
      }
      return salida;
    }
    if (a.tipo === 'peso') {
      const ix = Object.fromEntries(['Codigo', 'Línea', 'Categoria', 'Nombre', 'Kg', 'Ton'].map((c) => [c, col(E, c)]));
      const rows = R.filter((r) => String(r[ix.Codigo] ?? '').trim()).map((r, i) => ({ orden: i + 1, codigo: String(r[ix.Codigo]).trim(), linea: ix['Línea'] >= 0 ? r[ix['Línea']] : '', categoria: ix.Categoria >= 0 ? r[ix.Categoria] : '', nombre: ix.Nombre >= 0 ? String(r[ix.Nombre] ?? '').trim() : '', kg: nN(r[ix.Kg]), ton: nN(r[ix.Ton]) }));
      return [{ id: 'pesos', nombre: 'tabla_peso_' + hoyTxt() + '.csv', csv: aCsvObj(['orden', 'codigo', 'linea', 'categoria', 'nombre', 'kg', 'ton'], rows), filas: rows.length, rows }];
    }
    if (a.tipo === 'infocompras') {
      const ix = (c) => col(E, c);
      // meses de venta: primera aparición de "MES AAAA"; días sin inventario: "DIAS SIN INV MES AAAA" o la segunda aparición
      const vistos = new Set(), mapaV = [], mapaD = [];
      E.forEach((h, i) => {
        const k = mesDeTexto(h);
        if (!k) return;
        if (norm(h).startsWith('dias sin inv') || vistos.has(k)) mapaD.push([i, 'dsi_' + k]);
        else { vistos.add(k); mapaV.push([i, 'v_' + k]); }
      });
      const nuevos = R.filter((r) => String(r[ix('ARTICULO')] ?? '').trim()).map((r) => {
        const o = { articulo: String(r[ix('ARTICULO')]).trim(), descripcion: String(r[ix('DESCRIPCION')] ?? '').trim(), marca: String(r[ix('MARCA')] ?? '').trim(), grupo: String(r[ix('GRUPO COMPRA')] ?? '').trim(), bdf: String(r[ix('BDF')] ?? '').trim(), categoria: r[ix('CATEGORIA')] ?? '', subcategoria: r[ix('SUBCATEGORIA DES')] ?? '', costo_promedio: nN(r[ix('COSTO PROMEDIO')]), precio_mayoreo: nN(r[ix('PRECIO MAYOREO')]), inventario: nN(r[ix('INVENTARIO')]), valoracion: nN(r[ix('VALORACION')]), transito: nN(r[ix('TRANSITO')]), ult_compra_unds: nN(r[ix('ULT COMPRA UNDS')]), ult_fecha_compra: serialAFecha(r[ix('ULT FECHA COMPRA')]), dias_entrega: nN(r[ix('DIAS ENTREGA')]), venta_prom_mes: nN(r[ix('AVG VTAS MES')]), cobertura: nN(r[ix('COBERTURA')]) };
        for (const [i, k] of mapaV) o[k] = nN(r[i]);
        for (const [i, k] of mapaD) o[k] = nN(r[i]);
        return o;
      });
      // un artículo repetido en el archivo (por ejemplo, dos reportes pegados uno debajo del otro) cuenta una sola vez: se usa su última fila
      const unaVez = (filas) => { const m = new Map(); for (const r of filas) { m.delete(r.articulo); m.set(r.articulo, r); } return [...m.values()]; };
      const nuevosU = unaVez(nuevos), repetidos = nuevos.length - nuevosU.length;
      // se conservan los artículos de los grupos que no vienen en este archivo
      const gruposNuevos = new Set(nuevosU.map((r) => r.grupo)), yaVan = new Set(nuevosU.map((r) => r.articulo));
      const prev = dash.data('inventario');
      const viejos = prev.status === 'ok' ? unaVez(prev.data.filter((r) => !gruposNuevos.has(r.grupo) && !yaVan.has(r.articulo))) : [];
      const todos = [...nuevosU, ...viejos.map((r) => ({ ...r }))];
      const base = ['articulo', 'descripcion', 'marca', 'grupo', 'bdf', 'categoria', 'subcategoria', 'costo_promedio', 'precio_mayoreo', 'inventario', 'valoracion', 'transito', 'ult_compra_unds', 'ult_fecha_compra', 'dias_entrega', 'venta_prom_mes', 'cobertura'];
      const extra = [...new Set(todos.flatMap((r) => Object.keys(r).filter((k) => /^(v|dsi)_\d{4}_\d{2}$/.test(k))))].sort();
      return [{ id: 'inventario', nombre: 'inventario_' + hoyTxt() + '.csv', csv: aCsvObj([...base, ...extra], todos), filas: todos.length, nota: [repetidos ? 'Se quitaron ' + nEnt.format(repetidos) + ' filas de artículos repetidos (se usó la última de cada uno).' : '', viejos.length ? 'Se conservaron ' + nEnt.format(viejos.length) + ' artículos de otros grupos.' : ''].filter(Boolean).join(' ') }];
    }
    if (a.tipo === 'clientes') {
      const ix = Object.fromEntries(['Región', 'Estado', 'Supervisor', 'Asesor', 'Marca', 'Cliente', 'Mes', 'Venta Neta Dólares'].map((c) => [c, col(E, c)]));
      // si en la misma subida vienen ventas nuevas, se cruza contra ellas
      const ven = dash.data('ventas');
      const base = a.ventasNuevas || (ven.status === 'ok' ? ven.data : null);
      if (!base) throw new Error('sin ventas');
      const k = (r) => [r.region, r.estado, r.supervisor, r.asesor, r.marca, r.mes].map(norm).join('|');
      const claves = new Set(base.map(k));
      let fuera = 0;
      const filas = [];
      for (const r of R) {
        const o = { region: region(r[ix['Región']]), estado: titulo(r[ix.Estado]), supervisor: titulo(r[ix.Supervisor]), asesor: titulo(r[ix.Asesor]), marca: String(r[ix.Marca] ?? '').trim(), cliente: String(r[ix.Cliente] ?? '').trim(), mes: mesIso(r[ix.Mes]), v: n0(r[ix['Venta Neta Dólares']]) * 1000 };
        if (!o.mes || !o.cliente) continue;
        if (!claves.has(k(o))) { fuera++; continue; }
        filas.push(o);
      }
      // se conservan los números de cliente que ya existían
      const prev = dash.data('clientes');
      const idDe = new Map(prev.status === 'ok' ? prev.data.map((c) => [c.cliente, String(c.id)]) : []);
      let sig = Math.max(0, ...[...idDe.values()].map(Number).filter(isFinite)) + 1;
      const attrs = new Map();
      for (const f of filas) {
        const ka = [f.region, f.estado, f.supervisor, f.asesor].join('\u0001');
        if (!attrs.has(f.cliente)) attrs.set(f.cliente, new Map());
        const m = attrs.get(f.cliente);
        m.set(ka, (m.get(ka) || 0) + f.v);
      }
      const dim = [];
      for (const [cli, m] of [...attrs].sort((x, y) => x[0].localeCompare(y[0], 'es'))) {
        if (!idDe.has(cli)) idDe.set(cli, String(sig++));
        const [rg, es, su, as] = [...m].sort((x, y) => y[1] - x[1])[0][0].split('\u0001');
        dim.push({ id: idDe.get(cli), cliente: cli, region: rg, estado: es, supervisor: su, asesor: as });
      }
      const g = agrupar(filas.map((f) => ({ id: idDe.get(f.cliente), marca: f.marca, mes: f.mes, venta_usd: f.v })), ['id', 'marca', 'mes'], ['venta_usd']).filter((r) => r.venta_usd !== 0);
      const vtot = filas.reduce((s, f) => s + f.v, 0);
      const nota = 'Se usaron ' + nEnt.format(filas.length) + ' filas de Febeca (venta ' + usd(vtot) + ') y se dejaron fuera ' + nEnt.format(fuera) + ' filas de otras marcas o supervisores.';
      return [
        { id: 'clientes', nombre: 'clientes_' + hoyTxt() + '.csv', csv: aCsvObj(['id', 'cliente', 'region', 'estado', 'supervisor', 'asesor'], dim), filas: dim.length, nota, rows: dim },
        { id: 'clientes_ventas', nombre: 'clientes_ventas_' + hoyTxt() + '.csv', csv: aCsvObj(['id', 'marca', 'mes', 'venta_usd'], g), filas: g.length },
      ];
    }
    if (a.tipo === 'semanal') {
      const out = [];
      const ix = Object.fromEntries(['Grupo Compra', 'Marca', 'Región', 'Semana', 'Clientes activados', 'Contribución', 'Inventario', 'Presupuesto de contribución', 'Rotación', 'Venta Neta'].map((c) => [c, col(E, c)]));
      const VE = new Set(Object.values(REG)), conRegion = ix['Región'] >= 0;
      const sem = R.filter((r) => String(r[ix.Marca] ?? '').trim() && String(r[ix.Semana] ?? '').trim() && (!conRegion || VE.has(region(r[ix['Región']])))).map((r) => {
        const k = (v) => (v === '' || v == null || !isFinite(Number(v)) ? '' : r2(Number(v) * 1000));
        return { grupo: String(r[ix['Grupo Compra']] ?? '').trim(), marca: String(r[ix.Marca]).trim(), region: conRegion ? region(r[ix['Región']]) : 'N/A', semana: String(r[ix.Semana]).trim(), clientes: nN(r[ix['Clientes activados']]), contribucion_usd: k(r[ix['Contribución']]), inventario_usd: ix.Inventario >= 0 ? k(r[ix.Inventario]) : '', ppto_contrib_usd: ix['Presupuesto de contribución'] >= 0 ? k(r[ix['Presupuesto de contribución']]) : '', rotacion: nN(r[ix['Rotación']]), venta_usd: k(r[ix['Venta Neta']]) };
      });
      out.push({ id: 'semanal', nombre: 'semanal_' + hoyTxt() + '.csv', csv: aCsvObj(['grupo', 'marca', 'region', 'semana', 'clientes', 'contribucion_usd', 'inventario_usd', 'ppto_contrib_usd', 'rotacion', 'venta_usd'], sem), filas: sem.length });
      for (const x of a.extra) {
        const e2 = x.enc, d2 = x.datos;
        if (x.hoja === 'Presupuesto') {
          const im = col(e2, 'Marca'), io = col(e2, 'Origen'), ig = col(e2, 'Grupo Compra'), ima = col(e2, 'Margen');
          const meses = e2.map((h, i) => [i, cabMes(h)]).filter(([, m]) => m);
          const rows = [];
          for (const r of d2) {
            if (!String(r[im] ?? '').trim()) continue;
            for (const [i, m] of meses) { const v = nN(r[i]); if (v === '') continue; rows.push({ marca: String(r[im]).trim(), origen: io >= 0 ? r[io] : '', grupo: ig >= 0 ? r[ig] : '', margen: ima >= 0 ? nN(r[ima]) : '', mes: m, presupuesto_usd: r2(v * 1000) }); }
          }
          out.push({ id: 'presupuesto', nombre: 'presupuesto_' + hoyTxt() + '.csv', csv: aCsvObj(['marca', 'origen', 'grupo', 'margen', 'mes', 'presupuesto_usd'], rows), filas: rows.length });
        }
        if (x.hoja === 'Acciones') {
          const im = col(e2, 'Marcas'), ia = col(e2, 'Acciones');
          let ult = '';
          const rows = [];
          for (const r of d2) { const mk = String(r[im] ?? '').trim(); if (mk) ult = mk; const ac = String(r[ia] ?? '').trim(); if (ult && ac) rows.push({ marca: ult, accion: ac }); }
          out.push({ id: 'acciones', nombre: 'acciones_' + hoyTxt() + '.csv', csv: aCsvObj(['marca', 'accion'], rows), filas: rows.length });
        }
        if (x.hoja === 'Sheet2') {
          const im = col(e2, 'Marca'), ig = col(e2, 'Grupo Compra'), ic = col(e2, 'Clientes activados'), ico = col(e2, 'Contribución'), iv = col(e2, 'Venta Neta');
          const imes = e2.findIndex((h, i) => d2.length && d2.filter((r) => /^\d{1,2}-\d{4}$/.test(String(r[i] ?? '').trim())).length >= d2.length * 0.8);
          if (imes < 0) continue;
          const rows = d2.filter((r) => String(r[im] ?? '').trim() && mesIso(r[imes])).map((r) => ({ grupo: ig >= 0 ? r[ig] : '', marca: String(r[im]).trim(), mes: mesIso(r[imes]), clientes: ic >= 0 ? nN(r[ic]) : '', contribucion_usd: ico >= 0 && nN(r[ico]) !== '' ? r2(nN(r[ico]) * 1000) : '', venta_usd: nN(r[iv]) !== '' ? r2(nN(r[iv]) * 1000) : '' }));
          out.push({ id: 'mensual', nombre: 'mensual_' + hoyTxt() + '.csv', csv: aCsvObj(['grupo', 'marca', 'mes', 'clientes', 'contribucion_usd', 'venta_usd'], rows), filas: rows.length });
        }
      }
      return out;
    }
    return [];
  }
  const hoyTxt = () => new Date().toISOString().slice(0, 10);
  const totalDataset = (id, campo) => { const d = dash.data(id); return d.status === 'ok' ? d.data.reduce((a, r) => a + (Number(r[campo]) || 0), 0) : null; };

  const motivo = (c) => (c === 'too_large' ? 'el archivo es demasiado grande (divídelo en dos períodos)'
    : c === 'quota_or_state' ? 'se llenó el espacio de archivos del dashboard (pídele a Claude que borre cargas antiguas)'
    : c === 'not_granted' || c === 'permission_denied' ? 'necesitas permiso de edición en el dashboard'
    : 'no se pudo actualizar (inténtalo de nuevo; si se repite, avísale a Claude)');
  $('#cg-b-subir').addEventListener('click', async () => {
    if (!analisis) return;
    const btn = $('#cg-b-subir'), msg = $('#cg-m-carga'), barra = $('#cg-barra'), fill = barra.querySelector('i');
    const [a, db, u] = await Promise.all([capAssets, capDb, capUser]);
    if (!a || !db) { enlaceRespaldo(msg, 'Desde esta vista no se pueden actualizar los datos (se necesita permiso de edición).'); return; }
    const completa = analisis.tipo === 'completa';
    const lista = completa ? analisis.items : [analisis];
    if (lista.some((x) => x.cortado)) { setMsg(msg, 'No se aplicó: el sistema cortó este archivo por límite de filas. Vuelve a exportarlo completo.', 'fb-neg'); return; }
    btn.disabled = true;
    barra.hidden = false; fill.style.width = '5%';
    const quien = u && u.id ? await u.id().catch(() => null) : null;
    const nombre = u && u.name ? await u.name().catch(() => '') : '';
    const ok = [], mal = [], pendientes = [];
    let ventasNuevas = null, pesosNuevos = null, clientesNuevos = null;
    try {
      for (let j = 0; j < lista.length; j++) {
        const it = lista[j], nomT = TIPOS[it.tipo].nombre;
        const pre = lista.length > 1 ? '(' + (j + 1) + ' de ' + lista.length + ') ' : '';
        const avance = (f) => { fill.style.width = Math.max(5, Math.round(((j + f) / lista.length) * 100)) + '%'; };
        const rechazo = async (nota) => { try { await db.collection('cargas').add({ tipo: it.tipo, tipo_nombre: nomT, archivo: it.archivo, filas: it.datos.length, venta_usd: it.venta, subido_por: quien, fecha: new Date().toISOString(), estado: 'Rechazado', nota }); } catch (e2) { /* sin registro */ } };
        setMsg(msg, pre + 'Preparando ' + nomT + '…');
        let salidas;
        try { if (it.tipo === 'clientes' && ventasNuevas) it.ventasNuevas = ventasNuevas; if (it.tipo === 'tubrica' && pesosNuevos) it.pesosNuevos = pesosNuevos; if (it.tipo === 'tubrica' && clientesNuevos) it.clientesNuevos = clientesNuevos; salidas = transformar(it); } catch (e) { salidas = null; }
        if (!salidas || !salidas.length || salidas.some((s) => !s.filas)) {
          mal.push(nomT + ': no se pudieron leer filas válidas debajo del encabezado');
          pendientes.push(it);
          await rechazo('No se pudieron leer filas válidas.');
          continue;
        }
        try {
          setMsg(msg, pre + 'Subiendo ' + nomT + '…');
          for (let i = 0; i < salidas.length; i++) {
            const r = await a.upload(new Blob([salidas[i].csv], { type: 'text/csv' }), { type: 'text/csv' });
            salidas[i].asset = r.id;
            avance(((i + 1) / salidas.length) * 0.8);
          }
          const ahora = new Date().toISOString();
          for (const s of salidas) {
            await db.doc('datasets/' + s.id).update({ source: { kind: 'file', url: '/_blob/' + s.asset, name: s.nombre }, updated: { at: ahora, by: nombre || 'Carga desde el dashboard' } });
          }
          avance(1);
          const detalle = salidas.map((s) => s.id + ' (' + nEnt.format(s.filas) + ' filas)').join(', ');
          const notas = salidas.map((s) => s.nota).filter(Boolean).join(' ');
          await db.collection('cargas').add({
            tipo: it.tipo, tipo_nombre: nomT, archivo: it.archivo,
            filas: it.datos.length, venta_usd: it.venta, meses: it.meses, cortado: false,
            partes: salidas.map((s) => s.asset), subido_por: quien, fecha: ahora, estado: 'Aplicado',
            nota: 'Actualizado: ' + detalle + '.' + (notas ? ' ' + notas : ''),
          });
          ok.push(nomT);
          if (it.tipo === 'ventas') ventasNuevas = salidas[0].rows;
          if (it.tipo === 'peso') pesosNuevos = salidas[0].rows;
          if (it.tipo === 'clientes') clientesNuevos = salidas[0].rows;
        } catch (e) {
          const c = e && e.code;
          mal.push(nomT + ': ' + motivo(c));
          pendientes.push(it);
          await rechazo('Error al actualizar' + (c ? ' (' + c + ')' : '') + '.');
        }
      }
      fill.style.width = '100%';
      if (!mal.length) {
        setMsg(msg, 'Listo: el dashboard ya usa los datos nuevos' + (completa ? ' (' + ok.join(', ') + ')' : '') + '. En 1 a 2 minutos lo verán todos (Vercel lo publica solo).', 'fb-pos');
        $('#cg-archivo').value = '';
        $('#cg-checks').replaceChildren();
        analisis = null;
      } else {
        setMsg(msg, (ok.length ? 'Se actualizó: ' + ok.join(', ') + '. ' : '') + 'No se aplicó ' + mal.join('; ') + '.', 'fb-neg');
        if (completa) analisis.items = pendientes;
        btn.disabled = false;
      }
    } finally {
      setTimeout(() => { barra.hidden = true; fill.style.width = '0'; }, 1500);
    }
  });

  // ---------- historial ----------
  const fila1 = (texto) => { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7; td.className = 'fb-empty'; td.textContent = texto; tr.append(td); return tr; };
  const fechaF = (s) => { const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }); };
  const est = { Pendiente: 'cg-st-warn', Aplicado: 'cg-st-ok', Rechazado: 'cg-st-bad' };
  async function pintar(docs) {
    const body = $('#cg-t-hist');
    if (!docs.length) { body.replaceChildren(fila1('Todavía no hay archivos cargados. Sube el primero en el paso 2.')); return; }
    const u = await capUser;
    const ids = [...new Set(docs.map((d) => d.subido_por).filter(Boolean))];
    let perfiles = {};
    if (u && u.profiles && ids.length) { try { perfiles = await u.profiles(ids); } catch (e) { perfiles = {}; } }
    body.replaceChildren(...docs.map((d) => {
      const tr = document.createElement('tr');
      const cel = (t, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = t; tr.append(td); return td; };
      cel(fechaF(d.fecha));
      cel(d.tipo_nombre || d.tipo || '—');
      cel(d.archivo || '—');
      cel(d.filas != null ? nEnt.format(d.filas) : '—', 'n');
      cel(d.venta_usd != null ? usd(d.venta_usd) : '—', 'n');
      cel((d.subido_por && perfiles[d.subido_por] && perfiles[d.subido_por].name) || 'Alguien');
      const td = cel('');
      const chip = document.createElement('span');
      chip.className = 'cg-chip ' + (est[d.estado] || '');
      chip.textContent = d.estado || 'Pendiente';
      td.append(chip);
      if (d.nota) { const nn = document.createElement('div'); nn.className = 'fb-empty'; nn.textContent = d.nota; td.append(nn); }
      return tr;
    }));
  }
  capDb.then((db) => {
    if (!db) { $('#cg-t-hist').replaceChildren(fila1('El historial no está disponible en esta vista.')); return; }
    db.collection('cargas').orderBy('fecha', 'desc').limit(50).onSnapshot(
      (snap) => pintar(snap.docs.map((s) => s.data())),
      () => $('#cg-t-hist').replaceChildren(fila1('No se pudo leer el historial.'))
    );
  });
})();
