// Recordatorio diario: una acción, una hora, y el registro de los días cumplidos.
// Todo se guarda en localStorage de este dispositivo. SERVIDOR_PUSH y las opciones
// de la notificación están en comun.js, que también usa el service worker.

const CLAVE = 'recordatorio-diario';
const $ = (id) => document.getElementById(id);

let estado = cargar();

function cargar() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE));
    if (datos && datos.accion) return { dias: [], ultimoAviso: null, mensaje: '', repetir: 0, ...datos };
  } catch (e) { /* datos dañados o sin acceso: empezamos de cero */ }
  return { accion: '', hora: '20:00', dias: [], ultimoAviso: null, mensaje: '', repetir: 0 };
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
}

// ---- Fechas (siempre en hora local, formato AAAA-MM-DD; claveFecha está en comun.js) ----

function sumarDias(fecha, n) {
  const copia = new Date(fecha);
  copia.setDate(copia.getDate() + n);
  return copia;
}

const hoy = () => claveFecha(new Date());
const hechoHoy = () => estado.dias.includes(hoy());

// ---- Rachas ----

function rachaActual() {
  const hechos = new Set(estado.dias);
  // Si hoy todavía no se hizo, la racha sigue viva contando desde ayer.
  let fecha = hechos.has(hoy()) ? new Date() : sumarDias(new Date(), -1);
  let racha = 0;
  while (hechos.has(claveFecha(fecha))) {
    racha++;
    fecha = sumarDias(fecha, -1);
  }
  return racha;
}

function mejorRacha() {
  const ordenados = [...new Set(estado.dias)].sort();
  let mejor = 0;
  let actual = 0;
  let anterior = null;
  for (const dia of ordenados) {
    const fecha = new Date(dia + 'T12:00:00');
    actual = anterior && claveFecha(sumarDias(anterior, 1)) === dia ? actual + 1 : 1;
    mejor = Math.max(mejor, actual);
    anterior = fecha;
  }
  return mejor;
}

// ---- Acciones ----

function alternarDia(dia) {
  if (estado.dias.includes(dia)) {
    estado.dias = estado.dias.filter((d) => d !== dia);
  } else {
    estado.dias.push(dia);
  }
  guardar();
  dibujar();
  sincronizar();
}

// ---- Interfaz ----

function mostrarVista(vista) {
  $('vista-principal').hidden = vista !== 'principal';
  $('vista-ajustes').hidden = vista !== 'ajustes';
  $('btn-ajustes').hidden = !estado.accion;
  if (vista === 'ajustes') {
    $('campo-accion').value = estado.accion;
    $('campo-hora').value = estado.hora;
    $('campo-mensaje').value = estado.mensaje;
    $('campo-repetir').value = String(estado.repetir);
    actualizarEjemploMensaje();
    $('titulo-ajustes').textContent = estado.accion ? 'Ajustes' : 'Configurá tu recordatorio';
    $('btn-cancelar').hidden = !estado.accion;
    actualizarBotonNotificaciones();
  }
}

function dibujar() {
  $('texto-accion').textContent = estado.accion;
  $('texto-hora').textContent = estado.hora;

  const boton = $('btn-hecho');
  boton.textContent = hechoHoy() ? '✓ ¡Hecho hoy! (tocar para deshacer)' : 'Marcar como hecho hoy';
  boton.classList.toggle('hecho', hechoHoy());

  $('racha-actual').textContent = rachaActual();
  $('racha-mejor').textContent = mejorRacha();
  $('total').textContent = new Set(estado.dias).size;

  const calendario = $('calendario');
  calendario.innerHTML = '';
  const formato = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
  for (let i = 27; i >= 0; i--) {
    const fecha = sumarDias(new Date(), -i);
    const dia = claveFecha(fecha);
    const celda = document.createElement('button');
    const hecho = estado.dias.includes(dia);
    celda.type = 'button';
    celda.className = 'dia' + (hecho ? ' hecho' : '') + (i === 0 ? ' hoy' : '');
    celda.textContent = fecha.getDate();
    celda.title = formato.format(fecha) + (hecho ? ' — hecho' : ' — sin hacer');
    celda.setAttribute('aria-pressed', hecho);
    celda.addEventListener('click', () => alternarDia(dia));
    calendario.appendChild(celda);
  }

  revisarRecordatorio();
}

// ---- Recordatorio ----

function yaEsLaHora() {
  const [h, m] = estado.hora.split(':').map(Number);
  const ahora = new Date();
  return ahora.getHours() * 60 + ahora.getMinutes() >= h * 60 + m;
}

function revisarRecordatorio() {
  if (!estado.accion) return;
  const pendiente = !hechoHoy() && yaEsLaHora();

  const aviso = $('aviso');
  aviso.hidden = !pendiente;
  if (pendiente) aviso.textContent = `⏰ Todavía no hiciste: ${estado.accion}`;

  // Una sola notificación por día. Con push activo la manda el servidor.
  if (pendiente && estado.ultimoAviso !== hoy()) {
    estado.ultimoAviso = hoy();
    guardar();
    if (!estado.pushActivo) notificar();
  }
}

const textoNotificacion = () => estado.mensaje || `Es hora de: ${estado.accion}`;

function actualizarEjemploMensaje() {
  const accion = $('campo-accion').value.trim() || 'tu acción';
  $('campo-mensaje').placeholder = `Es hora de: ${accion}`;
}

