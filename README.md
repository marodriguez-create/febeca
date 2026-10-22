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

1. Ingresa con tu usuario (editor), ve a **Cargar datos**, elige el tipo y sube la plantilla.
2. Pulsa **Subir y actualizar**. El dashboard guarda los datos en la carpeta `data/` del repositorio de GitHub (un solo cambio por carga) y Vercel publica solo: en 1 a 2 minutos todos ven los datos nuevos.

Para que se guarde solo hacen falta estas variables en Vercel (y un **Redeploy** después de agregarlas):

| Variable | Valor |
|---|---|
| `GITHUB_TOKEN` | Un token de GitHub con permiso **Contents: Read and write** solo sobre este repositorio (ver abajo). |
| `GITHUB_REPO` | `usuario/repositorio`, por ejemplo `marodriguez-crear/Febeca` |
| `GITHUB_BRANCH` (opcional) | La rama, `main` por defecto. |

**Crear el token:** en GitHub, tu foto (arriba a la derecha) → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**. Nombre: `ventas-febeca`; Expiration: la que prefieras (por ejemplo 1 año); Repository access: **Only select repositories** → el repositorio del dashboard; Permissions → Repository permissions → **Contents: Read and write**. Pulsa **Generate token** y copia el texto (empieza con `github_pat_`). Cuando venza, crea otro y reemplaza `GITHUB_TOKEN`.

Sin `GITHUB_TOKEN`, el dashboard descarga los CSV nuevos para que los subas a mano a la carpeta `data/`.

## Importante

- Mantén el repositorio de GitHub **privado**: la carpeta `data/` tiene las ventas y los clientes.
- El mapa de Venezuela usa trazos de Natural Earth (vía datamaps, licencia MIT).
