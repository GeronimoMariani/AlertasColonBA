import { useState } from "react";
import {
  View, Text, TextInput, Pressable, Image, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, Alert, ActivityIndicator,
} from "react-native";
import { pedir, MODO_PRUEBA, servidorActual, cambiarServidor } from "./api";
import { colores } from "./tema";

function Campo({ etiqueta, ...props }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.etiqueta}>{etiqueta}</Text>
      <TextInput style={estilos.input} placeholderTextColor={colores.tenue} {...props} />
    </View>
  );
}

export default function PantallaAcceso({ alIngresar }) {
  const [modo, setModo] = useState("login"); // "login" | "registro"
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [cargando, setCargando] = useState(false);
  const [servidor, setServidor] = useState(servidorActual());

  const usuario = mail.trim().toLowerCase();

  async function ingresar() {
    if (!usuario || !password) return Alert.alert("Faltan datos", "Completá mail y contraseña.");
    setCargando(true);
    try {
      if (MODO_PRUEBA) await cambiarServidor(servidor);
      const data = await pedir("/app/login", { metodo: "POST", cuerpo: { usuario, password } });
      await alIngresar({
        token: data.token,
        usuario: data.usuario,
        nombre: data.nombre,
        apellido: data.apellido,
        rol: data.rol,
      });
    } catch (e) {
      Alert.alert("No se pudo ingresar", e.message);
    } finally {
      setCargando(false);
    }
  }

  async function registrar() {
    if (!nombre.trim() || !apellido.trim() || !usuario || !password) {
      return Alert.alert("Faltan datos", "Completá todos los campos.");
    }
    if (password.length < 6) return Alert.alert("Contraseña corta", "Usá al menos 6 caracteres.");
    if (password !== confirmar) return Alert.alert("Revisá la contraseña", "Las contraseñas no coinciden.");
    setCargando(true);
    try {
      if (MODO_PRUEBA) await cambiarServidor(servidor);
      await pedir("/registro-usuario", {
        metodo: "POST",
        cuerpo: { usuario, password, nombre: nombre.trim(), apellido: apellido.trim(), rol: "bombero" },
      });
      Alert.alert(
        "Solicitud enviada",
        "Un administrador del cuartel tiene que aprobar tu cuenta. Cuando esté aprobada, ingresá con tu mail y contraseña."
      );
      setModo("login");
      setConfirmar("");
    } catch (e) {
      Alert.alert("No se pudo registrar", e.message);
    } finally {
      setCargando(false);
    }
  }

  async function olvideContrasena() {
    if (!usuario) return Alert.alert("Ingresá tu mail", "Escribí tu mail arriba y volvé a tocar este botón.");
    try {
      if (MODO_PRUEBA) await cambiarServidor(servidor);
      await pedir("/solicitar-reset", { metodo: "POST", cuerpo: { usuario } });
      Alert.alert("Revisá tu mail", "Te enviamos un link para cambiar la contraseña.");
    } catch (e) {
      Alert.alert("No se pudo enviar", e.message);
    }
  }

  const esLogin = modo === "login";

  return (
    <KeyboardAvoidingView style={estilos.fondo} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        <Image source={require("../assets/logo.png")} style={estilos.logo} />
        <Text style={estilos.sobretitulo}>Bomberos Voluntarios de Colón</Text>
        <Text style={estilos.titulo}>{esLogin ? "Ingresar" : "Solicitar acceso"}</Text>

        {MODO_PRUEBA && (
          <View style={estilos.prueba}>
            <Text style={estilos.pruebaTitulo}>🧪 Versión de prueba</Text>
            <Campo
              etiqueta="Servidor"
              value={servidor}
              onChangeText={setServidor}
              placeholder="http://192.168.0.217:3000"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        )}

        {!esLogin && (
          <>
            <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} placeholder="Nombre" />
            <Campo etiqueta="Apellido" value={apellido} onChangeText={setApellido} placeholder="Apellido" />
          </>
        )}
        <Campo
          etiqueta="Mail"
          value={mail}
          onChangeText={setMail}
          placeholder="tu@correo.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Campo
          etiqueta="Contraseña"
          value={password}
          onChangeText={setPassword}
          placeholder="Contraseña"
          secureTextEntry
          onSubmitEditing={esLogin ? ingresar : undefined}
        />
        {!esLogin && (
          <Campo
            etiqueta="Confirmar contraseña"
            value={confirmar}
            onChangeText={setConfirmar}
            placeholder="Repetila"
            secureTextEntry
          />
        )}

        <Pressable
          style={({ pressed }) => [estilos.boton, pressed && { opacity: 0.8 }]}
          onPress={esLogin ? ingresar : registrar}
          disabled={cargando}
        >
          {cargando
            ? <ActivityIndicator color="#fff" />
            : <Text style={estilos.botonTexto}>{esLogin ? "Ingresar" : "Enviar solicitud"}</Text>}
        </Pressable>

        {esLogin && (
          <Pressable onPress={olvideContrasena} style={estilos.enlace}>
            <Text style={estilos.enlaceTexto}>¿Olvidaste tu contraseña?</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setModo(esLogin ? "registro" : "login")} style={estilos.enlace}>
          <Text style={estilos.enlaceTexto}>
            {esLogin ? "¿No tenés cuenta? Solicitá acceso" : "← Ya tengo cuenta"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 24, paddingTop: 64, paddingBottom: 48 },
  logo: { width: 96, height: 96, alignSelf: "center", marginBottom: 16 },
  sobretitulo: {
    color: colores.rojo, textAlign: "center", fontWeight: "700",
    letterSpacing: 2, textTransform: "uppercase", fontSize: 12,
  },
  titulo: {
    color: colores.texto, textAlign: "center", fontSize: 30, fontWeight: "800",
    textTransform: "uppercase", marginTop: 6, marginBottom: 24,
  },
  campo: { marginBottom: 14 },
  prueba: {
    borderWidth: 1, borderColor: colores.ambar, borderRadius: 10,
    padding: 12, paddingBottom: 0, marginBottom: 18,
  },
  pruebaTitulo: { color: colores.ambar, fontWeight: "700", marginBottom: 10 },
  etiqueta: {
    color: colores.apagado, fontSize: 12, fontWeight: "600",
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 6,
  },
  input: {
    backgroundColor: colores.elevado, borderColor: colores.bordeFuerte, borderWidth: 1,
    borderRadius: 10, color: colores.texto, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12,
  },
  boton: {
    backgroundColor: colores.rojo, borderRadius: 10, paddingVertical: 16,
    alignItems: "center", marginTop: 8,
  },
  botonTexto: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  enlace: { paddingVertical: 12, alignItems: "center" },
  enlaceTexto: { color: colores.apagado, fontSize: 15 },
});
