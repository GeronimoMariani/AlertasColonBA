import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Image, Pressable, ScrollView, RefreshControl, StyleSheet,
  Alert, AppState, Linking, Platform, AccessibilityInfo,
} from "react-native";
import { Lucide } from "@react-native-vector-icons/lucide/static";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { io } from "socket.io-client";
import { pedir, SesionVencida, MODO_PRUEBA, servidorActual } from "./api";
import {
  obtenerTokenPush, probarSonido, abrirAjustesNotificaciones, pedirSinAhorroBateria,
} from "./notificaciones";
import { esBotonDeRespuesta, procesarBoton } from "./botonesNotificacion";
import { colores, fuentes } from "./tema";
import { Marca, Chip } from "./componentes";

const REFRESCO_MS = 15000; // con una alerta activa y la app abierta

export default function PantallaPrincipal({ sesion, alSalir }) {
  const [estado, setEstado] = useState(null); // { alerta, asistencia, miRespuesta }
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(null);
  const [push, setPush] = useState({ listo: false, error: null });
  const [enVivo, setEnVivo] = useState(false);
  const tokenPush = useRef(null);

  const manejarError = useCallback((e) => {
    if (e instanceof SesionVencida) {
      Alert.alert("Sesión vencida", e.message || "Volvé a iniciar sesión.");
      alSalir(null);
      return;
    }
    Alert.alert("Error", e.message);
  }, [alSalir]);

  const actualizar = useCallback(async () => {
    try {
      const data = await pedir("/app/estado", { token: sesion.token });
      setEstado(data);
    } catch (e) {
      if (e instanceof SesionVencida) manejarError(e);
      // otros errores (sin señal, etc.): se reintenta en el próximo refresco
    }
  }, [sesion.token, manejarError]);

  // Avisa al servidor qué token tiene este celular
  const enviarToken = useCallback(async (token, plataforma) => {
    try {
      await pedir("/app/dispositivo", {
        metodo: "POST",
        token: sesion.token,
        cuerpo: { token, plataforma },
      });
      tokenPush.current = token;
      setPush({ listo: true, error: null });
    } catch (e) {
      if (e instanceof SesionVencida) return manejarError(e);
      setPush({ listo: false, error: "No se pudo registrar el celular en el servidor" });
    }
  }, [sesion.token, manejarError]);

  // Expo no permite dos pedidos de token al mismo tiempo: el segundo falla.
  // Por eso se evita pedirlo de nuevo mientras hay uno en curso.
  const pidiendoToken = useRef(false);
  const registrarCelular = useCallback(async () => {
    if (pidiendoToken.current) return;
    pidiendoToken.current = true;
    try {
      const r = await obtenerTokenPush();
      if (r.error) {
        setPush({ listo: false, error: r.error, detalle: r.detalle });
        return;
      }
      await enviarToken(r.token, r.plataforma);
    } finally {
      pidiendoToken.current = false;
    }
  }, [enviarToken]);

  // Al abrir: registrar el celular y traer el estado
  useEffect(() => {
    registrarCelular();
    actualizar();

    // Si Android/iOS entrega un token nuevo, se registra ese mismo (sin volver a pedirlo)
    const subToken = Notifications.addPushTokenListener(({ data }) => {
      if (data && data !== tokenPush.current) enviarToken(data, Platform.OS);
    });
    // Llega una alerta con la app abierta, o se toca una notificación
    const subRecibida = Notifications.addNotificationReceivedListener(() => actualizar());
    const subRespuesta = Notifications.addNotificationResponseReceivedListener(async (respuesta) => {
      // Botón Asisto / No asisto con la app abierta. Con la app en segundo plano
      // lo resuelve la tarea de botonesNotificacion.js, así no se manda dos veces.
      if (esBotonDeRespuesta(respuesta)) {
        if (AppState.currentState !== "active") return;
        await procesarBoton(respuesta);
      }
      actualizar();
    });
    // Vuelve a primer plano
    const subApp = AppState.addEventListener("change", (s) => {
      if (s === "active") actualizar();
    });

    return () => {
      subToken.remove();
      subRecibida.remove();
      subRespuesta.remove();
      subApp.remove();
    };
  }, [registrarCelular, enviarToken, actualizar]);

  // Conexión en vivo con el servidor (la misma que usa el visor): la alerta y la
  // lista de asistencia se actualizan al instante, aunque no llegue la notificación.
  useEffect(() => {
    const socket = io(servidorActual(), {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    // Al (re)conectar se pide el estado completo, por si algo pasó mientras estaba desconectado
    socket.on("connect", () => {
      setEnVivo(true);
      actualizar();
    });
    socket.on("disconnect", () => setEnVivo(false));
    socket.on("alert", actualizar);
    socket.on("alertActualizada", actualizar);
    socket.on("clearAlert", () => {
      setEstado((prev) => ({ ...prev, alerta: null, asistencia: null, miRespuesta: null }));
    });
    socket.on("asistencia", (asistencia) => {
      setEstado((prev) => (prev && prev.alerta && prev.alerta.id === asistencia.alertaId
        ? { ...prev, asistencia }
        : prev));
    });

    return () => socket.disconnect();
  }, [actualizar]);

  // Respaldo: mientras hay alerta activa, se refresca igual cada tanto
  const hayAlerta = Boolean(estado && estado.alerta);
  useEffect(() => {
    if (!hayAlerta) return;
    const intervalo = setInterval(actualizar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [hayAlerta, actualizar]);

  async function refrescar() {
    setCargando(true);
    await actualizar();
    setCargando(false);
  }

  async function responder(respuesta) {
    if (!estado || !estado.alerta || enviando) return;
    const anterior = estado.miRespuesta;
    // El botón se marca al instante; si el servidor no lo confirma, vuelve atrás y avisa
    setEstado((prev) => ({ ...prev, miRespuesta: respuesta }));
    setEnviando(respuesta);
    try {
      const data = await pedir("/app/responder", {
        metodo: "POST",
        token: sesion.token,
        cuerpo: { alertaId: estado.alerta.id, respuesta },
      });
      setEstado((prev) => ({ ...prev, miRespuesta: data.miRespuesta, asistencia: data.asistencia }));
    } catch (e) {
      setEstado((prev) => ({ ...prev, miRespuesta: anterior }));
      if (e instanceof SesionVencida) {
        manejarError(e);
      } else {
        Alert.alert("No se registró tu respuesta", `${e.message}. Probá de nuevo.`);
        actualizar();
      }
    } finally {
      setEnviando(null);
    }
  }

  async function probar() {
    await probarSonido(5);
    Alert.alert(
      "Prueba en 5 segundos",
      "Bloqueá el celular o ponelo en silencio: la sirena tiene que sonar igual.\n\n" +
        "En la notificación vas a ver los botones ASISTO / NO ASISTO: probalos sin desbloquear.\n\n" +
        "Suena con el volumen de ALARMA (el del despertador): si no la escuchás, subí ese volumen."
    );
  }

  function cerrarSesion() {
    Alert.alert("Cerrar sesión", "Si cerrás sesión, este celular deja de recibir alertas.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => alSalir(tokenPush.current) },
    ]);
  }

  const alerta = estado && estado.alerta;
  const asistencia = estado && estado.asistencia;
  const mia = estado && estado.miRespuesta;
  const telefono = alerta && /\d{6,}/.test(alerta.contacto || "")
    ? alerta.contacto.replace(/[^\d+]/g, "")
    : null;

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} tintColor={colores.texto} />}
    >
      <View style={estilos.encabezado}>
        <Marca titulo="Alertas Colón" subtitulo={`${sesion.nombre} ${sesion.apellido}`} />
        <Pressable
          onPress={cerrarSesion}
          hitSlop={8}
          accessibilityLabel="Cerrar sesión"
          style={({ pressed }) => [estilos.botonIcono, pressed && { opacity: 0.6 }]}
        >
          <Lucide name="log-out" size={18} color={colores.apagado} />
        </Pressable>
      </View>

      <View style={estilos.chips}>
        <Chip texto={enVivo ? "En vivo" : "Conectando…"} tono={enVivo ? "ok" : "aviso"} />
        <Chip
          texto={push.listo ? "Recibe alertas" : push.error ? "No recibe alertas" : "Registrando…"}
          tono={push.listo ? "ok" : push.error ? "error" : "neutro"}
        />
      </View>

      {MODO_PRUEBA && (
        <View style={estilos.prueba}>
          <Text style={estilos.pruebaTexto}>🧪 VERSIÓN DE PRUEBA · {servidorActual()}</Text>
        </View>
      )}

      <ErrorPush push={push} reintentar={registrarCelular} />

      {alerta ? (
        <View style={estilos.alerta}>
          <BandaAlerta hora={alerta.timestamp} />
          <View style={estilos.alertaCuerpo}>
            <Text style={estilos.tipo}>{alerta.tipo}</Text>

            <Text style={[estilos.etiqueta, { color: colores.rojo, marginTop: 14 }]}>Dirección</Text>
            <Text style={estilos.direccion}>{alerta.direccion}</Text>

            {alerta.descripcion ? <Text style={estilos.descripcion}>{alerta.descripcion}</Text> : null}

            <View style={estilos.acciones}>
              <BotonAccion icono="map-pin" texto="Mapa" alTocar={() => abrirMapa(alerta.direccion)} />
              {telefono ? (
                <BotonAccion icono="phone" texto="Llamar" alTocar={() => Linking.openURL(`tel:${telefono}`)} />
              ) : null}
            </View>

            <View style={estilos.datos}>
              <Dato etiqueta="Despachado por" valor={alerta.despachadoPor} />
              <View style={estilos.datosSeparador} />
              <Dato etiqueta="Contacto" valor={alerta.contacto || "—"} mono />
            </View>
          </View>

          <View style={estilos.botones}>
            <BotonRespuesta
              texto="Asisto"
              icono="check"
              color={colores.verde}
              colorTextoElegido="#06130d"
              elegido={mia === "asisto"}
              apagado={mia === "no_asisto"}
              cargando={enviando === "asisto"}
              alTocar={() => responder("asisto")}
            />
            <BotonRespuesta
              texto="No asisto"
              icono="x"
              color={colores.rojo}
              colorTexto={colores.rojoClaro}
              colorTextoElegido="#fff"
              elegido={mia === "no_asisto"}
              apagado={mia === "asisto"}
              cargando={enviando === "no_asisto"}
              alTocar={() => responder("no_asisto")}
            />
          </View>
          {mia ? <Text style={estilos.aviso}>Tu respuesta quedó registrada. Podés cambiarla.</Text> : null}

          {asistencia ? <Asistencia asistencia={asistencia} /> : null}
        </View>
      ) : (
        <View style={estilos.sinAlerta}>
          <Image source={require("../assets/logo.png")} style={estilos.sinAlertaLogo} />
          <Text style={estilos.sinAlertaTitulo}>Sin alertas</Text>
          <Text style={estilos.sinAlertaTexto}>En espera. Cuando haya una salida, el celular va a sonar.</Text>
        </View>
      )}

      <Text style={estilos.seccion}>Preparar el celular</Text>
      <View style={estilos.lista}>
        <Opcion
          icono="volume-2"
          tono={colores.rojoClaro}
          fondoIcono="rgba(216,38,30,0.12)"
          titulo="Probar la sirena"
          detalle="Suena en 5 segundos, igual que una alerta real."
          alTocar={probar}
        />
        {Platform.OS === "android" && (
          <>
            <Opcion
              icono="battery-low"
              tono={colores.ambar}
              fondoIcono="rgba(242,169,0,0.1)"
              titulo="Quitar ahorro de batería"
              detalle="Aparece un cartel del sistema: tocá «Permitir»."
              alTocar={() => pedirSinAhorroBateria().catch(() => Linking.openSettings())}
            />
            <Opcion
              icono="bell"
              tono={colores.acero}
              fondoIcono="rgba(111,156,196,0.12)"
              titulo="Revisar notificaciones"
              detalle="Que «Alertas de salida» esté activada. Si tu celular muestra «Ignorar No molestar» o «Anular No molestar», activalo."
              alTocar={() => abrirAjustesNotificaciones().catch(() => Linking.openSettings())}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function abrirMapa(direccion) {
  const consulta = encodeURIComponent(`${direccion}, Colón, Buenos Aires, Argentina`);
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${consulta}`);
}

// Franja roja que titila, como en el visor del cuartel (quieta si el celular pide menos movimiento)
function BandaAlerta({ hora }) {
  const [encendida, setEncendida] = useState(true);
  useEffect(() => {
    let intervalo = null;
    let activo = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reducir) => {
      if (!activo || reducir) return;
      intervalo = setInterval(() => setEncendida((v) => !v), 550);
    }).catch(() => {});
    return () => {
      activo = false;
      if (intervalo) clearInterval(intervalo);
    };
  }, []);

  return (
    <View style={[estilos.banda, { backgroundColor: encendida ? colores.rojo : colores.rojoProfundo }]}>
      <Text style={estilos.bandaTexto}>● Alerta activa</Text>
      <Text style={estilos.bandaHora} numberOfLines={1}>{hora}</Text>
    </View>
  );
}

// El estado corto va en la etiqueta de arriba; si hay un error se muestra el detalle para reintentar
function ErrorPush({ push, reintentar }) {
  if (push.listo || !push.error) return null;
  return (
    <Pressable onPress={reintentar} style={estilos.errorPush}>
      <View style={estilos.errorPushFila}>
        <Lucide name="triangle-alert" size={16} color={colores.rojoClaro} />
        <Text style={estilos.errorPushTexto}>{push.error}</Text>
      </View>
      <Text style={estilos.errorPushDetalle}>Tocá para reintentar. Si sigue, revisá los permisos de notificaciones.</Text>
      {push.detalle ? (
        <Text style={estilos.errorPushTecnico} selectable>
          {push.detalle}{"\n"}{Device.manufacturer} {Device.modelName} · Android {Device.osVersion}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BotonAccion({ icono, texto, alTocar }) {
  return (
    <Pressable onPress={alTocar} style={({ pressed }) => [estilos.botonAccion, pressed && { opacity: 0.7 }]}>
      <Lucide name={icono} size={16} color={colores.acero} />
      <Text style={estilos.botonAccionTexto}>{texto}</Text>
    </Pressable>
  );
}

function Dato({ etiqueta, valor, mono }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Text style={[estilos.datoValor, mono && estilos.datoValorMono]}>{valor}</Text>
    </View>
  );
}

function BotonRespuesta({ texto, icono, color, colorTexto, colorTextoElegido, elegido, apagado, cargando, alTocar }) {
  const colorActual = elegido ? colorTextoElegido : colorTexto || color;
  return (
    <Pressable
      onPress={alTocar}
      disabled={cargando}
      style={({ pressed }) => [
        estilos.botonRespuesta,
        { borderColor: color, backgroundColor: elegido ? color : "transparent" },
        apagado && { opacity: 0.4 },
        pressed && { opacity: 0.7 },
      ]}
    >
      {cargando
        ? <Text style={[estilos.botonRespuestaTexto, { color: colorActual }]}>…</Text>
        : (
          <>
            <Lucide name={icono} size={28} color={colorActual} />
            <Text style={[estilos.botonRespuestaTexto, { color: colorActual }]}>{texto}</Text>
          </>
        )}
    </Pressable>
  );
}

function iniciales(nombre) {
  return String(nombre || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function Asistencia({ asistencia }) {
  return (
    <View style={estilos.asistencia}>
      <View style={estilos.asistenciaEncabezado}>
        <Text style={estilos.etiqueta}>Asisten</Text>
        <Text style={estilos.asistenciaNumero}>{asistencia.asisten.length}</Text>
      </View>
      {asistencia.asisten.length === 0
        ? <Text style={estilos.vacio}>Todavía nadie confirmó.</Text>
        : asistencia.asisten.map((r, i) => (
          <View key={i} style={estilos.asistenciaFila}>
            <View style={estilos.avatar}><Text style={estilos.avatarTexto}>{iniciales(r.nombre)}</Text></View>
            <Text style={estilos.asistenciaNombre}>{r.nombre}</Text>
            <Text style={estilos.asistenciaHora}>{r.hora}</Text>
          </View>
        ))}
      {asistencia.noAsisten.length > 0 && (
        <Text style={estilos.noAsisten}>No asisten: {asistencia.noAsisten.length}</Text>
      )}
    </View>
  );
}

function Opcion({ icono, tono, fondoIcono, titulo, detalle, alTocar }) {
  return (
    <Pressable onPress={alTocar} style={({ pressed }) => [estilos.opcion, pressed && { opacity: 0.7 }]}>
      <View style={[estilos.opcionIcono, { backgroundColor: fondoIcono }]}>
        <Lucide name={icono} size={18} color={tono} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={estilos.opcionTitulo}>{titulo}</Text>
        <Text style={estilos.opcionDetalle}>{detalle}</Text>
      </View>
      <Lucide name="chevron-right" size={18} color={colores.tenue} />
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingTop: 52, paddingBottom: 40 },

  encabezado: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  botonIcono: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colores.bordeFuerte,
    backgroundColor: colores.panel, alignItems: "center", justifyContent: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },

  prueba: { backgroundColor: colores.ambar, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12 },
  pruebaTexto: { color: "#1a1200", fontFamily: fuentes.monoFuerte, fontSize: 11, letterSpacing: 0.5 },

  errorPush: {
    borderWidth: 1, borderColor: colores.rojo, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14, backgroundColor: colores.panel,
  },
  errorPushFila: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorPushTexto: { color: colores.rojoClaro, fontFamily: fuentes.textoMedio, flex: 1 },
  errorPushDetalle: { color: colores.apagado, fontFamily: fuentes.texto, fontSize: 13, marginTop: 4 },
  errorPushTecnico: { color: colores.tenue, fontSize: 12, marginTop: 8, fontFamily: fuentes.mono },

  alerta: { borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: colores.rojo, backgroundColor: colores.panel },
  banda: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12,
    paddingVertical: 9, paddingHorizontal: 14,
  },
  bandaTexto: { color: "#fff", fontFamily: fuentes.titulo, fontSize: 14, letterSpacing: 3, textTransform: "uppercase" },
  bandaHora: { color: "#fff", fontFamily: fuentes.monoFuerte, fontSize: 12, flexShrink: 1 },
  alertaCuerpo: { padding: 16 },
  tipo: {
    color: "#fff", fontFamily: fuentes.tituloFuerte, fontSize: 48, lineHeight: 48,
    textTransform: "uppercase",
    textShadowColor: "rgba(216,38,30,0.5)", textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 },
  },
  etiqueta: {
    color: colores.tenue, fontFamily: fuentes.monoFuerte, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase",
  },
  direccion: {
    color: colores.texto, fontFamily: fuentes.titulo, fontSize: 27, lineHeight: 30,
    textTransform: "uppercase", marginTop: 4,
  },
  descripcion: { color: "#d7cfcb", fontFamily: fuentes.texto, fontSize: 16, lineHeight: 23, marginTop: 10 },
  acciones: { flexDirection: "row", gap: 8, marginTop: 14 },
  botonAccion: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    paddingVertical: 11, borderRadius: 10, borderWidth: 1,
    borderColor: "rgba(111,156,196,0.4)", backgroundColor: "rgba(111,156,196,0.1)",
  },
  botonAccionTexto: { color: colores.acero, fontFamily: fuentes.textoMedio, fontSize: 15 },
  datos: {
    flexDirection: "row", marginTop: 12, borderRadius: 10, overflow: "hidden",
    borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.elevado,
  },
  datosSeparador: { width: 1, backgroundColor: colores.borde },
  dato: { flex: 1, padding: 12 },
  datoValor: {
    color: colores.texto, fontFamily: fuentes.titulo, fontSize: 18, textTransform: "uppercase", marginTop: 5,
  },
  datoValorMono: { fontFamily: fuentes.mono, fontSize: 14, textTransform: "none", marginTop: 7 },

  botones: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  botonRespuesta: {
    flex: 1, borderWidth: 2, borderRadius: 14, paddingVertical: 16, gap: 6,
    alignItems: "center", justifyContent: "center",
  },
  botonRespuestaTexto: { fontFamily: fuentes.tituloFuerte, fontSize: 22, letterSpacing: 2, textTransform: "uppercase" },
  aviso: { color: colores.apagado, fontFamily: fuentes.texto, textAlign: "center", fontSize: 13, marginTop: 10, paddingHorizontal: 16 },

  asistencia: { margin: 16, backgroundColor: colores.elevado, borderRadius: 12, padding: 14 },
  asistenciaEncabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8 },
  asistenciaNumero: { color: colores.verde, fontFamily: fuentes.tituloFuerte, fontSize: 34, lineHeight: 36 },
  asistenciaFila: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: colores.borde,
  },
  avatar: {
    width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(63,179,127,0.14)",
  },
  avatarTexto: { color: colores.verde, fontFamily: fuentes.monoFuerte, fontSize: 11 },
  asistenciaNombre: { color: colores.texto, fontFamily: fuentes.textoMedio, fontSize: 16, flex: 1 },
  asistenciaHora: { color: colores.apagado, fontFamily: fuentes.mono, fontSize: 13 },
  vacio: { color: colores.tenue, fontFamily: fuentes.texto, paddingVertical: 6 },
  noAsisten: {
    color: colores.apagado, fontFamily: fuentes.monoFuerte, marginTop: 8, fontSize: 11,
    textTransform: "uppercase", letterSpacing: 1,
  },

  sinAlerta: {
    alignItems: "center", paddingTop: 32, paddingBottom: 28, paddingHorizontal: 20,
    borderRadius: 16, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.panel,
  },
  sinAlertaLogo: { width: 110, height: 110, marginBottom: 18, opacity: 0.9 },
  sinAlertaTitulo: {
    color: "#cfc7c3", fontFamily: fuentes.titulo, fontSize: 24, letterSpacing: 5, textTransform: "uppercase",
  },
  sinAlertaTexto: { color: colores.tenue, fontFamily: fuentes.texto, textAlign: "center", marginTop: 6 },

  seccion: {
    color: colores.apagado, fontFamily: fuentes.monoFuerte, fontSize: 11, letterSpacing: 1.8,
    textTransform: "uppercase", marginTop: 26, marginBottom: 10, marginLeft: 2,
  },
  lista: {
    backgroundColor: colores.panel, borderWidth: 1, borderColor: colores.borde,
    borderRadius: 14, overflow: "hidden",
  },
  opcion: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14,
    borderBottomWidth: 1, borderBottomColor: colores.borde,
    marginBottom: -1, // la línea de la última opción queda tapada por el borde de la lista
  },
  opcionIcono: { width: 36, height: 36, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  opcionTitulo: { color: colores.texto, fontFamily: fuentes.textoMedio, fontSize: 16 },
  opcionDetalle: { color: colores.apagado, fontFamily: fuentes.texto, fontSize: 13, marginTop: 2 },
});
