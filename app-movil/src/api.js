import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

// Versión de prueba (perfil "pruebas"): habla con el servidor local y deja cambiar la dirección
export const MODO_PRUEBA = Boolean(Constants.expoConfig.extra.modoPrueba);

let apiUrl = Constants.expoConfig.extra.apiUrl;

const CLAVE_SESION = "sesion";
const CLAVE_SERVIDOR = "servidor";

export function servidorActual() {
  return apiUrl;
}

// Solo en modo prueba: recupera la dirección del servidor que se eligió la última vez
export async function cargarServidor() {
  if (!MODO_PRUEBA) return;
  try {
    const guardado = await SecureStore.getItemAsync(CLAVE_SERVIDOR);
    if (guardado) apiUrl = guardado;
  } catch (e) {
    // se usa la dirección de fábrica
  }
}

export async function cambiarServidor(url) {
  if (!MODO_PRUEBA) return;
  apiUrl = url.trim().replace(/\/+$/, "");
  await SecureStore.setItemAsync(CLAVE_SERVIDOR, apiUrl);
}

// La sesión (token + datos del usuario) se guarda cifrada en el celular
export async function leerSesion() {
  try {
    const guardada = await SecureStore.getItemAsync(CLAVE_SESION);
    return guardada ? JSON.parse(guardada) : null;
  } catch (e) {
    return null;
  }
}

export async function guardarSesion(sesion) {
  await SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
}

export async function borrarSesion() {
  await SecureStore.deleteItemAsync(CLAVE_SESION);
  await SecureStore.deleteItemAsync(CLAVE_TOKEN_PUSH).catch(() => {});
}

// Último token de notificaciones que se registró bien en el servidor.
// Si Google Play no contesta al abrir la app, se vuelve a usar este (sigue siendo válido).
const CLAVE_TOKEN_PUSH = "tokenPush";

export async function leerTokenPush() {
  try {
    return await SecureStore.getItemAsync(CLAVE_TOKEN_PUSH);
  } catch (e) {
    return null;
  }
}

export async function guardarTokenPush(token) {
  await SecureStore.setItemAsync(CLAVE_TOKEN_PUSH, token).catch(() => {});
}

export class SesionVencida extends Error {}

const LIMITE_MS = 10000; // si el servidor no contesta en este tiempo, se avisa en vez de quedar colgado

// Llama al servidor. Tira SesionVencida si el token ya no sirve, o Error con el mensaje del servidor.
export async function pedir(ruta, { metodo = "GET", cuerpo, token } = {}) {
  const corte = new AbortController();
  const temporizador = setTimeout(() => corte.abort(), LIMITE_MS);
  let res;
  try {
    res = await fetch(`${apiUrl}${ruta}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: corte.signal,
    });
  } catch (e) {
    throw new Error(corte.signal.aborted ? "El servidor no respondió a tiempo" : "Sin conexión con el servidor");
  } finally {
    clearTimeout(temporizador);
  }

  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    // respuesta sin JSON
  }

  if (res.status === 401 && token) throw new SesionVencida(data.message);
  if (!res.ok || data.success === false) {
    throw new Error(data.message || "Error del servidor");
  }
  return data;
}
