import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
} from "@expo-google-fonts/barlow-condensed";
import { Barlow_400Regular, Barlow_600SemiBold, Barlow_700Bold } from "@expo-google-fonts/barlow";
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from "@expo-google-fonts/jetbrains-mono";

// Mismos colores que el panel web (public/css/base.css)
export const colores = {
  fondo: "#0d0c0c",
  panel: "#161415",
  elevado: "#1e1b1c",
  borde: "#2c2728",
  bordeFuerte: "#3d3637",
  texto: "#ece6e3",
  apagado: "#9b918d",
  tenue: "#6b6260",
  rojo: "#d8261e",
  rojoClaro: "#f0645d",
  rojoProfundo: "#9e0d0b",
  ambar: "#f2a900",
  verde: "#3fb37f",
  acero: "#6f9cc4",
};

// Mismas letras que el panel web y el visor. Se cargan en App.js antes de mostrar la app.
// Con fuentes propias no se usa fontWeight: cada peso es una familia distinta.
export const archivosFuentes = {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
  BarlowCondensed_800ExtraBold,
  Barlow_400Regular,
  Barlow_600SemiBold,
  Barlow_700Bold,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
};

export const fuentes = {
  titulo: "BarlowCondensed_700Bold",
  tituloFuerte: "BarlowCondensed_800ExtraBold",
  tituloMedio: "BarlowCondensed_600SemiBold",
  texto: "Barlow_400Regular",
  textoMedio: "Barlow_600SemiBold",
  textoFuerte: "Barlow_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoFuerte: "JetBrainsMono_600SemiBold",
};
