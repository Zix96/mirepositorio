# Servidor push del Recordatorio diario

Servidor chico en **Cloudflare Workers** (plan gratuito) que manda la notificación al celular
aunque la app esté cerrada:

- Cada minuto revisa si ya pasó tu hora y todavía no marcaste "Hecho" hoy.
- Si es así, te manda una notificación push con tu mensaje, y la repite cada tanto
  si lo elegiste en la app (hasta 10 por día).
- La app le avisa cuando marcás "Hecho" (también desde el botón de la notificación), así no te molesta.

Las claves de las notificaciones (VAPID) se crean solas la primera vez y quedan guardadas en Cloudflare.

## Puesta en marcha (una sola vez)

1. Creá una cuenta gratis en https://dash.cloudflare.com/sign-up y entrá una vez a **Workers & Pages**
   (si te pide elegir un subdominio `workers.dev`, elegí cualquiera).
2. Copiá tu **Account ID** (aparece en la columna derecha de *Workers & Pages*).
3. Creá un token: **My Profile → API Tokens → Create Token → plantilla "Edit Cloudflare Workers"**
   → elegí tu cuenta → *Continue to summary* → *Create Token*, y copialo.
4. En GitHub: **Settings → Secrets and variables → Actions → New repository secret** y creá:
   - `CLOUDFLARE_API_TOKEN` con el token.
   - `CLOUDFLARE_ACCOUNT_ID` con el Account ID.
5. En la pestaña **Actions**, abrí "Desplegar servidor push" y tocá **Re-run all jobs**.
6. Al final del paso *Publicar* aparece la dirección `https://recordatorio-push.<tu-subdominio>.workers.dev`.
   Ponela en `SERVIDOR_PUSH` dentro de `recordatorio/app.js`.

Después, cada cambio en esta carpeta se publica solo.

## Pruebas locales

```bash
npx wrangler@4.20.0 dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # dispara la revisión
```
