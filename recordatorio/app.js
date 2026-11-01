// Recordatorios: una lista de acciones, cada una con su frecuencia, hora, racha y logros.
// Todo se guarda en localStorage de este dispositivo. SERVIDOR_PUSH y las opciones de la
// notificación están en comun.js (también lo usa el service worker); qué días toca cada
// acción y cómo se cuentan las rachas, en frecuencia.js (también lo usa el servidor push).

const CLAVE = 'recordatorio-diario';
const $ = (id) => document.getElementById(id);

let estado = cargar();
let vista = 'lista';
let idActual = null; // acción abierta en el detalle o el editor (null = acción nueva)

// ---- Datos ----

function cargar() {
  let datos = null;
  try { datos = JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { /* datos dañados o sin acceso */ }
  if (datos && Array.isArray(datos.acciones)) return datos;
  const nuevo = { acciones: [], pushActivo: false };
  // Versión anterior: una sola acción diaria. Pasa a ser la primera de la lista, con su historial.
  if (datos && datos.accion) {
    nuevo.pushActivo = Boolean(datos.pushActivo);
    nuevo.acciones.push({
      id: 'principal',
      nombre: datos.accion,
      hora: datos.hora || '20:00',
      mensaje: datos.mensaje || '',
      repetir: datos.repetir || 0,
      frecuencia: { tipo: 'diaria' },
      dias: datos.dias || [],
      logros: datos.logros,
      ultimoAviso: datos.ultimoAviso || null,
    });
  }
  return nuevo;
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ }
}

const hoy = () => claveFecha(new Date());
const buscarAccion = (id) => estado.acciones.find((a) => a.id === id);
const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fechaLocal = (fecha) => new Date(fecha + 'T12:00:00');

// El período de hoy (día, mes o tramo de n días), o null si hoy no toca.
const periodoHoy = (accion) => periodoDe(accion.frecuencia, hoy());
const cumplidaHoy = (accion) => {
  const periodo = periodoHoy(accion);
  return Boolean(periodo) && cumplidoEn(periodo, accion.dias);
};

// ---- Logros: medallas por veces seguidas, según la frecuencia ----

const LOGROS = {
  diaria: {
    unidad: ['día seguido', 'días seguidos'],
    total: 'días en total',
    medallas: [
      { n: 3, emoji: '🌱', nombre: 'Primer brote' },
      { n: 7, emoji: '🔥', nombre: 'Una semana' },
      { n: 14, emoji: '⚡', nombre: 'Dos semanas' },
      { n: 30, emoji: '🌟', nombre: 'Un mes' },
      { n: 60, emoji: '💎', nombre: 'Dos meses' },
      { n: 100, emoji: '💯', nombre: 'Cien días' },
      { n: 180, emoji: '🚀', nombre: 'Medio año' },
      { n: 365, emoji: '👑', nombre: 'Un año' },
    ],
  },
  mensual: {
    unidad: ['mes seguido', 'meses seguidos'],
    total: 'meses cumplidos',
    medallas: [
      { n: 2, emoji: '🌱', nombre: 'Primer brote' },
      { n: 3, emoji: '🔥', nombre: 'Un trimestre' },
      { n: 6, emoji: '⚡', nombre: 'Medio año' },
      { n: 12, emoji: '🌟', nombre: 'Un año' },
      { n: 18, emoji: '💎', nombre: 'Año y medio' },
      { n: 24, emoji: '💯', nombre: 'Dos años' },
      { n: 36, emoji: '🚀', nombre: 'Tres años' },
      { n: 60, emoji: '👑', nombre: 'Cinco años' },
    ],
  },
  veces: {
    unidad: ['vez seguida', 'veces seguidas'],
    total: 'veces en total',
    medallas: [
      { n: 3, emoji: '🌱', nombre: 'Primer brote' },
      { n: 5, emoji: '🔥', nombre: 'En racha' },
      { n: 10, emoji: '⚡', nombre: 'Imparable' },
      { n: 20, emoji: '🌟', nombre: 'Constancia' },
      { n: 30, emoji: '💎', nombre: 'Diamante' },
      { n: 50, emoji: '💯', nombre: 'Cincuenta' },
      { n: 75, emoji: '🚀', nombre: 'Leyenda' },
      { n: 100, emoji: '👑', nombre: 'Cien veces' },
    ],
  },
};

