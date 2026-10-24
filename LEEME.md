# Pasaporte Salvaje · The Wild Side

App de fidelización de The Wild Side. Los clientes ganan Huellas en cada aventura, suben de nivel, consiguen sellos y canjean premios. El equipo registra asistencias escaneando el QR del cliente.

Todo funciona con servicios gratuitos:

- **Supabase** (plan gratuito): cuentas de clientes y base de datos.
- **GitHub Pages**: aloja la app.

---

## Puesta en marcha (unos 20 minutos, una sola vez)

### 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) y pulsa **Start your project**. Puedes entrar con tu cuenta de GitHub.
2. Pulsa **New project** y rellena:
   - **Name:** `pasaporte-salvaje`
   - **Database Password:** inventa una contraseña larga y guárdala en un sitio seguro.
   - **Region:** una de Europa, por ejemplo **Central EU (Frankfurt)** o **West EU (Ireland)**. Es importante por la ley de protección de datos.
   - **Plan:** Free.
3. Espera un par de minutos a que se cree.

### 2. Crear la base de datos

1. En el menú de la izquierda, entra en **SQL Editor** y pulsa **New query**.
2. Abre el archivo `supabase/esquema.sql`, copia **todo** su contenido y pégalo.
3. Pulsa **Run**. Tiene que aparecer *Success*.

Esto crea las tablas, las reglas de seguridad y el catálogo inicial con los precios de tu web.

### 3. Ajustar el acceso de clientes

En **Authentication**:

1. **Sign In / Providers › Email**:
   - Deja **Email** activado.
   - Desactiva **Confirm email** de momento. El correo que trae Supabase de serie solo envía a los miembros de tu equipo de Supabase y como mucho 2 emails por hora; si lo dejas activado, tus clientes no recibirán el email de confirmación y no podrán entrar. Cuando configuremos un servicio de correo gratuito (ver «Pendiente para más adelante»), se vuelve a activar.
   - Si aparece **Minimum password length**, ponlo en **8**.
2. **URL Configuration**:
   - **Site URL:** la dirección de la app, por ejemplo `https://TU-USUARIO.github.io/pasaporte-salvaje/`
   - En **Redirect URLs**, añade esa misma dirección.

### 4. Conectar la app con Supabase

1. Entra en **Project Settings › API** (o **Data API**).
2. Copia la **Project URL** (empieza por `https://` y acaba en `.supabase.co`).
3. Copia la clave **anon public** (si no la ves, está en la pestaña *Legacy API keys*) o la **publishable key** (empieza por `sb_publishable_`).
4. Pégalas en el archivo `config.js`, sustituyendo los textos `PEGA_AQUI...`.

Esta clave está pensada para ir dentro de la app y puede ser pública. **Nunca pegues la clave `service_role` ni la `secret`**: esas dan acceso total.

### 5. Publicar en GitHub Pages

1. Sube todos los archivos de esta carpeta a un repositorio de GitHub llamado `pasaporte-salvaje` (público).
2. En el repositorio, entra en **Settings › Pages**.
3. En **Source** elige **Deploy from a branch**, rama **main** y carpeta **/ (root)**. Guarda.
4. En un par de minutos la app estará en `https://TU-USUARIO.github.io/pasaporte-salvaje/`.

### 6. Hacerte del equipo

1. Abre la app y **crea tu cuenta** con tu email.
2. En Supabase, entra en **SQL Editor › New query**, pega esto cambiando el email y pulsa **Run**:

   ```sql
   update public.profiles set role = 'staff' where email = 'tu-email@ejemplo.com';
   ```

3. Recarga la app: aparecerá la pestaña **Equipo**.

Haz lo mismo con cada monitor. Para quitarle el acceso a alguien, cambia `'staff'` por `'client'`.

### 7. Antes de anunciarla

En la pestaña **Equipo**:

- [ ] Pon el **precio real del pasaje del terror** (ahora está a 0 € con la nota «Precio por confirmar»).
- [ ] Añade las **fechas de la agenda** (pasaje, rutas, acampadas...).
- [ ] Revisa la **temporada**, los **premios** y los **retos**.

Y fuera de la app:

- [ ] Completa los datos marcados en amarillo en `legal.html` (titular, NIF, domicilio, región de Supabase, fecha) y que lo revise un asesor.

---

## Cómo se instala en el móvil

- **Android (Chrome):** abre la dirección de la app, pulsa los tres puntos y elige **Instalar app** o **Añadir a pantalla de inicio**.
- **iPhone (Safari):** abre la dirección, pulsa el botón **Compartir** y elige **Añadir a pantalla de inicio**.

Queda con el icono de The Wild Side y se abre a pantalla completa, como una app.

---

## Cómo funciona en el día a día

- **Al empezar una actividad:** el monitor entra en **Equipo › Registrar asistencia**, elige la actividad del día, pulsa **Escanear QR con la cámara** y apunta al QR del cliente. Las Huellas le llegan al momento y el cliente lo ve en su móvil.
- **Si alguien viene invitado:** antes de escanear, escribe el código de quien le invitó. Solo cuenta en la primera actividad del invitado.
- **Para entregar un premio:** **Equipo › Entregar un premio**, escanea el código de canje del cliente y entrega lo que indique.
- **Seguridad:** solo las cuentas del equipo pueden sumar Huellas o entregar premios. Una misma actividad no suma dos veces el mismo día a la misma persona.
- **Copia de seguridad (una vez al mes):** **Equipo › Copia de seguridad** y descarga los tres archivos (socios y saldos, movimientos y canjes). Se abren con Excel. Guárdalos en un sitio seguro y privado, porque llevan datos personales. El plan gratuito de Supabase no hace copias automáticas.

---

## Límites del plan gratuito de Supabase

- Hasta 50.000 usuarios activos al mes y 500 MB de base de datos: de sobra para empezar.
- **Si el proyecto pasa una semana sin ningún uso, Supabase lo pausa.** Se reactiva desde el panel de Supabase con un botón. Con clientes usando la app no debería pasar, pero tenlo en cuenta en épocas sin actividad.

---

## Pendiente para más adelante

- **Correo gratuito (Brevo o Resend)** para reactivar la confirmación de email y que funcione «¿Has olvidado la contraseña?».
- **Notificaciones push** en el móvil.
- **Cuentas familiares** (un adulto con varios hijos).
- **Conexión con Búnker 7.**
- **Publicación en Google Play y App Store.**

---

## Archivos

| Archivo | Para qué sirve |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | La app |
| `config.js` | Datos de conexión con Supabase |
| `manifest.webmanifest`, `sw.js` | Para que se pueda instalar en el móvil |
| `legal.html` | Bases del programa y política de privacidad (borrador) |
| `img/` | Logo, iconos y fotos |
| `supabase/esquema.sql` | Base de datos completa, para pegar en Supabase |

Cada vez que se publiquen cambios en la app, sube el número de `VERSION` en `sw.js` para que los móviles descarguen la versión nueva.
