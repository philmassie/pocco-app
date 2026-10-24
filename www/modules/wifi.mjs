export function createWifiController({
  native,
  demo,
  capacitor,
  getSsid,
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
      const ssid = getSsid();
      const status = await callNative("WifiConnect", "useCurrentNetwork", { ssid });
      if (status.connected && (status.ssid || "").trim().toLowerCase() === ssid.toLowerCase()) {
        setWifiInfo("Phone is on POCCO Wi-Fi; app is active.", "var(--ok)");
        connect();
      } else {
        stopSocket();
        setStatus("POCCO Wi-Fi inactive", false);
        setWifiInfo("Connect the phone to " + ssid + " to use the app. The app will not switch networks.", "var(--mut)");
      }
    } catch (error) {
      stopSocket();
      setStatus("POCCO Wi-Fi unavailable", false);
      setWifiInfo("Could not check POCCO Wi-Fi status: " + ((error && error.message) || error), "var(--al)");
    } finally {
      checkInProgress = false;
      if (checkAgain) {
        checkAgain = false;
        check();
      }
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
    if (!demo) return check();
  }

  function resume() {
    if (!native || demo || document.visibilityState === "hidden") return;
    return check();
  }

  return { apply: check, check, resume, start };
}
