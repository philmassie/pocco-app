# POCCO+ display, v0.1.0 (your Copilot layout + my features, packaged for Android)

## What is in this folder
- `www/` the page: `index.html`, `app.js` (dashboard and app lifecycle), `icons/` (reusable SVG icon assets), `modules/menu.mjs` (settings and diagnostics UI), `modules/config.mjs` (gauge defaults and saved settings), `modules/log-storage.mjs` (IndexedDB and in-memory log backends), `modules/severity.mjs` (shared severity-to-colour classes), `logic.js` (trend, oil arming, CSV helpers), `msgpack.js` (frame decoder)
- `android/` the ready-made Android Studio project (Capacitor 8). **Open this folder in Android Studio.**
- `node_modules/` only the three Capacitor pieces the Android build needs (`@capacitor/android`, `filesystem`, `share`). Leave it where it is.
- `capacitor.config.json`, `package.json` Capacitor settings (see "Why these settings")
- `test/` Node tests for the helpers and modules; run them with `npm test`

## 1. Try the page without the car (PC)
Open `www/index.html` in a desktop browser, then Menu, tick **Demo mode**, **Save & reload**. Or add `?demo=1` to the address.
Demo runs a fake 7 minute drive: warm-up, oil arming after 20 s, a short overheat, a 1 s coolant-level blip then a real fault, EGT cool-down.

## 2. Build the APK in Android Studio
1. Android Studio must be **2025.2.1 or newer** (Capacitor 8's stated minimum). It brings its own JDK. Install an Android SDK platform (API 24 or higher; Capacitor lists Android 16 / API 36 as the latest stable). [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
2. Unzip to a short path (for example `C:\pocco-app`). Do not move `android/` away from `node_modules/`: the Gradle files point at `../node_modules/...`.
3. Android Studio: **Open**, choose the **`android`** folder (not the top folder). Wait for "Gradle sync" to finish. The first sync downloads Gradle and libraries, so the PC needs internet.
4. Phone: Settings, About phone, tap Build number 7 times, then Developer options, switch on **USB debugging**. Plug in by USB and accept the prompt on the phone.
5. Pick your phone in the device drop-down at the top and press the green **Run** triangle. That installs and starts the app.
   - To get a file instead: menu **Build, Build Bundle(s) / APK(s), Build APK(s)**. The file is `android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to the phone and allow "install unknown apps" for your file manager.
6. First start: allow **Location** (for the GPS columns). Tap the screen once.

## 3. Use it in the car
1. Open the app. Auto-connect to `Madman POCCO+` is enabled by default: the app registers a high-priority Android Wi-Fi suggestion on launch (priority and initial auto-join are available on Android 11+) and waits for Android to join it. Android may ask you to approve the suggestion; if it warns that the Wi-Fi has no internet, choose **stay connected**. You can change the SSID, password, or auto-connect setting in Menu.
2. The top bar should go green ("connected"). If it says "connected, no data", open Menu and read the raw frame log. The manual (p. 5) says some phones also need mobile data off.
3. Menu, Logs: each trip is one CSV. Every CSV row includes the same UUID in its `trip_id` column, so trips can be identified when CSVs are combined. In the app choose **Choose output folder** to select a phone folder for saved and auto-saved CSVs; the permission is remembered by Android. **Use Documents** switches back to the default. Each log row has **Save** and **Share** (Android share sheet).

## Changing the page later
Edit files in `www/`, then either
- copy them into `android/app/src/main/assets/public/` (overwrite) and press Run again, or
- with Node 22+ installed: `npm install`, then `npx cap sync android`.

## Why these settings
- `androidScheme: "http"`: the Capacitor default is `https`, which makes the page a secure origin and the WebView blocks a `ws://` connection from it (mixed content). With `http` the page is served from `http://localhost`, which browsers still treat as a secure context for GPS and keep-awake. [Capacitor config](https://capacitorjs.com/docs/config)
- Cleartext: Android disables cleartext (non-https) traffic by default from API 28 on. `server.cleartext` in the config did **not** change the manifest when I checked the generated project, so I added `android:usesCleartextTraffic="true"` to `AndroidManifest.xml` by hand. A user fixing the same `ws://` failure reports that attribute as their fix. [Ionic forum](https://forum.ionicframework.com/t/ionicframework-v8-cannot-use-websocket-correctly-in-android-error-code-1006-but-it-runs-normally-in-chrome/248087)
- Location permissions are declared in the manifest. Capacitor's own WebView code asks for them when the page requests GPS (I read this in `BridgeWebChromeClient.java`).
- `MainActivity.java` sets "keep screen on", so it does not rely on the browser wake-lock API.
- File saving: Capacitor's Android WebView is not a normal browser, so the blob "download" link that works on a PC is not relied on. The app uses Android's folder picker for a persistent CSV output folder (Documents by default), the Filesystem plugin for default/cache files, and the Share plugin for sharing. The Ionic forum has threads on how awkward downloads are in Capacitor. [Ionic forum](https://forum.ionicframework.com/t/why-is-there-no-clear-guide-on-downloading-files-with-capacitor/216789)
- Target SDK is 36 (Capacitor's default). Android 17 makes a new "local network" permission mandatory only for apps targeting SDK 37 or higher; an app targeting 36 keeps access through the INTERNET permission. If you ever raise the target to 37, add `ACCESS_LOCAL_NETWORK` and request it at run time, or the unit's 192.168.4.1 address will be blocked. [Android: local network permission](https://developer.android.com/privacy-and-security/local-network-permission)
- Changing `androidScheme` later changes the page's origin, so saved limits and logs in the app would not carry over.

## Not verified yet (no phone or unit was available to me)
- The APK build itself: the project was generated and the web side tested, but I had no Android SDK here to run Gradle.
- `ws://` from the app to the real unit (cleartext fix above is from a forum report plus Capacitor docs, not tested).
- GPS inside the app, the Save (Documents folder) path on your Android version (Share is the safer one), and the Filesystem/Share calls (tested only against a stand-in for the bridge).
- The phone's light sensor: the page tries the web `AmbientLightSensor`, which many Android WebViews do not offer. If it is missing, Auto stays on Day and you can pick Night by hand. A native sensor plugin would be the next step if you want this.
- Trend sensitivity (coolant 1.5 °C/min, EGT 30 °C/min over 30 s), the coolant-level sensor behaviour (assumed 0 = good, above 0 = low, held 2 s), and the session clock format (a number or "m:ss"; a drop of over 5 s starts a new log file).
- Units are assumed metric. All limits are placeholders for colour zones only; the POCCO+ keeps its own alarms.

## What changed from your Copilot v0.0.2
Layout is untouched: oil on top, coolant below, level lamp left, battery right, EGT tile below, session clock bottom-left.
Added back: peak markers (white; coolant, oil, EGT), oil low marker (blue, only after the engine is judged running), trend arrows (coolant, EGT), the "safe to shut down" strip (inside the EGT tile's empty space) plus a purple tick on the EGT dial at the shut-down limit, editable limits and settings in Menu, Day/Night/Auto button, GPS and REC chips in the top bar, per-second CSV logging with GPS, the 7 minute demo, and the oil-armed colouring (oil value stays grey until running).
Tap the top tile to clear coolant/oil markers, tap the EGT tile to clear its peak.
Not brought back: the cold-coolant white zone and the fill level on the battery icon (your Copilot design colours the icon instead).
Coolant icon credit: Magnific via [Flaticon](https://www.flaticon.com/free-icon/engine-coolant_95134) (also in Menu).
