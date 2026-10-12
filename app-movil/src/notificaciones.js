import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as IntentLauncher from "expo-intent-launcher";
import Constants from "expo-constants";

// Tienen que coincidir con los que usa el servidor (server.js → PUSH_CANAL_*).
// Android no deja cambiar el sonido de un canal ya creado: si hay que cambiarlo,
// se crea uno nuevo con otro nombre (alertas_v2) y se actualiza el servidor.
export const CANAL_ALERTAS = "alertas_v1";
export const CANAL_ACTUALIZACIONES = "actualizaciones_v1";
// Categoría con los botones de la notificación (server.js → PUSH_CATEGORIA)
export const CATEGORIA_ALERTA = "alerta";

const PAQUETE_ANDROID = Constants.expoConfig.android?.package;

// Con la app abierta, la notificación también se muestra y suena
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Se llama al abrir la app, antes de pedir permisos (Android 13 lo exige así)
export async function crearCanales() {
  // Botones de la notificación de alerta. No abren la app: la respuesta se manda
  // en segundo plano (ver botonesNotificacion.js).
  await Notifications.setNotificationCategoryAsync(CATEGORIA_ALERTA, [
    { identifier: "asisto", buttonTitle: "✅ ASISTO", options: { opensAppToForeground: false } },
    { identifier: "no_asisto", buttonTitle: "❌ NO ASISTO", options: { opensAppToForeground: false, isDestructive: true } },
  ]);

  if (Platform.OS !== "android") return;

  // Canal de alertas: usa el volumen de ALARMA, así suena aunque el
  // celular esté en silencio o vibración, y pasa el "No molestar" que permite alarmas.
  await Notifications.setNotificationChannelAsync(CANAL_ALERTAS, {
    name: "Alertas de salida",
    description: "Suena aunque el celular esté en silencio",
    importance: Notifications.AndroidImportance.MAX,
    sound: "sirena.mp3",
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
    vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
    enableVibrate: true,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    lightColor: "#d8261e",
    enableLights: true,
  });

  await Notifications.setNotificationChannelAsync(CANAL_ACTUALIZACIONES, {
    name: "Cambios en una alerta",
    description: "Corrección de dirección o datos de una alerta activa",
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// Pide permiso y devuelve el token de push del celular, o un texto con el problema.
export async function obtenerTokenPush() {
  if (!Device.isDevice) {
    return { error: "Las notificaciones solo funcionan en un celular real" };
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false, allowCriticalAlerts: true },
    }));
  }
  if (status !== "granted") {
    return { error: "Las notificaciones están desactivadas para esta app" };
  }

  // Google Play a veces no contesta recién abierta la app (SERVICE_NOT_AVAILABLE,
  // muy común en Xiaomi): es pasajero, así que se reintenta antes de dar error.
  let ultimoError;
  for (const espera of ESPERAS_TOKEN_MS) {
    if (espera) await new Promise((r) => setTimeout(r, espera));
    try {
      const { data } = await Notifications.getDevicePushTokenAsync();
      return { token: data, plataforma: Platform.OS };
    } catch (e) {
      ultimoError = e;
    }
  }
  // Se muestra el detalle técnico para poder diagnosticar el celular
  return {
    error: "No se pudo obtener el token de notificaciones",
    detalle: String((ultimoError && ultimoError.message) || ultimoError),
  };
}

const ESPERAS_TOKEN_MS = [0, 3000, 8000, 20000];

// Notificación local por el mismo canal que las alertas reales, para probar el sonido
export async function probarSonido(segundos = 5) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🚨 PRUEBA DE ALERTA",
      body: "Si escuchaste la sirena, el celular está listo. Probá también los botones.",
      sound: Platform.OS === "ios" ? "sirena.wav" : undefined,
      categoryIdentifier: CATEGORIA_ALERTA,
      data: { prueba: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: segundos,
      channelId: CANAL_ALERTAS,
    },
  });
}

// Pantalla de notificaciones de esta app (existe igual en todas las marcas)
export async function abrirAjustesNotificaciones() {
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS, {
    extra: { "android.provider.extra.APP_PACKAGE": PAQUETE_ANDROID },
  });
}

// Muestra el cartel del sistema "¿Permitir que la app se ejecute siempre en segundo plano?".
// Si la marca no lo soporta, abre la lista de optimización de batería.
export async function pedirSinAhorroBateria() {
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, {
      data: `package:${PAQUETE_ANDROID}`,
    });
  } catch (e) {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
  }
}
