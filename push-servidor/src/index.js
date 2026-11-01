// Servidor push de la app de recordatorios.
//
// GET  /clave-publica  -> clave pública VAPID para suscribirse a las notificaciones.
// POST /sincronizar    -> la app guarda su suscripción, zona horaria y la lista de acciones
//                         (nombre, mensaje, hora, frecuencia, cada cuánto repetir y días hechos).
// POST /hecho          -> el botón "✓ Hecho" de la notificación marca una acción sin abrir la app.
// Cron cada minuto     -> avisa de cada acción que toca hoy, ya pasó su hora y todavía no se
//                         cumplió en su período (día, mes o cada n días), y repite si así se eligió.
//
// Las claves VAPID se generan solas la primera vez y quedan guardadas en KV:
// la clave privada nunca sale de Cloudflare.

import { claveVapid, enviarPush } from './push.js';
import frecuencias from '../../recordatorio/frecuencia.js';

const { periodoDe, cumplidoEn, validarFrecuencia } = frecuencias;

const MAX_SUSCRIPCIONES = 20;
const MAX_ACCIONES = 20;
const MAX_HECHOS = 100; // alcanza para el período más largo (60 días)
const MAX_AVISOS_POR_DIA = 10;
const REPETICIONES = [0, 30, 60, 120, 180]; // minutos; 0 = no repetir
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ORIGEN_PERMITIDO,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    const responder = (cuerpo, status = 200) =>
      new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const { pathname } = new URL(request.url);

    if (request.method === 'GET' && pathname === '/clave-publica') {
      const { publica } = await claveVapid(env.DATOS);
      return responder({ clave: publica });
    }

    if (request.method === 'POST' && pathname === '/sincronizar') {
      let datos;
      try { datos = await request.json(); } catch { return responder({ error: 'JSON inválido' }, 400); }
      const error = validar(datos);
      if (error) return responder({ error }, 400);

      const lista = await leerSuscripciones(env.DATOS);
      const anterior = lista.find((s) => s.suscripcion.endpoint === datos.suscripcion.endpoint);
      const nueva = {
        suscripcion: {
          endpoint: datos.suscripcion.endpoint,
          keys: { p256dh: datos.suscripcion.keys.p256dh, auth: datos.suscripcion.keys.auth },
        },
        zona: datos.zona,
        acciones: accionesRecibidas(datos).map((a) => {
          const nueva = {
            id: a.id,
            nombre: a.nombre.trim().slice(0, 80),
            mensaje: (a.mensaje || '').trim().slice(0, 120),
            hora: a.hora,
            repetir: a.repetir || 0,
            frecuencia: a.frecuencia,
            hechos: recortarHechos(a.hechos),
            ultimoAviso: null,
            avisosHoy: 0,
            ultimoAvisoMs: 0,
          };
          // Si no cambió la hora, se conserva el registro de avisos de hoy; si cambió, se puede volver a avisar.
          const previa = anterior && anterior.acciones.find((x) => x.id === a.id);
          if (previa && previa.hora === a.hora) {
            nueva.ultimoAviso = previa.ultimoAviso;
            nueva.avisosHoy = previa.avisosHoy || (previa.ultimoAviso ? 1 : 0);
            nueva.ultimoAvisoMs = previa.ultimoAvisoMs || 0;
          }
          return nueva;
        }),
      };
      const resto = lista.filter((s) => s !== anterior);
      if (!anterior && resto.length >= MAX_SUSCRIPCIONES) return responder({ error: 'Límite de dispositivos' }, 429);
      await guardarSuscripciones(env.DATOS, [...resto, nueva]);
      return responder({ ok: true });
    }

    if (request.method === 'POST' && pathname === '/hecho') {
      let datos;
      try { datos = await request.json(); } catch { return responder({ error: 'JSON inválido' }, 400); }
      if (!datos || typeof datos.endpoint !== 'string' || !FECHA.test(datos.fecha || '')) {
        return responder({ error: 'Datos inválidos' }, 400);
      }
      const lista = await leerSuscripciones(env.DATOS);
      const s = lista.find((x) => x.suscripcion.endpoint === datos.endpoint);
      if (!s) return responder({ error: 'Suscripción desconocida' }, 404);
      // Las notificaciones de antes de tener varias acciones no dicen cuál: es la primera.
      const accion = datos.accion ? s.acciones.find((a) => a.id === datos.accion) : s.acciones[0];
      if (!accion) return responder({ error: 'Acción desconocida' }, 404);
      if (!accion.hechos.includes(datos.fecha)) {
        accion.hechos = recortarHechos([...accion.hechos, datos.fecha]);
        await guardarSuscripciones(env.DATOS, lista);
      }
      return responder({ ok: true });
    }

    return responder({ error: 'No encontrado' }, 404);
  },

  async scheduled(evento, env, ctx) {
    ctx.waitUntil(revisar(env, new Date(evento.scheduledTime)));
  },
};

