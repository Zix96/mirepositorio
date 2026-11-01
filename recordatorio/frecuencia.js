// Frecuencias de las acciones: qué días toca cada una y cómo se cuentan las rachas.
// Lo usan la app (cargado como script) y el servidor push (push-servidor/src/index.js lo importa),
// así los dos calculan lo mismo. Trabaja con fechas como texto 'AAAA-MM-DD', sin zonas horarias.
//
// Tipos de frecuencia:
//   { tipo: 'diaria' }
//   { tipo: 'semanal', dias: [1, 3, 5] }           días de la semana: 0 = domingo ... 6 = sábado
//   { tipo: 'mensual' }                            una vez en el mes, cualquier día
//   { tipo: 'cada', n: 3, inicio: '2026-11-01' }   cada n días contando desde inicio
//
// Cada frecuencia divide el calendario en períodos ({ inicio, fin }): un día para la diaria y
// la semanal, el mes para la mensual y n días para "cada". Un período se cumple si hay alguna
// marca dentro, y la racha cuenta períodos cumplidos sin saltear ninguno.

const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

function fechaAMs(fecha) {
  const [a, m, d] = fecha.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

const msAFecha = (ms) => new Date(ms).toISOString().slice(0, 10);
const moverFecha = (fecha, dias) => msAFecha(fechaAMs(fecha) + dias * MS_DIA);
const diaDeLaSemana = (fecha) => new Date(fechaAMs(fecha)).getUTCDay();

// El período que incluye la fecha, o null si ese día no toca.
function periodoDe(frecuencia, fecha) {
  switch (frecuencia.tipo) {
    case 'semanal':
      return frecuencia.dias.includes(diaDeLaSemana(fecha)) ? { inicio: fecha, fin: fecha } : null;
    case 'mensual': {
      const [a, m] = fecha.split('-').map(Number);
      return { inicio: `${fecha.slice(0, 7)}-01`, fin: msAFecha(Date.UTC(a, m, 0)) };
    }
    case 'cada': {
      if (fecha < frecuencia.inicio) return null;
      const k = Math.floor((fechaAMs(fecha) - fechaAMs(frecuencia.inicio)) / MS_DIA / frecuencia.n);
      const inicio = moverFecha(frecuencia.inicio, k * frecuencia.n);
      return { inicio, fin: moverFecha(inicio, frecuencia.n - 1) };
    }
    default:
      return { inicio: fecha, fin: fecha };
  }
}

// El período que incluye la fecha o, si ese día no toca, el siguiente (busca hasta un año y medio).
function periodoDesde(frecuencia, fecha) {
  for (let i = 0; i < 550; i++) {
    const periodo = periodoDe(frecuencia, moverFecha(fecha, i));
    if (periodo) return periodo;
  }
  return null;
}

const periodoSiguiente = (frecuencia, periodo) => periodoDesde(frecuencia, moverFecha(periodo.fin, 1));
const cumplidoEn = (periodo, hechos) => hechos.some((d) => d >= periodo.inicio && d <= periodo.fin);

// Recorre los períodos desde la primera marca hasta hoy. Devuelve la racha actual (el período
// en curso sin cumplir todavía no la corta), la mejor racha, cuántos períodos se cumplieron y,
// para cada umbral, la fecha de la marca con la que la racha llegó a ese número por primera vez.
function resumenRachas(frecuencia, hechos, hoy, umbrales = []) {
  const marcas = [...new Set(hechos)].sort();
  const resumen = { racha: 0, mejor: 0, total: 0, logros: {} };
  let i = 0;
  for (let p = marcas.length ? periodoDesde(frecuencia, marcas[0]) : null; p && p.inicio <= hoy; p = periodoSiguiente(frecuencia, p)) {
    while (i < marcas.length && marcas[i] < p.inicio) i++;
    const marca = i < marcas.length && marcas[i] <= p.fin ? marcas[i] : null;
    if (marca) {
      resumen.racha++;
      resumen.total++;
      resumen.mejor = Math.max(resumen.mejor, resumen.racha);
      if (umbrales.includes(resumen.racha) && !resumen.logros[resumen.racha]) resumen.logros[resumen.racha] = marca;
    } else if (p.fin < hoy) {
      resumen.racha = 0;
    }
  }
  return resumen;
}

function describirFrecuencia(frecuencia) {
  switch (frecuencia.tipo) {
    case 'semanal': {
      if (frecuencia.dias.length === 7) return 'Todos los días';
      if (frecuencia.dias.length === 1) return `Los ${DIAS_PLURAL[frecuencia.dias[0]]}`;
      const nombres = [1, 2, 3, 4, 5, 6, 0].filter((d) => frecuencia.dias.includes(d)).map((d) => DIAS_CORTOS[d]);
      const texto = `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
      return texto[0].toUpperCase() + texto.slice(1);
    }
    case 'mensual':
      return 'Una vez por mes';
    case 'cada':
      return `Cada ${frecuencia.n} días`;
    default:
      return 'Todos los días';
  }
}

// Devuelve el problema de la frecuencia, o null si es válida.
function validarFrecuencia(frecuencia) {
  if (!frecuencia || typeof frecuencia !== 'object') return 'Falta la frecuencia';
  switch (frecuencia.tipo) {
    case 'diaria':
    case 'mensual':
      return null;
    case 'semanal': {
      const dias = frecuencia.dias;
      const validos = Array.isArray(dias) && dias.length >= 1 && dias.length <= 7 &&
        dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(dias).size === dias.length;
      return validos ? null : 'Días de la semana inválidos';
    }
    case 'cada': {
      if (!Number.isInteger(frecuencia.n) || frecuencia.n < 2 || frecuencia.n > 60) return 'Cantidad de días inválida';
      return /^\d{4}-\d{2}-\d{2}$/.test(frecuencia.inicio || '') ? null : 'Fecha de inicio inválida';
    }
    default:
      return 'Tipo de frecuencia inválido';
  }
}

// En el navegador las funciones quedan globales; el servidor las importa como módulo.
if (typeof module !== 'undefined') {
  module.exports = {
    moverFecha, diaDeLaSemana, periodoDe, periodoDesde, periodoSiguiente, cumplidoEn,
    resumenRachas, describirFrecuencia, validarFrecuencia,
  };
}
