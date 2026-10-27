// Configuración y funciones compartidas por la app (app.js) y el service worker (sw.js).

// Dirección del servidor de notificaciones push (carpeta push-servidor/), sin barra final.
// Vacía = solo avisos con la app abierta.
const SERVIDOR_PUSH = 'https://recordatorio-push.botfrancis.workers.dev';

// Días marcados con el botón "✓ Hecho" de la notificación que la app todavía no anotó.
const CACHE_DATOS = 'recordatorio-datos';
const CLAVE_HECHOS = '/__recordatorio/hechos-pendientes';

function claveFecha(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

function opcionesNotificacion(cuerpo, fecha) {
  return {
    body: cuerpo,
    icon: 'icono-192.png',
    badge: 'badge-96.png',
    tag: 'recordatorio-diario',
    renotify: true,
    data: { fecha },
    actions: [{ action: 'hecho', title: '✓ Hecho' }],
  };
}