// Anota los días marcados con el botón "✓ Hecho" de la notificación (los guarda el service worker).
async function aplicarHechosPendientes() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_DATOS);
    const respuesta = await cache.match(CLAVE_HECHOS);
    if (!respuesta) return;
    const fechas = await respuesta.json();
    await cache.delete(CLAVE_HECHOS);
    const nuevas = fechas.filter((f) => !estado.dias.includes(f));
    if (!nuevas.length) return;
    estado.dias.push(...nuevas);
    guardar();
    if (estado.accion) dibujar();
  } catch (e) { /* sin acceso al almacenamiento: no hay nada para anotar */ }
}

// ---- Notificaciones push (llegan aunque la app esté cerrada) ----

const pushDisponible = () =>
  Boolean(SERVIDOR_PUSH) && 'serviceWorker' in navigator && 'PushManager' in window;

function deBase64Url(cadena) {
  const b64 = cadena.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function suscribirPush() {
  try {
    const registro = await navigator.serviceWorker.ready;
    if (!(await registro.pushManager.getSubscription())) {
      const { clave } = await (await fetch(`${SERVIDOR_PUSH}/clave-publica`)).json();
      await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deBase64Url(clave) });
    }
    await sincronizar();
  } catch (e) {
    alert('No se pudieron activar los avisos push. Revisá tu conexión e intentá de nuevo.');
  }
  actualizarBotonNotificaciones();
}

// Le cuenta al servidor la acción, la hora y el último día hecho, para que no avise si ya lo hiciste.
async function sincronizar() {
  if (!pushDisponible() || Notification.permission !== 'granted' || !estado.accion) return;
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      estado.pushActivo = false;
      return;
    }
    const respuesta = await fetch(`${SERVIDOR_PUSH}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suscripcion: suscripcion.toJSON(),
        accion: estado.accion,
        mensaje: estado.mensaje,
        repetir: estado.repetir,
        hora: estado.hora,
        zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ultimoHecho: [...estado.dias].sort().pop() || null,
      }),
    });
    estado.pushActivo = respuesta.ok;
    guardar();
  } catch (e) { /* sin conexión: se reintenta la próxima vez que se abra la app */ }
}

async function notificar() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const titulo = 'Recordatorio diario';
  const opciones = opcionesNotificacion(textoNotificacion(), hoy());
  try {
    // En Android las notificaciones deben salir del service worker.
    const registro = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
    if (registro) {
      await registro.showNotification(titulo, opciones);
    } else {
      // Fuera del service worker no se permiten botones.
      const { actions, ...sinBotones } = opciones;
      new Notification(titulo, sinBotones);
    }
  } catch (e) { /* el navegador no permitió mostrarla; queda el aviso en pantalla */ }
}

function actualizarBotonNotificaciones() {
  const boton = $('btn-notificaciones');
  boton.disabled = false;
  if (!('Notification' in window)) {
    boton.textContent = 'Este navegador no admite notificaciones';
    boton.disabled = true;
  } else if (Notification.permission === 'granted' && pushDisponible() && !estado.pushActivo) {
    boton.textContent = 'Activar avisos con la app cerrada';
  } else if (Notification.permission === 'granted') {
    boton.textContent = estado.pushActivo
      ? '✓ Avisos activados, aunque la app esté cerrada (probar)'
      : '✓ Notificaciones activadas (probar)';
  } else if (Notification.permission === 'denied') {
    boton.textContent = 'Notificaciones bloqueadas en el navegador';
    boton.disabled = true;
  } else {
    boton.textContent = 'Activar notificaciones';
  }
}

// ---- Eventos ----

$('btn-hecho').addEventListener('click', () => alternarDia(hoy()));
$('btn-ajustes').addEventListener('click', () => mostrarVista('ajustes'));
$('btn-cancelar').addEventListener('click', () => mostrarVista('principal'));

$('form-ajustes').addEventListener('submit', (e) => {
  e.preventDefault();
  const horaCambio = estado.hora !== $('campo-hora').value;
  estado.accion = $('campo-accion').value.trim();
  estado.hora = $('campo-hora').value;
  estado.mensaje = $('campo-mensaje').value.trim();
  estado.repetir = Number($('campo-repetir').value);
  if (horaCambio) estado.ultimoAviso = null;
  guardar();
  mostrarVista('principal');
  dibujar();
  sincronizar();
});

$('btn-notificaciones').addEventListener('click', async () => {
  if (Notification.permission !== 'granted') {
    await Notification.requestPermission();
  } else if (!pushDisponible() || estado.pushActivo) {
    notificar();
    return;
  }
  if (Notification.permission === 'granted' && pushDisponible()) await suscribirPush();
  actualizarBotonNotificaciones();
});

$('campo-accion').addEventListener('input', actualizarEjemploMensaje);

$('btn-borrar').addEventListener('click', () => {
  if (confirm('¿Borrar todos los días registrados? Esto no se puede deshacer.')) {
    estado.dias = [];
    guardar();
    dibujar();
    sincronizar();
  }
});

// Revisar cada 30 segundos, y al volver a la app (por si pasó la medianoche).
setInterval(() => estado.accion && dibujar(), 30 * 1000);
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !estado.accion) return;
  await aplicarHechosPendientes();
  dibujar();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  // El service worker avisa cuando se marcó "Hecho" desde la notificación con la app abierta.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data && e.data.tipo === 'hecho') aplicarHechosPendientes();
  });
}

// ---- Inicio ----

if (estado.accion) {
  mostrarVista('principal');
  dibujar();
  // Primero anotar lo marcado desde la notificación, para no mandarle al servidor un día viejo.
  aplicarHechosPendientes().then(sincronizar);
} else {
  mostrarVista('ajustes');
}
