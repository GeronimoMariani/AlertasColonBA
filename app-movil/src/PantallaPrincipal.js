import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, Pressable, ScrollView, RefreshControl, StyleSheet,
  Alert, AppState, Linking, Platform,
} from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { io } from "socket.io-client";
import { pedir, SesionVencida, MODO_PRUEBA, servidorActual } from "./api";
import {
  obtenerTokenPush, probarSonido, abrirAjustesNotificaciones, pedirSinAhorroBateria,
} from "./notificaciones";
import { colores } from "./tema";

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

  const registrarCelular = useCallback(async () => {
    const r = await obtenerTokenPush();
    if (r.error) {
      setPush({ listo: false, error: r.error, detalle: r.detalle });
      return;
    }
    try {
      await pedir("/app/dispositivo", {
        metodo: "POST",
        token: sesion.token,
        cuerpo: { token: r.token, plataforma: r.plataforma },
      });
      tokenPush.current = r.token;
      setPush({ listo: true, error: null });
    } catch (e) {
      if (e instanceof SesionVencida) return manejarError(e);
      setPush({ listo: false, error: "No se pudo registrar el celular en el servidor" });
    }
  }, [sesion.token, manejarError]);

  // Al abrir: registrar el celular y traer el estado
  useEffect(() => {
    registrarCelular();
    actualizar();

    // Si Android/iOS cambia el token, se vuelve a registrar
    const subToken = Notifications.addPushTokenListener(() => registrarCelular());
    // Llega una alerta con la app abierta, o se toca una notificación
    const subRecibida = Notifications.addNotificationReceivedListener(() => actualizar());
    const subRespuesta = Notifications.addNotificationResponseReceivedListener(() => actualizar());
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
  }, [registrarCelular, actualizar]);

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

  return (
    <ScrollView
      style={estilos.fondo}
      contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={cargando} onRefresh={refrescar} tintColor={colores.texto} />}
    >
      <View style={estilos.encabezado}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.marca}>Alertas Colón</Text>
          <Text style={estilos.usuario}>
            {sesion.nombre} {sesion.apellido} ·{" "}
            <Text style={{ color: enVivo ? colores.verde : colores.ambar }}>
              {enVivo ? "● En vivo" : "○ Conectando…"}
            </Text>
          </Text>
        </View>
        <Pressable onPress={cerrarSesion} hitSlop={10}>
          <Text style={estilos.salir}>Salir</Text>
        </Pressable>
      </View>

      {MODO_PRUEBA && (
        <View style={estilos.prueba}>
          <Text style={estilos.pruebaTexto}>🧪 VERSIÓN DE PRUEBA · {servidorActual()}</Text>
        </View>
      )}

      <EstadoPush push={push} reintentar={registrarCelular} />

      {alerta ? (
        <View style={estilos.alerta}>
          <View style={estilos.banda}>
            <Text style={estilos.bandaTexto}>● Alerta activa</Text>
            <Text style={estilos.bandaTexto}>{alerta.timestamp}</Text>
          </View>
          <View style={estilos.alertaCuerpo}>
            <Text style={estilos.tipo}>{alerta.tipo}</Text>

            <Text style={estilos.etiqueta}>Dirección</Text>
            <Pressable onPress={() => abrirMapa(alerta.direccion)}>
              <Text style={estilos.direccion}>{alerta.direccion}</Text>
              <Text style={estilos.mapa}>Ver en el mapa →</Text>
            </Pressable>

            {alerta.descripcion ? <Text style={estilos.descripcion}>{alerta.descripcion}</Text> : null}

            <View style={estilos.datos}>
              <Dato etiqueta="Despachado por" valor={alerta.despachadoPor} />
              <Dato
                etiqueta="Contacto"
                valor={alerta.contacto || "—"}
                alTocar={/\d{6,}/.test(alerta.contacto || "") ? () => Linking.openURL(`tel:${alerta.contacto.replace(/[^\d+]/g, "")}`) : null}
              />
            </View>
          </View>

          <View style={estilos.botones}>
            <BotonRespuesta
              texto="ASISTO"
              color={colores.verde}
              elegido={mia === "asisto"}
              apagado={mia === "no_asisto"}
              cargando={enviando === "asisto"}
              alTocar={() => responder("asisto")}
            />
            <BotonRespuesta
              texto="NO ASISTO"
              color={colores.rojo}
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
          <Text style={estilos.sinAlertaTitulo}>Sin alertas activas</Text>
          <Text style={estilos.sinAlertaTexto}>En espera. Cuando haya una salida, el celular va a sonar.</Text>
        </View>
      )}

      <Text style={estilos.seccion}>Preparar el celular</Text>
      <Opcion titulo="Probar la sirena" detalle="Suena en 5 segundos, igual que una alerta real." alTocar={probar} />
      {Platform.OS === "android" && (
        <>
          <Opcion
            titulo="Quitar ahorro de batería"
            detalle="Aparece un cartel del sistema: tocá «Permitir»."
            alTocar={() => pedirSinAhorroBateria().catch(() => Linking.openSettings())}
          />
          <Opcion
            titulo="Revisar notificaciones"
            detalle="Que «Alertas de salida» esté activada. Si tu celular muestra «Ignorar No molestar» o «Anular No molestar», activalo."
            alTocar={() => abrirAjustesNotificaciones().catch(() => Linking.openSettings())}
          />
        </>
      )}
    </ScrollView>
  );
}

