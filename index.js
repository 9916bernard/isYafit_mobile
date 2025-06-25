import { registerRootComponent } from 'expo';
import { Buffer } from 'buffer';
global.Buffer = Buffer;

// i18n 초기화
import './utils/i18n';

import App from './Screens/App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
