# PoC Goals Tool — Zepo

Herramienta para **establecer los criterios de éxito de una PoC** con clientes potenciales y
**llevar su seguimiento**. App estática (HTML/CSS/JS, sin build) alojada en GitHub Pages, con
autenticación, base de datos y seguridad en **Supabase**.

- **App:** https://danielsanmartin-lang.github.io/poc-goals-tool/  *(tras activar Pages, ver abajo)*
- **Supabase:** proyecto `POC Goals Tool` (`ncjaspbalcgzxjsqqafx`, eu-west-1)

---

## Qué hace

- Cada **AE** entra con su cuenta y gestiona **sus** PoCs (un admin ve todas).
- Cada PoC recoge: estado, contactos, objetivo, casos de uso, alcance, plan de simulaciones
  (phishing/vishing/smishing), pre-check de lanzamiento, timeline y comentarios.
- Bilingüe **EN/ES**, exportación a **PDF** (imprimir), y autoguardado.
- Panel de **administración** (solo admins): alta de usuarios con contraseña provisional,
  reseteo de contraseña y activar/desactivar cuentas.

## Estructura

```
index.html            SPA: login · cambio de contraseña · listado · admin · detalle de PoC
css/styles.css        Estilos
js/
  config.js           URL + clave publishable de Supabase (públicas por diseño)
  supabaseClient.js   Cliente Supabase (usa el bundle vendorizado)
  vendor/supabase.js  @supabase/supabase-js v2 vendorizado (sin CDN en runtime)
  auth.js             Sesión, perfil, cambio de contraseña forzado
  persistence.js      Lectura/escritura de PoCs (tabla `pocs`)
  state.js            Modelo de una PoC + utilidades
  form.js             Formulario de detalle de PoC
  list.js             Listado de PoCs
  admin.js            Panel de administración de usuarios
  router.js           Router hash (#/list · #/new · #/poc/:id · #/admin)
  data.js  i18n.js  main.js
supabase/
  migrations/*.sql              Esquema, RLS y funciones (idempotentes en orden)
  functions/admin-create-user/  Edge Function: alta de usuarios (service_role)
  functions/admin-user-action/  Edge Function: reset pw / activar-desactivar
```

## Modelo de seguridad (resumen)

- Las claves del navegador (`config.js`) son **públicas por diseño**. La seguridad real está en:
  - **RLS deny-by-default** en `profiles` y `pocs`: un AE solo accede a lo suyo; el admin, a todo.
  - **`private.is_admin()`** (SECURITY DEFINER, esquema no expuesto por la API) evita recursión de RLS.
  - Un trigger impide que un usuario se **auto-promocione** a admin.
  - **Perfiles inactivos por defecto**: aunque el registro público estuviera activo, un auto-registro
    no da acceso (la app rechaza `is_active=false`). Solo un admin activa cuentas.
  - La **`service_role` key** vive únicamente en el runtime de las Edge Functions, jamás en el navegador.
  - Contraseña **provisional** con cambio obligatorio en el primer inicio de sesión.

## Desarrollo local

Al usar ES modules hace falta servir por HTTP (no `file://`):

```bash
cd poc-goals-tool
python3 -m http.server 8765
# abrir http://127.0.0.1:8765/
```

## Despliegue en GitHub Pages

Este repo ya contiene la app. Para publicarla:

1. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`** → Save.
2. En 1-2 min estará en `https://danielsanmartin-lang.github.io/poc-goals-tool/`.
3. Si cambias de dominio/usuario, añade el nuevo origen a `ALLOWED_ORIGINS` en ambas Edge
   Functions (`supabase/functions/*/index.ts`) y vuelve a desplegarlas.

## Pasos manuales en Supabase (una vez)

> El esquema, las políticas RLS y las Edge Functions **ya están aplicados**. Quedan 2 ajustes de
> configuración de Auth que solo se tocan desde el dashboard:

1. **Desactivar el registro público** — Authentication → Sign In / Providers → Email →
   *Allow new users to sign up* = **OFF**. (Con esto nadie puede crear cuenta; el blindaje
   `is_active=false` es la red de seguridad por si se reactivara.)
2. **Protección de contraseñas filtradas** — Authentication → Policies → *Leaked password
   protection* = **ON** (comprueba contra HaveIBeenPwned). Recomendado subir el mínimo de longitud.

## Cuentas

- El **primer admin** ya está creado: `daniel.sanmartin@zepo.app` (deberá fijar su contraseña en
  el primer login).
- El resto de altas se hacen **desde la app** (menú **Admin → Crear usuario**). Cada nuevo usuario
  recibe una contraseña provisional que debe cambiar al entrar.

### Bootstrap manual de un admin (si algún día hiciera falta)

Crear el usuario en **Authentication → Users → Add user** (con *Auto Confirm*) y luego:

```sql
update public.profiles
set role='admin', is_active=true, must_change_password=false
where email='NUEVO_ADMIN@zepo.app';
```

## Actualizar las Edge Functions

Con la CLI de Supabase: `supabase functions deploy admin-create-user` (y `admin-user-action`).
Están desplegadas con `verify_jwt=false` **a propósito**: implementan su propia verificación
(JWT de usuario + rol admin) para que el preflight CORS del navegador no se bloquee.