export async function revisar(env, ahora) {
  const lista = await leerSuscripciones(env.DATOS);
  if (!lista.length) return;

  let cambios = false;
  const vigentes = [];
  for (const s of lista) {
    const { fecha, minutos } = horaLocal(ahora, s.zona);
    let vencida = false;
    for (const a of s.acciones) {
      const periodo = periodoDe(a.frecuencia, fecha);
      const [h, m] = a.hora.split(':').map(Number);
      const pendiente = periodo && !cumplidoEn(periodo, a.hechos) && minutos >= h * 60 + m;
      const primerAviso = a.ultimoAviso !== fecha;
      const avisosHoy = primerAviso ? 0 : a.avisosHoy || 1;
      // 5 s de tolerancia por si el cron se corre un poco.
      const tocaRepetir = !primerAviso && a.repetir > 0 && avisosHoy < MAX_AVISOS_POR_DIA &&
        ahora.getTime() - (a.ultimoAvisoMs || 0) >= a.repetir * 60 * 1000 - 5000;
      if (!pendiente || !(primerAviso || tocaRepetir)) continue;

      const status = await enviarPush(env.DATOS, env.CONTACTO, s.suscripcion, {
        titulo: avisosHoy ? `${a.nombre} · aviso ${avisosHoy + 1}` : a.nombre,
        cuerpo: a.mensaje || `Es hora de: ${a.nombre}`,
        fecha,
        accion: a.id,
      });
      cambios = true;
      // 404/410: el celular canceló la suscripción, se borra entera.
      if (status === 404 || status === 410) {
        vencida = true;
        break;
      }
      if (status >= 200 && status < 300) {
        a.ultimoAviso = fecha;
        a.avisosHoy = avisosHoy + 1;
        a.ultimoAvisoMs = ahora.getTime();
      }
    }
    if (!vencida) vigentes.push(s);
  }
  if (cambios) await guardarSuscripciones(env.DATOS, vigentes);
}

// Fecha (AAAA-MM-DD) y minutos desde la medianoche en la zona horaria de la persona.
export function horaLocal(fecha, zona) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(fecha).map((p) => [p.type, p.value])
  );
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    minutos: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

// La app de antes mandaba una sola acción diaria; se convierte a la lista nueva.
function accionesRecibidas(d) {
  if (Array.isArray(d.acciones)) return d.acciones;
  return [{
    id: 'principal',
    nombre: d.accion,
    mensaje: d.mensaje,
    hora: d.hora,
    repetir: d.repetir,
    frecuencia: { tipo: 'diaria' },
    hechos: d.ultimoHecho ? [d.ultimoHecho] : [],
  }];
}

function recortarHechos(hechos) {
  return [...new Set(hechos)].sort().slice(-MAX_HECHOS);
}

function validar(d) {
  const s = d && d.suscripcion;
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return 'Suscripción inválida';
  if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return 'Suscripción inválida';
  try { horaLocal(new Date(), d.zona); } catch { return 'Zona horaria inválida'; }
  if (!Array.isArray(d.acciones)) {
    if (typeof d.accion !== 'string') return 'Faltan las acciones';
    if (d.ultimoHecho != null && !FECHA.test(d.ultimoHecho)) return 'Fecha inválida';
  }
  const acciones = accionesRecibidas(d);
  if (acciones.length > MAX_ACCIONES) return 'Demasiadas acciones';
  const ids = new Set();
  for (const a of acciones) {
    if (!a || typeof a.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(a.id) || ids.has(a.id)) return 'Acción inválida';
    ids.add(a.id);
    if (typeof a.nombre !== 'string' || !a.nombre.trim()) return 'Falta el nombre de la acción';
    if (typeof a.hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.hora)) return 'Hora inválida';
    if (a.mensaje != null && typeof a.mensaje !== 'string') return 'Mensaje inválido';
    if (a.repetir != null && !REPETICIONES.includes(a.repetir)) return 'Repetición inválida';
    const errorFrecuencia = validarFrecuencia(a.frecuencia);
    if (errorFrecuencia) return errorFrecuencia;
    if (!Array.isArray(a.hechos) || a.hechos.length > 400 || !a.hechos.every((f) => FECHA.test(f))) return 'Días hechos inválidos';
  }
  return null;
}

// Las suscripciones guardadas antes de tener varias acciones se convierten al leerlas.
async function leerSuscripciones(kv) {
  const lista = (await kv.get('suscripciones', 'json')) || [];
  return lista.map((s) => (s.acciones ? s : {
    suscripcion: s.suscripcion,
    zona: s.zona,
    acciones: [{
      id: 'principal',
      nombre: s.accion,
      mensaje: s.mensaje || '',
      hora: s.hora,
      repetir: s.repetir || 0,
      frecuencia: { tipo: 'diaria' },
      hechos: s.ultimoHecho ? [s.ultimoHecho] : [],
      ultimoAviso: s.ultimoAviso || null,
      avisosHoy: s.avisosHoy || 0,
      ultimoAvisoMs: s.ultimoAvisoMs || 0,
    }],
  }));
}

async function guardarSuscripciones(kv, lista) {
  await kv.put('suscripciones', JSON.stringify(lista));
}
