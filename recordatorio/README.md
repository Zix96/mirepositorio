# Recordatorio diario

App web para acordarte de tus acciones (tomar la pastilla, ir al gimnasio, cambiar un filtro…)
y llevar la racha de cada una.

## Qué hace
- Varias acciones, cada una con su hora y su frecuencia: todos los días, algunos días de la
  semana, una vez por mes (cualquier día) o cada cierta cantidad de días desde una fecha.
- Lista con el estado de hoy de cada acción y un botón para marcarla (y deshacer).
- Por acción: racha (días, veces o meses seguidos), mejor racha, total, medallas y calendario
  de los últimos 28 días (tocá un día para corregirlo).
- Aviso en pantalla y notificación por acción si pasó la hora y todavía no la hiciste, con mensaje
  propio, botón "✓ Hecho" para marcarla sin abrir la app y repetición opcional (hasta 10 por día).
- Qué días toca cada acción y cómo se cuentan las rachas está en `frecuencia.js`, que también usa
  el servidor push.
- Se puede instalar en el celular ("Agregar a pantalla de inicio") y funciona sin conexión.
- Los datos se guardan solo en tu dispositivo (localStorage).

## Cómo usarla
Tiene que abrirse desde un servidor (no con doble clic), por ejemplo:

```bash
cd recordatorio
python3 -m http.server 8000
# abrir http://localhost:8000
```

Para usarla en el celular, publicala gratis con GitHub Pages
(Settings → Pages → rama y carpeta) y entrá a `https://<usuario>.github.io/mirepositorio/recordatorio/`.

## Notificaciones con la app cerrada
Las manda el servidor de [`push-servidor/`](../push-servidor/README.md) (Cloudflare Workers, gratis).
Mientras `SERVIDOR_PUSH` en `app.js` esté vacío, la app solo avisa cuando está abierta.
En iPhone las notificaciones push requieren iOS 16.4+ y abrir la app desde el ícono de inicio.
