# Ventas Febeca · Dashboard (By MARS)

Versión del dashboard de Claude para publicar en **Vercel**, con ingreso por usuario y clave.

## Publicar (una sola vez)

1. En GitHub, la página principal del repositorio debe mostrar **directamente** `index.html`, `login.html`, `middleware.js`, `vercel.json`, `package.json` y las carpetas `api`, `data`, `lib` y `vendor` (no dentro de otra carpeta). Borra cualquier carpeta vieja como `dashboard/`, `datasets/` o `plantillas/`.
2. En Vercel → **Settings → Build and Deployment**: **Root Directory** vacío y **Framework Preset** *Other*.
3. Configura las variables de abajo y haz **Redeploy**.
4. Al abrir el sitio debe aparecer primero la pantalla de ingreso. Si aparece el dashboard sin estilos y sin pedir clave, Vercel sigue publicando archivos viejos: revisa los pasos 1 y 2.

## Configurar el ingreso

En Vercel: **Project → Settings → Environment Variables**, agrega estas dos variables (para *Production* y *Preview*) y luego haz **Redeploy**:

| Variable | Valor | Ejemplo |
|---|---|---|
| `DASH_USERS` | Editores: ven todo y pueden usar **Cargar datos**. Formato `usuario:clave`, separados por coma | `marodriguez:MiClave2026,jperez:OtraClave#1` |
| `DASH_SECRET` | Un texto largo y secreto para firmar las sesiones (mínimo 32 caracteres, solo letras y números) | `k3Jd9...` |
| `DASH_PUBLICO` (opcional) | `si` para que cualquiera vea el dashboard **sin usuario**, en solo lectura (sin la pestaña Cargar datos). Sin esta variable, todos deben ingresar. | `si` |
| `DASH_LECTORES` (opcional) | Usuarios que solo ven el dashboard (sin Cargar datos), mismo formato que `DASH_USERS`. | `invitado:Clave123` |

- Para **agregar o quitar un usuario**, o cambiar una clave: edita `DASH_USERS` y haz *Redeploy*.
- Si cambias `DASH_SECRET`, todas las sesiones abiertas se cierran.
- La sesión dura 12 horas. El botón **Salir** está arriba a la derecha.
- Sin sesión no se entrega nada: ni el dashboard ni los archivos de `data/`.

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | El dashboard (igual al de Claude). |
| `login.html` | Pantalla de ingreso. |
| `middleware.js` | Revisa la sesión antes de entregar cualquier página o archivo. |
| `api/login.js`, `api/logout.js`, `api/me.js` | Ingresar, salir y saber quién ingresó. |
| `lib/auth.js` | Firma y revisión de las sesiones. |
| `dash-shim.js` | Reemplaza el entorno de Claude: lee los datos de `data/`, filtros y carga de archivos. |
| `tokens.css`, `base.css` | Colores, tamaños y espacios iguales a los de Claude (tema claro y oscuro). |
| `clientes.js`, `ve_mapa.js`, `plantillas.js` | Pestaña Clientes, mapa de Venezuela y plantillas descargables. |
| `vendor/d3.min.js` | Librería de gráficos d3 v7.9.0 (licencia ISC). |
| `data/*.csv` | Los datos del dashboard. |

## Actualizar los datos

1. Ingresa al dashboard, ve a **Cargar datos** y sube la plantilla como siempre.
2. El dashboard se actualiza al momento **en tu navegador** y descarga los CSV nuevos (por ejemplo `ventas.csv`).
3. Para que todos vean los datos nuevos, sube esos CSV a la carpeta `data/` del repositorio en GitHub, reemplazando los anteriores (**Add file → Upload files**, luego **Commit changes**). Vercel vuelve a publicar solo en uno o dos minutos.

## Importante

- Mantén el repositorio de GitHub **privado**: la carpeta `data/` tiene las ventas y los clientes.
- El mapa de Venezuela usa trazos de Natural Earth (vía datamaps, licencia MIT).
