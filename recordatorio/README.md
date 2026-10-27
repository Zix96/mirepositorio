# Recordatorio diario

App web sencilla para acordarte de hacer **la misma acción todos los días** y llevar tu racha.

## Qué hace
- Elegís la acción (ej. "Tomar la pastilla") y la hora del recordatorio.
- Botón grande para marcar "Hecho hoy" (y deshacer).
- Racha actual, mejor racha y total de días.
- Calendario de los últimos 28 días: tocá un día para corregirlo.
- Aviso en pantalla y notificación si pasó la hora y todavía no lo hiciste, con mensaje propio,
  botón "✓ Hecho" para marcarlo sin abrir la app y repetición opcional (hasta 10 avisos por día).
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
