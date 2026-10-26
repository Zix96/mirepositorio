// Recordatorio diario: una acción, una hora, y el registro de los días cumplidos.
// Todo se guarda en localStorage de este dispositivo.

const CLAVE = 'recordatorio-diario';
const $ = (id) => document.getElementById(id);

// Dirección del servidor de notificaciones push (carpeta push-servidor/), sin barra final.
// Vacía = solo avisos con la app abierta.
const SERVIDOR_PUSH = '';

let estado = cargar();

function cargar() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE));
    if (datos && datos.accion) return { dias: [], ultimoAviso: null, ...datos };
  } catch (e) { /* datos dañados o sin acceso: empezamos de cero */ }
  return { accion: '', hora: '20:00', dias: [], ultimoAviso: null };
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
}

// ---- Fechas (siempre en hora local, formato AAAA-MM-DD) ----

function claveFecha(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

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
  const opciones = {
    body: `Es hora de: ${estado.accion}`,
    icon: 'icono.svg',
    tag: 'recordatorio-diario',
    renotify: true,
  };
  try {
    // En Android las notificaciones deben salir del service worker.
    const registro = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
    if (registro) {
      await registro.showNotification(titulo, opciones);
    } else {
      new Notification(titulo, opciones);
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

// ---- Evento de calendario (.ics) con alarma diaria ----

function descargarCalendario() {
  const [h, m] = estado.hora.split(':');
  const inicio = hoy().replace(/-/g, '') + `T${h}${m}00`;
  const sello = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const texto = estado.accion.replace(/([,;\\])/g, '\\$1');
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Recordatorio diario//ES',
    'BEGIN:VEVENT',
    `UID:recordatorio-${Date.now()}@recordatorio-diario`,
    `DTSTAMP:${sello}`,
    `DTSTART:${inicio}`,
    'DURATION:PT15M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${texto}`,
    'DESCRIPTION:Recordatorio diario. Marcalo como hecho en la app.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${texto}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  enlace.download = 'recordatorio-diario.ics';
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
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

$('btn-calendario').addEventListener('click', () => {
  if (!estado.accion) {
    alert('Primero guardá tu acción y la hora.');
    return;
  }
  descargarCalendario();
});

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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && estado.accion) dibujar();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Inicio ----

if (estado.accion) {
  mostrarVista('principal');
  dibujar();
  sincronizar();
} else {
  mostrarVista('ajustes');
}
