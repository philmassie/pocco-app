package app.pocco.display;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.TransportInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSuggestion;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "WifiConnect")
public class WifiConnectPlugin extends Plugin {

    private static final String TAG = "WifiConnectPlugin";
    private ConnectivityManager.NetworkCallback defaultNetworkCallback;

    @Override
    public void load() {
        super.load();
        startMonitoringNetwork();
    }

    private void startMonitoringNetwork() {
        Context context = getContext();
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;

        if (defaultNetworkCallback == null) {
            defaultNetworkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    super.onAvailable(network);
                    notifyCurrentNetwork(context);
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    super.onCapabilitiesChanged(network, caps);
                    notifyCurrentNetwork(context);
                }

                @Override
                public void onLost(Network network) {
                    super.onLost(network);
                    notifyCurrentNetwork(context);
                }
            };

            try {
                cm.registerDefaultNetworkCallback(defaultNetworkCallback);
            } catch (Exception e) {
                Log.e(TAG, "Could not monitor the default network", e);
            }
        }
    }

    private void notifyCurrentNetwork(Context context) {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        Network activeNetwork = cm == null ? null : cm.getActiveNetwork();
        NetworkCapabilities caps = activeNetwork == null ? null : cm.getNetworkCapabilities(activeNetwork);
        boolean isWifi = caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        JSObject event = new JSObject();
        event.put("isWifi", isWifi);
        event.put("ssid", isWifi ? extractSsid(caps, context) : "");
        notifyListeners("wifiNetworkChanged", event);
    }

    private String extractSsid(NetworkCapabilities caps, Context context) {
        String ssid = null;
        if (caps != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            TransportInfo info = caps.getTransportInfo();
            if (info instanceof WifiInfo) {
                ssid = ((WifiInfo) info).getSSID();
            }
        }
        if (ssid == null || ssid.equals("<unknown ssid>") || ssid.isEmpty()) {
            WifiManager wm = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wm.getConnectionInfo() != null) {
                ssid = wm.getConnectionInfo().getSSID();
            }
        }
        if (ssid != null && ssid.startsWith("\"") && ssid.endsWith("\"") && ssid.length() > 2) {
            ssid = ssid.substring(1, ssid.length() - 1);
        }
        return (ssid == null || ssid.equals("<unknown ssid>")) ? "" : ssid;
    }

    @PluginMethod
    public void getCurrentSsid(PluginCall call) {
        Context context = getContext();
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);

        String ssid = "";
        boolean isWifi = false;

        if (cm != null) {
            Network activeNetwork = cm.getActiveNetwork();
            if (activeNetwork != null) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(activeNetwork);
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    isWifi = true;
                    ssid = extractSsid(caps, context);
                }
            }
        }

        JSObject ret = new JSObject();
        ret.put("isWifi", isWifi);
        ret.put("ssid", ssid);
        call.resolve(ret);
    }

    @PluginMethod
    public void suggestNetwork(PluginCall call) {
        String ssid = call.getString("ssid");
        String password = call.getString("password", "");

        if (ssid == null || ssid.trim().isEmpty()) {
            call.reject("SSID is required");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                call.reject("Wi-Fi service not available");
                return;
            }

            try {
                wifiManager.removeNetworkSuggestions(new ArrayList<>());
                List<WifiNetworkSuggestion> suggestionsList = new ArrayList<>();
                suggestionsList.add(buildSuggestion(ssid.trim(), password));

                int status = wifiManager.addNetworkSuggestions(suggestionsList);
                if (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
                    JSObject ret = new JSObject();
                    ret.put("status", "suggested");
                    ret.put("ssid", ssid.trim());
                    call.resolve(ret);
                } else {
                    call.reject("Failed to add network suggestion, status code: " + status);
                }
            } catch (Exception e) {
                call.reject("Could not register Wi-Fi suggestion: " + e.getMessage(), e);
            }
        } else {
            call.reject("Wi-Fi suggestions require Android 10 or newer");
        }
    }

    @PluginMethod
    public void removeSuggestion(PluginCall call) {
        String ssid = call.getString("ssid");
        if (ssid == null || ssid.trim().isEmpty()) {
            call.reject("SSID is required");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            WifiManager wifiManager = (WifiManager) context.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wifiManager == null) {
                call.reject("Wi-Fi service not available");
                return;
            }
            try {
                int status = wifiManager.removeNetworkSuggestions(new ArrayList<>());
                if (status != WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
                    call.reject("Failed to remove Wi-Fi suggestions, status code: " + status);
                    return;
                }
            } catch (Exception e) {
                call.reject("Could not remove Wi-Fi suggestion: " + e.getMessage(), e);
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("status", "removed");
        call.resolve(ret);
    }

    private WifiNetworkSuggestion buildSuggestion(String ssid, String password) {
        WifiNetworkSuggestion.Builder builder = new WifiNetworkSuggestion.Builder()
                .setSsid(ssid)
                .setIsAppInteractionRequired(false);

        if (password != null && !password.trim().isEmpty()) {
            builder.setWpa2Passphrase(password.trim());
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setPriority(1000);
            builder.setIsInitialAutojoinEnabled(true);
        }
        return builder.build();
    }

    @Override
    protected void handleOnDestroy() {
        if (defaultNetworkCallback != null) {
            try {
                Context context = getContext();
                ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (connectivityManager != null) {
                    connectivityManager.unregisterNetworkCallback(defaultNetworkCallback);
                }
            } catch (Exception ignored) {}
            defaultNetworkCallback = null;
        }
        super.handleOnDestroy();
    }
}
