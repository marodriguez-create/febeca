// Muestra quién está viendo y adapta el dashboard a su tipo de usuario:
// editor: todo y Cargar datos · lector: todo sin Cargar datos · proveedor: solo sus marcas, en unidades.
(function () {
  const root = document.documentElement;
  const st = document.createElement('style');
  st.textContent = '.fb-sesion{display:flex;gap:var(--cds-gap-xs);align-items:center;font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)}.fb-sesion a{color:var(--color-fg);text-decoration:underline;text-underline-offset:2px}';
  document.head.append(st);
  const fila = (partes) => {
    const box = document.querySelector('.fb-modo-box');
    if (!box) return;
    const f = document.createElement('div');
    f.className = 'fb-sesion';
    f.append(...partes);
    box.append(f);
  };
  const txt = (t) => { const s = document.createElement('span'); s.textContent = t; return s; };
  const link = (t, href) => { const a = document.createElement('a'); a.href = href; a.textContent = t; return a; };
  const irA = (id) => { const t = document.getElementById(id); if (t) t.click(); };
  const soloVer = () => {
    root.classList.add('fb-solo-ver');
    if (window.fbPagina === 'carga' || location.hash === '#carga') irA('tab-resumen');
  };
  // textos fijos en unidades para el proveedor
  const cambiar = (sel, a, b) => document.querySelectorAll(sel).forEach((e) => { for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.includes(a)) n.textContent = n.textContent.replace(a, b); });
  const modoProveedor = () => {
    root.classList.add('fb-prov', 'fb-solo-ver');
    cambiar('#kpi-venta .fb-label', 'Venta neta · ', 'Unidades · ');
    cambiar('#pag-resumen .fb-h2, #pag-marcas .fb-h2', 'Venta neta mensual', 'Unidades por mes');
    cambiar('#pag-marcas .fb-h2', 'Venta mensual por marca', 'Unidades por marca y mes');
    cambiar('.fb-leyenda span', 'Venta mes más alto', 'Mes más alto');
    cambiar('.fb-leyenda span', 'Venta mes más bajo', 'Mes más bajo');
    cambiar('#n-minis', 'Venta neta mensual de cada marca', 'Unidades por mes de cada marca');
    cambiar('#t-marcas th .fb-th', 'Venta', 'Unidades');
    const bUsd = document.querySelector('.fb-med-b[data-medida="usd"]'); if (bUsd) bUsd.textContent = 'Venta Unidades';
    document.querySelectorAll('#pag-marcas .fb-note').forEach((n) => { n.textContent = n.textContent.replace('la venta del mes elegido', 'las unidades del mes elegido'); });
    if (['presupuesto', 'kpi', 'region', 'clientes', 'carga'].includes(window.fbPagina)) irA('modo-mensual');
    if (['clientes', 'carga'].includes(window.fbPagina)) irA('tab-resumen');
    if (window.dash) dash.setParams({}); // vuelve a dibujar en unidades
  };
  const mostrar = () => root.classList.remove('fb-espera');
  fetch('/api/me', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return; // sin respuesta: Cargar datos queda oculto
      if (d.usuario) {
        window.fbUsuario = d.usuario;
        if (d.rol === 'editor') root.classList.remove('fb-solo-ver');
        else if (d.rol === 'proveedor') {
          // subcategorías que el proveedor no ve en «Artículos con poca cobertura»
          const nrm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
          window.fbOcultarSub = (d.ocultar || []).map(nrm);
          modoProveedor();
        }
        else soloVer();
        const etiqueta = d.rol === 'editor' ? '' : d.rol === 'proveedor' ? ' · proveedor' + (d.marcas && d.marcas.length ? ' (' + d.marcas.join(', ') + ')' : '') : ' · solo lectura';
        fila([txt(d.usuario + etiqueta), link('Salir', '/api/logout')]);
      } else {
        soloVer();
        fila([txt('Solo lectura'), link('Ingresar', '/login.html?volver=' + encodeURIComponent(location.pathname + location.search))]);
      }
    })
    .catch(() => {})
    .finally(() => setTimeout(mostrar, 50));
})();