function abrirMapa(direccion) {
  const consulta = encodeURIComponent(`${direccion}, Colón, Buenos Aires, Argentina`);
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${consulta}`);
}

function EstadoPush({ push, reintentar }) {
  if (push.listo) {
    return (
      <View style={[estilos.estadoPush, { borderColor: "rgba(63,179,127,0.4)" }]}>
        <Text style={[estilos.estadoPushTexto, { color: colores.verde }]}>● Este celular recibe alertas</Text>
      </View>
    );
  }
  if (!push.error) {
    return (
      <View style={estilos.estadoPush}>
        <Text style={estilos.estadoPushTexto}>Registrando el celular…</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={reintentar} style={[estilos.estadoPush, { borderColor: colores.rojo }]}>
      <Text style={[estilos.estadoPushTexto, { color: "#f0645d" }]}>⚠ {push.error}</Text>
      <Text style={estilos.estadoPushDetalle}>Tocá para reintentar. Si sigue, revisá los permisos de notificaciones.</Text>
      {push.detalle ? (
        <Text style={estilos.estadoPushTecnico} selectable>
          {push.detalle}{"\n"}{Device.manufacturer} {Device.modelName} · Android {Device.osVersion}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Dato({ etiqueta, valor, alTocar }) {
  const contenido = (
    <>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <Text style={[estilos.datoValor, alTocar && { color: colores.acero }]}>{valor}</Text>
    </>
  );
  return alTocar
    ? <Pressable style={estilos.dato} onPress={alTocar}>{contenido}</Pressable>
    : <View style={estilos.dato}>{contenido}</View>;
}

function BotonRespuesta({ texto, color, elegido, apagado, cargando, alTocar }) {
  return (
    <Pressable
      onPress={alTocar}
      disabled={cargando}
      style={({ pressed }) => [
        estilos.botonRespuesta,
        { borderColor: color, backgroundColor: elegido ? color : "transparent" },
        apagado && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[estilos.botonRespuestaTexto, { color: elegido ? "#fff" : color }]}>
        {cargando ? "…" : elegido ? `✓ ${texto}` : texto}
      </Text>
    </Pressable>
  );
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

function Opcion({ titulo, detalle, alTocar }) {
  return (
    <Pressable onPress={alTocar} style={({ pressed }) => [estilos.opcion, pressed && { opacity: 0.7 }]}>
      <Text style={estilos.opcionTitulo}>{titulo}</Text>
      <Text style={estilos.opcionDetalle}>{detalle}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 16, paddingTop: 56, paddingBottom: 40 },

  encabezado: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  marca: { color: colores.texto, fontSize: 22, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  usuario: { color: colores.apagado, fontSize: 14, marginTop: 2 },
  salir: { color: colores.apagado, fontSize: 15 },

  prueba: { backgroundColor: colores.ambar, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 12 },
  pruebaTexto: { color: "#1a1200", fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },

  estadoPush: {
    borderWidth: 1, borderColor: colores.borde, borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16, backgroundColor: colores.panel,
  },
  estadoPushTexto: { color: colores.apagado, fontWeight: "600" },
  estadoPushDetalle: { color: colores.apagado, fontSize: 13, marginTop: 4 },
  estadoPushTecnico: { color: colores.tenue, fontSize: 12, marginTop: 8, fontFamily: "monospace" },

  alerta: { borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colores.rojo, backgroundColor: colores.panel },
  banda: {
    flexDirection: "row", justifyContent: "space-between", backgroundColor: colores.rojo,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  bandaTexto: { color: "#fff", fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", fontSize: 12 },
  alertaCuerpo: { padding: 16 },
  tipo: { color: "#fff", fontSize: 38, fontWeight: "900", textTransform: "uppercase", marginBottom: 14 },
  etiqueta: {
    color: colores.tenue, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase",
  },
  direccion: { color: colores.texto, fontSize: 24, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  mapa: { color: colores.acero, marginTop: 6, fontWeight: "600" },
  descripcion: { color: "#d7cfcb", fontSize: 17, lineHeight: 24, marginTop: 14 },
  datos: { flexDirection: "row", gap: 10, marginTop: 16 },
  dato: { flex: 1, backgroundColor: colores.elevado, borderRadius: 10, padding: 12 },
  datoValor: { color: colores.texto, fontSize: 16, fontWeight: "700", marginTop: 4 },

  botones: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  botonRespuesta: {
    flex: 1, borderWidth: 2, borderRadius: 12, paddingVertical: 22, alignItems: "center", justifyContent: "center",
  },
  botonRespuestaTexto: { fontSize: 20, fontWeight: "900", letterSpacing: 1 },
  aviso: { color: colores.apagado, textAlign: "center", fontSize: 13, marginTop: 10, paddingHorizontal: 16 },

  asistencia: { margin: 16, backgroundColor: colores.elevado, borderRadius: 10, padding: 14 },
  asistenciaEncabezado: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  asistenciaNumero: { color: colores.verde, fontSize: 30, fontWeight: "900" },
  asistenciaFila: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 7,
    borderTopWidth: 1, borderTopColor: colores.borde,
  },
  asistenciaNombre: { color: colores.texto, fontSize: 16, fontWeight: "600", flex: 1 },
  asistenciaHora: { color: colores.apagado, fontVariant: ["tabular-nums"] },
  vacio: { color: colores.tenue, paddingVertical: 6 },
  noAsisten: { color: colores.apagado, marginTop: 8, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 },

  sinAlerta: {
    alignItems: "center", paddingVertical: 48, paddingHorizontal: 20,
    borderRadius: 14, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.panel,
  },
  sinAlertaTitulo: { color: "#cfc7c3", fontSize: 22, fontWeight: "800", letterSpacing: 3, textTransform: "uppercase" },
  sinAlertaTexto: { color: colores.tenue, textAlign: "center", marginTop: 8 },

  seccion: {
    color: colores.apagado, fontSize: 12, fontWeight: "700", letterSpacing: 1.5,
    textTransform: "uppercase", marginTop: 28, marginBottom: 10,
  },
  opcion: {
    backgroundColor: colores.panel, borderWidth: 1, borderColor: colores.borde,
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  opcionTitulo: { color: colores.texto, fontSize: 16, fontWeight: "700" },
  opcionDetalle: { color: colores.apagado, fontSize: 13, marginTop: 3 },
});
