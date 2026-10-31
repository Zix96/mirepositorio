// Service worker: guarda la app para usarla sin conexión, muestra los avisos push
// y atiende los toques en las notificaciones.
importScripts('comun.js');

const CACHE = 'recordatorio-v6';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'comun.js', 'app.js', 'manifest.webmanifest',
  'icono.svg', 'icono-192.png', 'icono-512.png', 'badge-96.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== CACHE && c !== CACHE_DATOS).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

// Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada.
// 'no-cache' le pregunta siempre al servidor si hay versión nueva, para no mezclar
// una página nueva con un app.js viejo guardado por el navegador.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  // Las navegaciones se piden por URL: una petición de navegación no admite cambiar opciones.
  const peticion = event.request.mode === 'navigate' ? event.request.url : event.request;
  event.respondWith(
    fetch(peticion, { cache: 'no-cache' })
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(event.request))
  );
});

// Aviso que manda el servidor push (push-servidor/) aunque la app esté cerrada.
self.addEventListener('push', (event) => {
  let datos = {};
  try { datos = event.data ? event.data.json() : {}; } catch (e) { /* mensaje sin formato */ }
  event.waitUntil(
    self.registration.showNotification(
      datos.titulo || 'Recordatorio diario',
      opcionesNotificacion(datos.cuerpo || 'Es hora de tu acción de hoy', datos.fecha || claveFecha(new Date()))
    )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'hecho') {
    const datos = event.notification.data || {};
    event.waitUntil(marcarHecho(datos.fecha || claveFecha(new Date())));
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      if (ventanas.length) return ventanas[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

// Botón "✓ Hecho": lo deja anotado para la app y le avisa al servidor para que no insista.
async function marcarHecho(fecha) {
  const cache = await caches.open(CACHE_DATOS);
  const previo = await cache.match(CLAVE_HECHOS);
  const fechas = previo ? await previo.json() : [];
  if (!fechas.includes(fecha)) fechas.push(fecha);
  await cache.put(CLAVE_HECHOS, new Response(JSON.stringify(fechas)));

  const suscripcion = await self.registration.pushManager.getSubscription();
  if (suscripcion && SERVIDOR_PUSH) {
    await fetch(`${SERVIDOR_PUSH}/hecho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: suscripcion.endpoint, fecha }),
    }).catch(() => {});
  }

  const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  ventanas.forEach((v) => v.postMessage({ tipo: 'hecho' }));
}
