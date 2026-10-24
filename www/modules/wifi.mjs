export function createWifiController({
  native,
  demo,
  capacitor,
  getSettings,
  callNative,
  connect,
  stopSocket,
  setStatus,
  setWifiInfo,
}) {
  let checkInProgress = false;
  let checkAgain = false;

  const addPluginListener = (pluginName, eventName, callback) => {
    if (capacitor?.Plugins && capacitor.Plugins[pluginName]?.addListener) {
      capacitor.Plugins[pluginName].addListener(eventName, callback);
      return;
    }
    if (typeof capacitor?.registerPlugin === "function") {
      const plugin = capacitor.registerPlugin(pluginName);
      if (plugin?.addListener) plugin.addListener(eventName, callback);
    }
  };

  async function check() {
    if (demo) return;
    const { ssid, auto } = getSettings();

    if (!native) {
      connect();
      return;
    }

    if (checkInProgress) {
      checkAgain = true;
      return;
    }
    checkInProgress = true;
    try {
      if (auto) {
        const info = await callNative("WifiConnect", "getRequestStatus", {});
        const currentSsid = (info.ssid || "").trim();
        if (info.connected && currentSsid.toLowerCase() === ssid.toLowerCase()) {
          connect();
        } else if (info.error) {
          stopSocket();
          setStatus("POCCO Wi-Fi request stopped", false);
          setWifiInfo(info.error + ". Wake the app to try again.", "var(--mut)");
        } else {
          stopSocket();
          setStatus("Waiting for POCCO Wi-Fi…", false);
        }
      } else {
        const info = await callNative("WifiConnect", "getCurrentNetwork", {});
        const currentSsid = (info.ssid || "").trim();
        if (info.isWifi && currentSsid.toLowerCase() === ssid.toLowerCase()) {
          setWifiInfo("Phone is on POCCO Wi-Fi; app is active.", "var(--ok)");
          connect();
        } else {
          stopSocket();
          setStatus("POCCO Wi-Fi inactive", false);
          setWifiInfo("Connect the phone to " + ssid + " to use the app. The app will not switch networks.", "var(--mut)");
        }
      }
    } catch (error) {
      stopSocket();
      setStatus("Waiting for POCCO Wi-Fi…", false);
      setWifiInfo("Could not check POCCO Wi-Fi status: " + ((error && error.message) || error), "var(--al)");
    } finally {
      checkInProgress = false;
      if (checkAgain) {
        checkAgain = false;
        check();
      }
    }
  }

  async function apply() {
    const { ssid, password, auto } = getSettings();
    if (!native) {
      setWifiInfo("Wi-Fi connection control is available in the Android app.");
      return;
    }

    if (auto) {
      try {
        const status = await callNative("WifiConnect", "requestNetwork", { ssid, password });
        setWifiInfo(
          status.connected ? "Connected to POCCO Wi-Fi." : "Requesting POCCO Wi-Fi (up to 5 minutes)…",
          "var(--ok)",
        );
        await check();
      } catch (error) {
        stopSocket();
        setWifiInfo("Wi-Fi request error: " + ((error && error.message) || error), "var(--al)");
      }
    } else {
      try {
        await callNative("WifiConnect", "releaseNetwork", {});
        setWifiInfo("App Wi-Fi request disabled.", "var(--mut)");
      } catch (error) {
        setWifiInfo("Could not release Wi-Fi request: " + ((error && error.message) || error), "var(--al)");
      }
      await check();
    }
  }

  async function resume() {
    if (!native || demo || document.visibilityState === "hidden") return;
    if (!getSettings().auto) {
      check();
      return;
    }
    try {
      const status = await callNative("WifiConnect", "getRequestStatus", {});
      if (status.requested) {
        check();
      } else if (status.retryOnResume || !status.error) {
        apply();
      } else {
        check();
      }
    } catch (error) {
      setWifiInfo("Could not resume POCCO Wi-Fi request: " + ((error && error.message) || error), "var(--al)");
    }
  }

  function start() {
    if (native) {
      try {
        addPluginListener("WifiConnect", "wifiNetworkChanged", () => check());
      } catch (error) {
        setWifiInfo("Could not listen for Wi-Fi changes: " + ((error && error.message) || error), "var(--al)");
      }
    }
    if (demo) return Promise.resolve();
    if (native && getSettings().auto) {
      setStatus("Requesting POCCO Wi-Fi…", false);
      return apply();
    } else {
      return check();
    }
  }

  return { apply, check, resume, start };
}
