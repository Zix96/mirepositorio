// Servidor push del Recordatorio diario.
//
// GET  /clave-publica  -> clave pública VAPID para suscribirse a las notificaciones.
// POST /sincronizar    -> la app guarda su suscripción, acción, mensaje, hora, zona horaria,
//                         cada cuánto repetir el aviso y el último día hecho.
// POST /hecho          -> el botón "✓ Hecho" de la notificación marca el día sin abrir la app.
// Cron cada minuto     -> manda la notificación a quien ya pasó su hora y no marcó "Hecho" hoy,
//                         y la repite cada tanto si así lo eligió.
//
// Las claves VAPID se generan solas la primera vez y quedan guardadas en KV:
// la clave privada nunca sale de Cloudflare.

import { claveVapid, enviarPush } from './push.js';

const MAX_SUSCRIPCIONES = 20;
const MAX_AVISOS_POR_DIA = 10;
const REPETICIONES = [0, 30, 60, 120, 180]; // minutos; 0 = no repetir

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
        accion: datos.accion.slice(0, 80),
        mensaje: (datos.mensaje || '').trim().slice(0, 120),
        hora: datos.hora,
        zona: datos.zona,
        repetir: datos.repetir || 0,
        ultimoHecho: datos.ultimoHecho || null,
        ultimoAviso: null,
        avisosHoy: 0,
        ultimoAvisoMs: 0,
      };
      // Si no cambió la hora, se conserva el registro de avisos de hoy; si cambió, se puede volver a avisar.
      if (anterior && anterior.hora === datos.hora) {
        nueva.ultimoAviso = anterior.ultimoAviso;
        nueva.avisosHoy = anterior.avisosHoy || (anterior.ultimoAviso ? 1 : 0);
        nueva.ultimoAvisoMs = anterior.ultimoAvisoMs || 0;
      }
      const resto = lista.filter((s) => s !== anterior);
      if (!anterior && resto.length >= MAX_SUSCRIPCIONES) return responder({ error: 'Límite de dispositivos' }, 429);
      await guardarSuscripciones(env.DATOS, [...resto, nueva]);
      return responder({ ok: true });
    }

    if (request.method === 'POST' && pathname === '/hecho') {
      let datos;
      try { datos = await request.json(); } catch { return responder({ error: 'JSON inválido' }, 400); }
      if (!datos || typeof datos.endpoint !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '')) {
        return responder({ error: 'Datos inválidos' }, 400);
      }
      const lista = await leerSuscripciones(env.DATOS);
      const s = lista.find((x) => x.suscripcion.endpoint === datos.endpoint);
      if (!s) return responder({ error: 'Suscripción desconocida' }, 404);
      if (!s.ultimoHecho || datos.fecha > s.ultimoHecho) {
        s.ultimoHecho = datos.fecha;
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
    const [h, m] = s.hora.split(':').map(Number);
    const pendiente = minutos >= h * 60 + m && s.ultimoHecho !== fecha;
    const primerAviso = s.ultimoAviso !== fecha;
    const avisosHoy = primerAviso ? 0 : s.avisosHoy || 1;
    // 5 s de tolerancia por si el cron se corre un poco.
    const tocaRepetir = !primerAviso && s.repetir > 0 && avisosHoy < MAX_AVISOS_POR_DIA &&
      ahora.getTime() - (s.ultimoAvisoMs || 0) >= s.repetir * 60 * 1000 - 5000;
    if (!pendiente || !(primerAviso || tocaRepetir)) {
      vigentes.push(s);
      continue;
    }
    const status = await enviarPush(env.DATOS, env.CONTACTO, s.suscripcion, {
      titulo: avisosHoy ? `Recordatorio diario · aviso ${avisosHoy + 1}` : 'Recordatorio diario',
      cuerpo: s.mensaje || `Es hora de: ${s.accion}`,
      fecha,
    });
    cambios = true;
    // 404/410: el celular canceló la suscripción, se borra.
    if (status === 404 || status === 410) continue;
    if (status >= 200 && status < 300) {
      s.ultimoAviso = fecha;
      s.avisosHoy = avisosHoy + 1;
      s.ultimoAvisoMs = ahora.getTime();
    }
    vigentes.push(s);
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

function validar(d) {
  const s = d && d.suscripcion;
  if (!s || typeof s.endpoint !== 'string' || !s.endpoint.startsWith('https://')) return 'Suscripción inválida';
  if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') return 'Suscripción inválida';
  if (typeof d.accion !== 'string' || !d.accion.trim()) return 'Falta la acción';
  if (typeof d.hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.hora)) return 'Hora inválida';
  try { horaLocal(new Date(), d.zona); } catch { return 'Zona horaria inválida'; }
  if (d.ultimoHecho != null && !/^\d{4}-\d{2}-\d{2}$/.test(d.ultimoHecho)) return 'Fecha inválida';
  if (d.mensaje != null && typeof d.mensaje !== 'string') return 'Mensaje inválido';
  if (d.repetir != null && !REPETICIONES.includes(d.repetir)) return 'Repetición inválida';
  return null;
}

async function leerSuscripciones(kv) {
  return (await kv.get('suscripciones', 'json')) || [];
}

async function guardarSuscripciones(kv, lista) {
  await kv.put('suscripciones', JSON.stringify(lista));
}
