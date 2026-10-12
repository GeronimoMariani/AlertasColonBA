import { View, Text, Image, StyleSheet } from "react-native";
import { colores, fuentes } from "./tema";

// Escudo + nombre, arriba a la izquierda de cada pantalla
export function Marca({ titulo, subtitulo, tamano = 42 }) {
  return (
    <View style={estilos.marca}>
      <Image source={require("../assets/logo.png")} style={{ width: tamano, height: tamano }} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.marcaTitulo} numberOfLines={1}>{titulo}</Text>
        {subtitulo ? <Text style={estilos.marcaSubtitulo} numberOfLines={1}>{subtitulo}</Text> : null}
      </View>
    </View>
  );
}

const TONOS = {
  ok: { color: colores.verde, borde: "rgba(63,179,127,0.35)" },
  aviso: { color: colores.ambar, borde: "rgba(242,169,0,0.4)" },
  error: { color: colores.rojoClaro, borde: "rgba(216,38,30,0.45)" },
  neutro: { color: colores.apagado, borde: colores.bordeFuerte },
};

// Etiqueta chica de estado: "En vivo", "Recibe alertas", etc.
export function Chip({ texto, tono = "neutro" }) {
  const t = TONOS[tono];
  return (
    <View style={[estilos.chip, { borderColor: t.borde }]}>
      <View style={[estilos.punto, { backgroundColor: t.color }]} />
      <Text style={[estilos.chipTexto, { color: t.color }]}>{texto}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  marca: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  marcaTitulo: {
    color: colores.texto, fontFamily: fuentes.titulo, fontSize: 20,
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  marcaSubtitulo: { color: colores.apagado, fontFamily: fuentes.texto, fontSize: 13 },

  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9,
  },
  punto: { width: 6, height: 6, borderRadius: 3 },
  chipTexto: { fontFamily: fuentes.monoFuerte, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" },
});
