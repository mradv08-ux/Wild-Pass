# Cuartel general · The Wild Side

App interna solo para el jefe: ventas y escaparate de merch, caja (ingresos, gastos, fijos y deudas) y el mapa de conquista de Huelva.

Dirección: **https://mradv08-ux.github.io/Wild-Pass/cuartel/**

## Instalarla en el móvil
1. Abre la dirección de arriba en **Chrome** (Android) o **Safari** (iPhone).
2. Android: pulsa los **tres puntos ⋮** y luego **Instalar aplicación** (o **Añadir a pantalla de inicio**).
   iPhone: pulsa **Compartir** (el cuadrado con la flecha) y luego **Añadir a pantalla de inicio**.
3. Ábrela siempre desde ese icono. Así funciona sin internet y los datos se quedan en el móvil.

## Dónde se guardan los datos
- Todo se guarda **solo en el móvil** donde la usas. No va a ningún servidor y nadie más lo ve, aunque la dirección sea pública.
- Si borras los datos del navegador o desinstalas la app, se pierde. Por eso, de vez en cuando: **rueda de Ajustes → Descargar copia** y guárdala en Drive o mándatela por correo.
- Para pasar los datos a otro móvil: descarga la copia en el viejo y en el nuevo usa **Ajustes → Restaurar desde archivo**.

## Archivos
| Archivo | Para qué sirve |
| --- | --- |
| `index.html` | La app entera (incluye el mapa, el logo y las fotos del merch) |
| `manifest.webmanifest`, `sw.js` | Para instalarla y que funcione sin internet |

Usa el logo y los iconos de la carpeta `img/` de Wild Pass. Cada vez que cambies `index.html`, sube `VERSION` en `cuartel/sw.js`.

## Pendiente para más adelante
- Si algún día quieres los datos en varios dispositivos a la vez, se puede pasar a Supabase (plan gratis).