const logrosDe = (accion) => LOGROS[accion.frecuencia.tipo] || LOGROS.veces;
const unidad = (accion, n) => logrosDe(accion).unidad[n === 1 ? 0 : 1];
const resumenDe = (accion) =>
  resumenRachas(accion.frecuencia, accion.dias, hoy(), logrosDe(accion).medallas.map((m) => m.n));

// Suma las medallas ganadas; una vez ganadas no se pierden aunque se corte la racha. Devuelve
// las nuevas (vacío la primera vez, para no festejar medallas de antes de tenerlas o de cambiar
// la frecuencia).
function actualizarLogros(accion) {
  const primeraVez = !accion.logros;
  accion.logros = accion.logros || {};
  const nuevas = [];
  for (const [n, fecha] of Object.entries(resumenDe(accion).logros)) {
    if (!accion.logros[n]) {
      accion.logros[n] = fecha;
      nuevas.push(logrosDe(accion).medallas.find((m) => m.n === Number(n)));
    }
  }
  return primeraVez ? [] : nuevas;
}

function mostrarLogro(accion, medalla) {
  $('logro-emoji').textContent = medalla.emoji;
  $('logro-nombre').textContent = medalla.nombre;
  $('logro-texto').textContent = `${accion.nombre}: llegaste a ${medalla.n} ${unidad(accion, medalla.n)}. ¡Seguí así!`;
  const dialogo = $('dialogo-logro');
  if (typeof dialogo.showModal === 'function' && !dialogo.open) dialogo.showModal();
  festejar(110);
}

// ---- Marcar ----

// Guarda el cambio, festeja si se ganó una medalla y devuelve si se ganó.
function registrarCambio(accion) {
  const nuevas = actualizarLogros(accion);
  guardar();
  dibujar();
  sincronizar();
  if (nuevas.length) mostrarLogro(accion, nuevas[nuevas.length - 1]);
  return nuevas.length > 0;
}

// Botón "Hecho": si el período de hoy ya está cumplido, lo deshace; si no, marca hoy.
function alternarHoy(accion) {
  const periodo = periodoHoy(accion);
  if (!periodo) return;
  const yaCumplida = cumplidoEn(periodo, accion.dias);
  if (yaCumplida) {
    accion.dias = accion.dias.filter((d) => d < periodo.inicio || d > periodo.fin);
  } else {
    accion.dias.push(hoy());
  }
  const medalla = registrarCambio(accion);
  if (!yaCumplida && !medalla) festejar();
}

function alternarDia(accion, dia) {
  accion.dias = accion.dias.includes(dia) ? accion.dias.filter((d) => d !== dia) : [...accion.dias, dia];
  registrarCambio(accion);
}

// ---- Festejo ----

const COLORES_CONFETI = ['#e83e8c', '#f26b38', '#ffc93c', '#0f9d8a', '#7c5cff', '#3fa9f5'];

function festejar(cantidad = 60) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const capa = document.createElement('div');
  capa.className = 'confeti';
  capa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < cantidad; i++) {
    const pieza = document.createElement('span');
    pieza.style.setProperty('--x', `${Math.random() * 100}%`);
    pieza.style.setProperty('--c', COLORES_CONFETI[i % COLORES_CONFETI.length]);
    pieza.style.setProperty('--d', `${1.4 + Math.random() * 1.2}s`);
    pieza.style.setProperty('--r', `${Math.random() * 0.4}s`);
    pieza.style.setProperty('--dx', `${(Math.random() - 0.5) * 160}px`);
    pieza.style.setProperty('--giro', `${(Math.random() - 0.5) * 1440}deg`);
    capa.appendChild(pieza);
  }
  // Con la tarjeta de medalla abierta, el confeti va adentro para quedar por encima de ella.
  const dialogo = $('dialogo-logro');
  (dialogo.open ? dialogo : document.body).appendChild(capa);
  setTimeout(() => capa.remove(), 3200);

  const racha = vista === 'detalle' ? $('racha-actual') : document.querySelector(`[data-racha="${idActual}"]`);
  if (!racha) return;
  racha.classList.remove('salto');
  void racha.offsetWidth; // reinicia la animación si se repite
  racha.classList.add('salto');
}

// ---- Vistas ----

