import { registerRootComponent } from 'expo';

// Primero: registra la tarea de los botones Asisto / No asisto de la notificación
import './src/botonesNotificacion';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
