// Botones ASISTO / NO ASISTO en la notificación de alerta.
// Funcionan con el celular bloqueado y sin abrir la app: Android corre esta tarea
// en segundo plano, que manda la respuesta al servidor y avisa si quedó registrada.
import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import { pedir, leerSesion, cargarServidor } from "./api";
import { CANAL_ACTUALIZACIONES } from "./notificaciones";

export const TAREA_NOTIFICACIONES = "tarea-notificaciones";
const ACCIONES = { asisto: "ASISTO", no_asisto: "NO ASISTO" };

// Los datos de la notificación pueden llegar como objeto o como texto JSON
function datosDe(respuesta) {
  const contenido = respuesta?.notification?.request?.content || {};
  if (contenido.data && Object.keys(contenido.data).length) return contenido.data;
  try {
    return contenido.dataString ? JSON.parse(contenido.dataString) : {};
  } catch (e) {
    return {};
  }
}

// Aviso silencioso con el resultado (por el canal de actualizaciones, no el de la sirena)
async function avisar(title, body) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: { confirmacion: true } },
    trigger: { channelId: CANAL_ACTUALIZACIONES },
  });
}

export function esBotonDeRespuesta(respuesta) {
  return Boolean(respuesta && ACCIONES[respuesta.actionIdentifier]);
}

// Manda la respuesta elegida en la notificación. Devuelve true si quedó registrada.
export async function procesarBoton(respuesta) {
  if (!esBotonDeRespuesta(respuesta)) return false;
  const accion = respuesta.actionIdentifier;
  const datos = datosDe(respuesta);

  // Se saca la notificación (y con ella la sirena)
  const id = respuesta.notification?.request?.identifier;
  if (id) await Notifications.dismissNotificationAsync(id).catch(() => {});

  if (datos.prueba) {
    await avisar("✓ Los botones funcionan", `Elegiste ${ACCIONES[accion]}. Era una prueba: no se envió nada.`);
    return true;
  }

  try {
    if (!datos.alertaId) throw new Error("La notificación no trae la alerta");
    await cargarServidor();
    const sesion = await leerSesion();
    if (!sesion) throw new Error("No hay sesión iniciada");
    await pedir("/app/responder", {
      metodo: "POST",
      token: sesion.token,
      cuerpo: { alertaId: datos.alertaId, respuesta: accion },
    });
    await avisar(`✓ Respuesta registrada: ${ACCIONES[accion]}`, "Si querés cambiarla, abrí la app.");
    return true;
  } catch (e) {
    await avisar("⚠ No se registró tu respuesta", `${e.message}. Abrí la app para responder.`);
    return false;
  }
}

// Tiene que definirse apenas carga el código de la app (se importa desde index.js),
// porque Android la ejecuta aunque la app esté cerrada.
TaskManager.defineTask(TAREA_NOTIFICACIONES, async ({ data }) => {
  if (data && "actionIdentifier" in data) {
    await procesarBoton(data);
  }
  return Notifications.BackgroundNotificationTaskResult.NoData;
});

Notifications.registerTaskAsync(TAREA_NOTIFICACIONES).catch(() => {});