function mostrarVista(nueva, id = idActual) {
  vista = nueva;
  idActual = id;
  for (const v of ['lista', 'detalle', 'editor', 'ajustes']) $(`vista-${v}`).hidden = v !== nueva;
  const hayAcciones = estado.acciones.length > 0;
  $('btn-volver').hidden = nueva === 'lista' || (nueva === 'editor' && !hayAcciones);
  $('btn-ajustes').hidden = nueva === 'ajustes' || !hayAcciones;
  $('titulo').textContent = { lista: 'Mis recordatorios', detalle: 'Mis recordatorios', editor: 'Mis recordatorios', ajustes: 'Ajustes' }[nueva];
  if (nueva === 'editor') llenarEditor();
  if (nueva === 'ajustes') actualizarBotonNotificaciones();
  dibujar();
  window.scrollTo(0, 0);
}

function volver() {
  if (vista === 'editor' && idActual && buscarAccion(idActual)) mostrarVista('detalle');
  else mostrarVista('lista', null);
}

function dibujar() {
  if (vista === 'lista') dibujarLista();
  if (vista === 'detalle') dibujarDetalle();
  revisarRecordatorios();
}

const formatoCorto = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });

// Texto del estado de hoy: "Hoy no toca · próxima: lun 3 nov", "✓ Hecho este mes", etc.
function estadoDeHoy(accion) {
  const periodo = periodoHoy(accion);
  if (!periodo) {
    const proximo = periodoDesde(accion.frecuencia, hoy());
    return { toca: false, texto: proximo ? `Hoy no toca · próxima: ${formatoCorto.format(fechaLocal(proximo.inicio))}` : 'Hoy no toca' };
  }
  const hecha = cumplidoEn(periodo, accion.dias);
  if (accion.frecuencia.tipo === 'mensual') return { toca: true, hecha, texto: hecha ? '✓ Hecho este mes' : 'Pendiente este mes' };
  if (periodo.inicio !== periodo.fin) {
    const siguiente = formatoCorto.format(fechaLocal(moverFecha(periodo.fin, 1)));
    return { toca: true, hecha, texto: hecha ? `✓ Hecho · próxima: ${siguiente}` : `Pendiente hasta el ${formatoCorto.format(fechaLocal(periodo.fin))}` };
  }
  return { toca: true, hecha, texto: hecha ? '✓ Hecho hoy' : 'Pendiente hoy' };
}

function dibujarLista() {
  const lista = $('lista-acciones');
  lista.innerHTML = '';
  for (const accion of estado.acciones) {
    const { racha } = resumenDe(accion);
    const hoyEstado = estadoDeHoy(accion);
    const item = document.createElement('li');
    item.className = 'tarjeta item-accion' + (hoyEstado.hecha ? ' hecha' : '');
    item.innerHTML = `
      <button class="item-cuerpo" type="button">
        <span class="item-nombre"></span>
        <span class="item-detalle"></span>
        <span class="item-estado"></span>
        <span class="item-racha">🔥 <span class="item-numero"></span> <span class="item-unidad"></span></span>
      </button>`;
    item.querySelector('.item-nombre').textContent = accion.nombre;
    item.querySelector('.item-detalle').textContent = `${describirFrecuencia(accion.frecuencia)} · ${accion.hora}`;
    item.querySelector('.item-estado').textContent = hoyEstado.texto;
    item.querySelector('.item-numero').textContent = racha;
    item.querySelector('.item-numero').dataset.racha = accion.id;
    item.querySelector('.item-unidad').textContent = unidad(accion, racha);
    item.querySelector('.item-cuerpo').addEventListener('click', () => mostrarVista('detalle', accion.id));
    item.querySelector('.item-cuerpo').setAttribute('aria-label', `${accion.nombre}: ${hoyEstado.texto}. Ver detalle`);

    if (hoyEstado.toca) {
      const marcar = document.createElement('button');
      marcar.type = 'button';
      marcar.className = 'item-marcar' + (hoyEstado.hecha ? ' hecho' : '');
      marcar.textContent = hoyEstado.hecha ? '✓' : '';
      marcar.setAttribute('aria-pressed', hoyEstado.hecha);
      marcar.setAttribute('aria-label', hoyEstado.hecha ? `Deshacer ${accion.nombre}` : `Marcar ${accion.nombre} como hecho`);
      marcar.addEventListener('click', () => {
        idActual = accion.id;
        alternarHoy(accion);
      });
      item.appendChild(marcar);
    }
    lista.appendChild(item);
  }
}

