import { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { leerSesion, guardarSesion, borrarSesion, pedir, cargarServidor } from "./src/api";
import { crearCanales } from "./src/notificaciones";
import PantallaAcceso from "./src/PantallaAcceso";
import PantallaPrincipal from "./src/PantallaPrincipal";
import { colores, archivosFuentes } from "./src/tema";

export default function App() {
  const [sesion, setSesion] = useState(undefined); // undefined = cargando, null = sin sesión
  // Si las letras no cargan, la app sigue con las del sistema
  const [fuentesListas, errorFuentes] = useFonts(archivosFuentes);
  const cargando = sesion === undefined || (!fuentesListas && !errorFuentes);

  useEffect(() => {
    // Los canales se crean apenas abre la app: así una alerta que llega con la
    // app cerrada ya suena con la sirena y el volumen de alarma.
    crearCanales().catch(() => {});
    cargarServidor().then(leerSesion).then(setSesion);
  }, []);

  async function ingresar(nueva) {
    await guardarSesion(nueva);
    setSesion(nueva);
  }

  // tokenPush: si se pasa, se da de baja ese celular en el servidor antes de salir
  async function salir(tokenPush) {
    if (tokenPush && sesion) {
      try {
        await pedir("/app/dispositivo/baja", { metodo: "POST", token: sesion.token, cuerpo: { token: tokenPush } });
      } catch (e) {
        // si falla, el servidor lo descarta igual cuando el usuario deje de estar aprobado
      }
    }
    await borrarSesion();
    setSesion(null);
  }

  return (
    <View style={estilos.fondo}>
      <StatusBar style="light" />
      {cargando ? (
        <View style={estilos.centro}><ActivityIndicator color={colores.texto} /></View>
      ) : sesion ? (
        <PantallaPrincipal sesion={sesion} alSalir={salir} />
      ) : (
        <PantallaAcceso alIngresar={ingresar} />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  centro: { flex: 1, alignItems: "center", justifyContent: "center" },
});
