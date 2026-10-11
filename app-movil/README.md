# App del celular — Alertas Colón

App para Android y iPhone (Expo / React Native). Cuando se despacha una alerta,
el celular suena con la sirena **aunque esté en silencio**, muestra la alerta y
tiene los botones **Asisto / No asisto**. Las respuestas se ven en la app y en el
visor del cuartel.

## Cómo funciona

- El servidor (`server.js`) manda la alerta por **Firebase Cloud Messaging**, con la
  misma cuenta de servicio de Firebase que ya usa para Firestore.
- En Android la alerta usa un canal con **volumen de alarma** (`alertas_v1`): suena
  aunque el celular esté en silencio o vibración, y pasa el "No molestar" si este
  permite alarmas.
- Los usuarios que se registran desde la app quedan con rol **Bombero**: reciben
  alertas pero no pueden enviarlas. Un admin los aprueba desde el panel web.

## Primera vez: generar el APK de Android

1. **Firebase** — En la consola de Firebase, en el mismo proyecto del servidor:
   *Configuración del proyecto → Tus apps → Agregar app → Android*.
   - Nombre del paquete: `com.alertascolon.ba.movil`
   - Descargá `google-services.json` y ponelo en esta carpeta (`app-movil/`).
     Se puede subir al repositorio: solo tiene identificadores públicos.
2. **Servidor** — Publicar la rama con los cambios del servidor en Render.
   No hace falta ninguna variable de entorno nueva.
3. **Cuenta de Expo** — Crear una cuenta gratis en https://expo.dev y, desde esta carpeta:
   ```
   npx eas-cli@latest login
   npx eas-cli@latest build -p android --profile preview
   ```
   La primera vez pregunta si crea el proyecto y la clave de firma: responder que sí.
   Al terminar (unos 10–20 min) da un link para descargar el **APK**.
4. **Instalar** — Abrir el link en el celular, descargar el APK y permitir
   "instalar apps de origen desconocido" cuando lo pida.

## En cada celular (importante)

Al entrar por primera vez, en la sección **Preparar el celular**:

1. **Probar la sirena** → bloquear el celular y ponerlo en silencio: tiene que sonar.
   Suena con el volumen de **alarma** (el del despertador): si no se escucha, subir ese volumen.
2. **Quitar ahorro de batería** → en el cartel del sistema, tocar *Permitir*.
   En Xiaomi, Samsung y Motorola esto es clave: si no, la alerta puede llegar tarde.
3. **Revisar notificaciones** → que *Alertas de salida* esté activada. Si la marca muestra
   *Ignorar / Anular No molestar*, activarlo. Igual, con el volumen de alarma la sirena ya
   pasa el "No molestar" cuando este permite alarmas, que es lo normal.

## Actualizar la app

Cambios en el código → volver a correr el `build` del paso 3 y reinstalar el APK.
Si se cambia el sonido de la sirena, hay que crear un canal nuevo (`alertas_v2`)
en `src/notificaciones.js` y en `server.js`: Android no deja cambiar el sonido de un canal existente.

## iPhone (cuando Apple apruebe el permiso)

Pendiente, en este orden:

1. Cuenta de Apple Developer y pedido del permiso **Critical Alerts**.
2. Subir la clave APNs (.p8) de Apple a Firebase (*Cloud Messaging → Apple*).
3. En la app: obtener el token de FCM también en iPhone (hoy en iPhone se
   obtiene el token de Apple, que FCM no acepta). Hay que ajustar
   `obtenerTokenPush()`.
4. Convertir `sirena.mp3` a `sirena.wav` (máx. 30 s) y agregarlo en `app.json`.
5. Agregar el permiso en `app.json` → `ios.entitlements`:
   `"com.apple.developer.usernotifications.critical-alerts": true`.
6. En Render: `IOS_CRITICAL_ALERTS=true`.
7. Build con `npx eas-cli@latest build -p ios` y subir a TestFlight con `eas submit`.