function dibujarDetalle() {
  const accion = buscarAccion(idActual);
  if (!accion) return;
  const resumen = resumenDe(accion);
  const hoyEstado = estadoDeHoy(accion);

  $('detalle-frecuencia').textContent = describirFrecuencia(accion.frecuencia);
  $('texto-accion').textContent = accion.nombre;
  $('texto-hora').textContent = hoyEstado.toca ? `Recordatorio a las ${accion.hora}` : hoyEstado.texto;

  const boton = $('btn-hecho');
  boton.hidden = !hoyEstado.toca;
  if (hoyEstado.toca) {
    const cuando = accion.frecuencia.tipo === 'mensual' ? 'este mes' : periodoHoy(accion).inicio !== periodoHoy(accion).fin ? '' : 'hoy';
    boton.textContent = hoyEstado.hecha
      ? `🎉 ¡Hecho${cuando ? ' ' + cuando : ''}! (tocar para deshacer)`
      : `👉 Marcar como hecho${cuando ? ' ' + cuando : ''}`;
    boton.classList.toggle('hecho', hoyEstado.hecha);
  }

  $('racha-actual').textContent = resumen.racha;
  $('etiqueta-racha').textContent = unidad(accion, resumen.racha);
  $('racha-mejor').textContent = resumen.mejor;
  $('total').textContent = resumen.total;
  $('etiqueta-total').textContent = logrosDe(accion).total;

  dibujarLogros(accion, resumen.racha);
  dibujarCalendario(accion);
}

function dibujarLogros(accion, racha) {
  const formato = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const lista = $('logros');
  lista.innerHTML = '';
  const medallas = logrosDe(accion).medallas;
  for (const medalla of medallas) {
    const fecha = accion.logros && accion.logros[medalla.n];
    const faltan = medalla.n - racha;
    const item = document.createElement('li');
    item.className = 'logro' + (fecha ? ' ganado' : '');
    item.innerHTML = '<span class="logro-emoji" aria-hidden="true"></span>' +
      '<span class="logro-nombre"></span><span class="logro-detalle"></span>';
    item.querySelector('.logro-emoji').textContent = medalla.emoji;
    item.querySelector('.logro-nombre').textContent = medalla.nombre;
    item.querySelector('.logro-detalle').textContent = fecha
      ? formato.format(fechaLocal(fecha))
      : `faltan ${faltan}`;
    item.title = `${medalla.nombre}: ${medalla.n} ${unidad(accion, medalla.n)}` + (fecha ? ' — ganada' : '');
    lista.appendChild(item);
  }

  const proxima = medallas.find((m) => !(accion.logros && accion.logros[m.n]));
  if (proxima) {
    const faltan = proxima.n - racha;
    $('proximo-logro').textContent =
      `Próxima medalla: ${proxima.emoji} ${proxima.nombre} (${proxima.n} ${unidad(accion, proxima.n)}) — ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}`;
  } else {
    $('proximo-logro').textContent = '¡Ganaste todas las medallas! 👑';
  }
}

function dibujarCalendario(accion) {
  const calendario = $('calendario');
  calendario.innerHTML = '';
  const formato = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
  for (let i = 27; i >= 0; i--) {
    const dia = moverFecha(hoy(), -i);
    const hecho = accion.dias.includes(dia);
    const celda = document.createElement('button');
    celda.type = 'button';
    celda.className = 'dia' + (hecho ? ' hecho' : '') + (i === 0 ? ' hoy' : '') +
      (periodoDe(accion.frecuencia, dia) ? '' : ' no-toca');
    celda.textContent = fechaLocal(dia).getDate();
    celda.title = formato.format(fechaLocal(dia)) + (hecho ? ' — hecho' : ' — sin hacer');
    celda.setAttribute('aria-pressed', hecho);
    celda.addEventListener('click', () => alternarDia(accion, dia));
    calendario.appendChild(celda);
  }
}

// ---- Editor ----

function llenarEditor() {
  const accion = buscarAccion(idActual);
  const f = accion ? accion.frecuencia : { tipo: 'diaria' };
  $('titulo-editor').textContent = accion ? 'Editar acción' : estado.acciones.length ? 'Nueva acción' : 'Creá tu primer recordatorio';
  $('campo-accion').value = accion ? accion.nombre : '';
  $('campo-frecuencia').value = f.tipo;
  for (const casilla of $('opciones-semanal').querySelectorAll('input')) {
    casilla.checked = f.tipo === 'semanal' && f.dias.includes(Number(casilla.value));
  }
  $('campo-n').value = f.tipo === 'cada' ? f.n : 3;
  $('campo-inicio').value = f.tipo === 'cada' ? f.inicio : hoy();
  $('campo-hora').value = accion ? accion.hora : '20:00';
  $('campo-mensaje').value = accion ? accion.mensaje : '';
  $('campo-repetir').value = String(accion ? accion.repetir : 0);
  $('btn-cancelar').hidden = !estado.acciones.length;
  actualizarOpcionesFrecuencia();
  actualizarEjemploMensaje();
}

