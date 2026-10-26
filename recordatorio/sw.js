// Service worker: guarda la app para usarla sin conexión y maneja el clic en las notificaciones.
const CACHE = 'recordatorio-v2';
const ARCHIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'icono.svg', 'manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((claves) =>
      Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
    )
  );
  self.clients.claim();
});

// Primero la red (para recibir actualizaciones); si no hay conexión, la copia guardada.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(event.request)
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
    self.registration.showNotification(datos.titulo || 'Recordatorio diario', {
      body: datos.cuerpo || 'Es hora de tu acción de hoy',
      icon: 'icono.svg',
      tag: 'recordatorio-diario',
      renotify: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      if (ventanas.length) return ventanas[0].focus();
      return self.clients.openWindow('./');
    })
  );
});
