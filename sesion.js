// Muestra quién está viendo y decide si se ve la pestaña Cargar datos.
// Solo un editor (usuario de DASH_USERS) ve Cargar datos; los demás solo ven el dashboard.
(function () {
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
  const soloVer = () => {
    document.documentElement.classList.add('fb-solo-ver');
    if (window.fbPagina === 'carga' || location.hash === '#carga') { const t = document.getElementById('tab-resumen'); if (t) t.click(); }
  };
  fetch('/api/me', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return; // sin respuesta: Cargar datos queda oculto
      if (d.usuario) {
        window.fbUsuario = d.usuario;
        if (d.rol === 'editor') document.documentElement.classList.remove('fb-solo-ver');
        else soloVer();
        fila([txt(d.usuario + (d.rol === 'editor' ? '' : ' · solo lectura')), link('Salir', '/api/logout')]);
      } else {
        soloVer();
        fila([txt('Solo lectura'), link('Ingresar', '/login.html?volver=' + encodeURIComponent(location.pathname + location.search))]);
      }
    })
    .catch(() => {});
})();