const AYUDAS_FRECUENCIA = {
  mensual: 'Una vez en cualquier día del mes. Te avisa todos los días a la hora elegida hasta que lo marques.',
  cada: 'Si lo hacés un día tarde, igual cuenta para ese tramo. Te avisa cada día del tramo hasta que lo marques.',
};

function actualizarOpcionesFrecuencia() {
  const tipo = $('campo-frecuencia').value;
  $('opciones-semanal').hidden = tipo !== 'semanal';
  $('opciones-cada').hidden = tipo !== 'cada';
  $('ayuda-frecuencia').hidden = !AYUDAS_FRECUENCIA[tipo];
  $('ayuda-frecuencia').textContent = AYUDAS_FRECUENCIA[tipo] || '';
}

function actualizarEjemploMensaje() {
  const nombre = $('campo-accion').value.trim() || 'tu acción';
  $('campo-mensaje').placeholder = `Es hora de: ${nombre}`;
}

function frecuenciaDelEditor() {
  const tipo = $('campo-frecuencia').value;
  if (tipo === 'semanal') {
    const dias = [...$('opciones-semanal').querySelectorAll('input:checked')].map((c) => Number(c.value));
    return { tipo, dias };
  }
  if (tipo === 'cada') return { tipo, n: Number($('campo-n').value), inicio: $('campo-inicio').value || hoy() };
  return { tipo };
}

function guardarEditor(e) {
  e.preventDefault();
  const frecuencia = frecuenciaDelEditor();
  if (frecuencia.tipo === 'semanal' && !frecuencia.dias.length) {
    alert('Elegí al menos un día de la semana.');
    return;
  }
  if (validarFrecuencia(frecuencia)) {
    alert('Revisá la frecuencia: cada cuántos días tiene que ser un número entre 2 y 60.');
    return;
  }
  let accion = buscarAccion(idActual);
  if (!accion) {
    accion = { id: nuevoId(), dias: [], logros: undefined, ultimoAviso: null };
    estado.acciones.push(accion);
  } else if (JSON.stringify(accion.frecuencia) !== JSON.stringify(frecuencia)) {
    // Con otra frecuencia las rachas se cuentan distinto: las medallas se recalculan sin festejo.
    accion.logros = undefined;
  }
  if (accion.hora !== $('campo-hora').value) accion.ultimoAviso = null;
  Object.assign(accion, {
    nombre: $('campo-accion').value.trim(),
    frecuencia,
    hora: $('campo-hora').value,
    mensaje: $('campo-mensaje').value.trim(),
    repetir: Number($('campo-repetir').value),
  });
  actualizarLogros(accion);
  guardar();
  sincronizar();
  mostrarVista('detalle', accion.id);
}

// ---- Recordatorios con la app abierta ----

function pendientesAhora() {
  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  return estado.acciones.filter((a) => {
    const [h, m] = a.hora.split(':').map(Number);
    const periodo = periodoHoy(a);
    return periodo && !cumplidoEn(periodo, a.dias) && minutos >= h * 60 + m;
  });
}

function revisarRecordatorios() {
  const pendientes = pendientesAhora();
  const aviso = $('aviso');
  aviso.hidden = !pendientes.length;
  if (pendientes.length) aviso.textContent = `⏰ Todavía no hiciste: ${pendientes.map((a) => a.nombre).join(', ')}`;

  // Una notificación por acción y por día. Con push activo las manda el servidor.
  let cambios = false;
  for (const accion of pendientes) {
    if (accion.ultimoAviso === hoy()) continue;
    accion.ultimoAviso = hoy();
    cambios = true;
    if (!estado.pushActivo) notificar(accion);
  }
  if (cambios) guardar();
}

// Anota las marcas hechas con el botón "✓ Hecho" de la notificación (las guarda el service worker).
async function aplicarHechosPendientes() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_DATOS);
    const respuesta = await cache.match(CLAVE_HECHOS);
    if (!respuesta) return;
    const marcas = await respuesta.json();
    await cache.delete(CLAVE_HECHOS);
    const medallas = [];
    for (const marca of marcas) {
      // Las de la versión anterior eran solo la fecha, de la única acción que había.
      const { accion: id, fecha } = typeof marca === 'string' ? { accion: 'principal', fecha: marca } : marca;
      const accion = buscarAccion(id) || (id === 'principal' ? estado.acciones[0] : null);
      if (!accion || accion.dias.includes(fecha)) continue;
      accion.dias.push(fecha);
      for (const medalla of actualizarLogros(accion)) medallas.push([accion, medalla]);
    }
    guardar();
    dibujar();
    if (medallas.length) mostrarLogro(...medallas[medallas.length - 1]);
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

