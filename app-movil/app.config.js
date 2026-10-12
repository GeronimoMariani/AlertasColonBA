// Toma app.json y, para la versión de prueba (perfil "pruebas" de eas.json),
// la apunta al servidor local y permite http:// sin cifrar (solo en la red de casa).
module.exports = ({ config }) => {
  if (process.env.APP_VARIANTE !== "pruebas") return config;

  return {
    ...config,
    name: "Alertas Colón PRUEBA",
    plugins: [
      ...config.plugins,
      ["expo-build-properties", { android: { usesCleartextTraffic: true } }],
    ],
    extra: {
      ...config.extra,
      apiUrl: process.env.API_URL || config.extra.apiUrl,
      modoPrueba: true,
    },
  };
};
