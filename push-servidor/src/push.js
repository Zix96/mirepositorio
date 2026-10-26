// Web Push sin librerías: firma VAPID (RFC 8292) y cifrado aes128gcm (RFC 8291) con WebCrypto.

const texto = new TextEncoder();

export function aBase64Url(bytes) {
  let binario = '';
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(cadena) {
  const b64 = cadena.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

function unir(...partes) {
  const total = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { total.set(p, i); i += p.length; }
  return total;
}

// Claves VAPID: se crean la primera vez y se guardan en KV.
export async function claveVapid(kv) {
  let claves = await kv.get('vapid', 'json');
  if (!claves) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    claves = {
      privada: await crypto.subtle.exportKey('jwk', par.privateKey),
      publica: aBase64Url(await crypto.subtle.exportKey('raw', par.publicKey)),
    };
    await kv.put('vapid', JSON.stringify(claves));
  }
  return claves;
}

async function firmaVapid(claves, endpoint, contacto) {
  const encabezado = aBase64Url(texto.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const datos = aBase64Url(texto.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: contacto,
  })));
  const privada = await crypto.subtle.importKey('jwk', claves.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privada, texto.encode(`${encabezado}.${datos}`));
  return `vapid t=${encabezado}.${datos}.${aBase64Url(firma)}, k=${claves.publica}`;
}

async function hkdf(sal, ikm, info, bytes) {
  const clave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, clave, bytes * 8));
}

export async function cifrar(suscripcion, mensaje) {
  const publicaCliente = deBase64Url(suscripcion.keys.p256dh);
  const secretoAuth = deBase64Url(suscripcion.keys.auth);

  const parServidor = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicaServidor = new Uint8Array(await crypto.subtle.exportKey('raw', parServidor.publicKey));
  const claveCliente = await crypto.subtle.importKey('raw', publicaCliente, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secretoEcdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: claveCliente }, parServidor.privateKey, 256));

  const ikm = await hkdf(secretoAuth, secretoEcdh, unir(texto.encode('WebPush: info\0'), publicaCliente, publicaServidor), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, texto.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, texto.encode('Content-Encoding: nonce\0'), 12);

  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marca el último (y único) bloque.
  const plano = unir(texto.encode(mensaje), new Uint8Array([2]));
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, plano));

  const tamanoBloque = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return unir(sal, tamanoBloque, new Uint8Array([publicaServidor.length]), publicaServidor, cifrado);
}

// Devuelve el código HTTP del servicio push (201 = enviado).
export async function enviarPush(kv, contacto, suscripcion, contenido) {
  const claves = await claveVapid(kv);
  const respuesta = await fetch(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await firmaVapid(claves, suscripcion.endpoint, contacto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '43200',
      Urgency: 'high',
    },
    body: await cifrar(suscripcion, JSON.stringify(contenido)),
  });
  return respuesta.status;
}
