import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

export const API_URL = Constants.expoConfig.extra.apiUrl;

const CLAVE_SESION = "sesion";

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
}

export class SesionVencida extends Error {}

// Llama al servidor. Tira SesionVencida si el token ya no sirve, o Error con el mensaje del servidor.
export async function pedir(ruta, { metodo = "GET", cuerpo, token } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    throw new Error("Sin conexión con el servidor");
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