// Le cuenta al servidor las acciones y los días hechos recientes, para que solo avise lo pendiente.
async function sincronizar() {
  if (!pushDisponible() || Notification.permission !== 'granted') return;
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    if (!suscripcion) {
      estado.pushActivo = false;
      return;
    }
    // El período más largo es de 60 días: con lo de los últimos 70 alcanza.
    const desde = moverFecha(hoy(), -70);
    const respuesta = await fetch(`${SERVIDOR_PUSH}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suscripcion: suscripcion.toJSON(),
        zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
        acciones: estado.acciones.map((a) => ({
          id: a.id,
          nombre: a.nombre,
          mensaje: a.mensaje,
          hora: a.hora,
          repetir: a.repetir,
          frecuencia: a.frecuencia,
          hechos: a.dias.filter((d) => d >= desde),
        })),
      }),
    });
    estado.pushActivo = respuesta.ok;
    guardar();
  } catch (e) { /* sin conexión: se reintenta la próxima vez que se abra la app */ }
}

async function notificar(accion) {
  if (!accion || !('Notification' in window) || Notification.permission !== 'granted') return;
  const opciones = opcionesNotificacion(accion.mensaje || `Es hora de: ${accion.nombre}`, hoy(), accion.id);
  try {
    // En Android las notificaciones deben salir del service worker.
    const registro = 'serviceWorker' in navigator && (await navigator.serviceWorker.getRegistration());
    if (registro) {
      await registro.showNotification(accion.nombre, opciones);
    } else {
      // Fuera del service worker no se permiten botones.
      const { actions, ...sinBotones } = opciones;
      new Notification(accion.nombre, sinBotones);
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

$('btn-hecho').addEventListener('click', () => {
  const accion = buscarAccion(idActual);
  if (accion) alternarHoy(accion);
});
$('btn-agregar').addEventListener('click', () => mostrarVista('editor', null));
$('btn-ajustes').addEventListener('click', () => mostrarVista('ajustes', null));
$('btn-volver').addEventListener('click', volver);
$('btn-cancelar').addEventListener('click', volver);
$('btn-editar').addEventListener('click', () => mostrarVista('editor'));
$('form-accion').addEventListener('submit', guardarEditor);
$('campo-frecuencia').addEventListener('change', actualizarOpcionesFrecuencia);
$('campo-accion').addEventListener('input', actualizarEjemploMensaje);

$('btn-eliminar').addEventListener('click', () => {
  const accion = buscarAccion(idActual);
  if (!accion || !confirm(`¿Borrar "${accion.nombre}" con todo su historial y sus medallas? Esto no se puede deshacer.`)) return;
  estado.acciones = estado.acciones.filter((a) => a !== accion);
  guardar();
  sincronizar();
  mostrarVista(estado.acciones.length ? 'lista' : 'editor', null);
});

$('btn-notificaciones').addEventListener('click', async () => {
  if (Notification.permission !== 'granted') {
    await Notification.requestPermission();
  } else if (!pushDisponible() || estado.pushActivo) {
    notificar(estado.acciones[0]);
    return;
  }
  if (Notification.permission === 'granted' && pushDisponible()) await suscribirPush();
  actualizarBotonNotificaciones();
});

$('btn-borrar').addEventListener('click', () => {
  if (!confirm('¿Borrar los días registrados y las medallas de todas las acciones? Las acciones quedan. Esto no se puede deshacer.')) return;
  for (const accion of estado.acciones) {
    accion.dias = [];
    accion.logros = {};
  }
  guardar();
  sincronizar();
  mostrarVista('lista', null);
});

// Revisar cada 30 segundos, y al volver a la app (por si pasó la medianoche).
setInterval(dibujar, 30 * 1000);
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return;
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

for (const accion of estado.acciones) actualizarLogros(accion); // medallas que ya corresponden, sin festejo
guardar();
mostrarVista(estado.acciones.length ? 'lista' : 'editor', null);
// Primero anotar lo marcado desde la notificación, para no mandarle al servidor un día viejo.
aplicarHechosPendientes().then(sincronizar);
