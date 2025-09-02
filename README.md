# isYafit_mobile (PFInspector)

A cross-platform mobile application for interacting with indoor fitness equipment, viewing real-time data, running compatibility tests, and storing workout reports.

---

## Table of Contents

- [Features](#features)
- [Technologies Used](#technologies-used)
  - [Frontend](#frontend)
  - [Backend / Device Communication](#backend--device-communication)
  - [Other Libraries](#other-libraries)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Screenshots](#screenshots)
- [License](#license)

---

## Features

- **Bluetooth LE device scanning and connection**
- **Real-time data visualization for connected fitness equipment**
- **Compatibility test and reporting**
- **Multi-language support**
- **Persistent report storage**
- **Patch notes and terms of service screen**
- **Modern mobile UI and theming**

---

## Technologies Used

### Frontend

- **React Native**  
  The main framework for building cross-platform (iOS and Android) mobile apps.
- **TypeScript**  
  Used across the codebase for type safety and maintainability.
- **react-native-vector-icons**  
  For icons and enhanced UI elements.
- **react-native-safe-area-context**  
  For proper UI rendering on devices with notches and safe areas.
- **react-native-linear-gradient**  
  For gradient backgrounds and UI styling.
- **react-native-root-toast**  
  For toast notifications and alerts.
- **i18next**  
  For internationalization and language support.

### Backend / Device Communication

- **react-native-ble-plx**  
  Used to manage Bluetooth Low Energy (BLE) connections to devices.
- **Custom FTMSManager and Protocol Managers**  
  Provides logic for device connection, protocol auto-detection, authentication, command sending, and data parsing for a variety of device protocols (FTMS, MOBI, REBORN, TACX, FITSHOW, CPS, etc.).
- **AsyncStorage (@react-native-async-storage/async-storage)**  
  For storing past reports and persistent data locally on device.

### Other Libraries

- **Expo modules**  
  Some integrations for application lifecycle management.
- **Android Native Modules**  
  Located in `android/app/src/main/java`, for deep integration with the platform as required by React Native.

---

## Project Structure

```
Screens/                # Main React Native screens and navigation
FtmsManager/            # Device/BLE management, protocol logic, authentication
utils/                  # Utility functions (report storage, compatibility utils, etc.)
android/                # Android native code and configuration
styles/                 # Common styles and theming
```

---

## Installation

For installation instructions and setup guides, please visit:

👉 [https://pfsdk.yanadoofitness.com/tools](https://pfsdk.yanadoofitness.com/tools)

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

## Credits

Developed by [9916bernard](https://github.com/9916bernard).

---

## Notes

- BLE features require device permissions and might not work on all emulators.
- Supported languages: English, Korean, Chinese (extendable via i18next).
- Patch notes and terms of service shown in-app.
