package app.pocco.display;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.net.wifi.WifiNetworkSuggestion;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "WifiConnect")
public class WifiConnectPlugin extends Plugin {

    private ConnectivityManager.NetworkCallback networkCallback;

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

            WifiNetworkSuggestion.Builder builder = new WifiNetworkSuggestion.Builder()
                    .setSsid(ssid.trim())
                    .setIsAppInteractionRequired(false);

            if (password != null && !password.trim().isEmpty()) {
                builder.setWpa2Passphrase(password.trim());
            }

            List<WifiNetworkSuggestion> suggestionsList = new ArrayList<>();
            suggestionsList.add(builder.build());

            int status = wifiManager.addNetworkSuggestions(suggestionsList);
            if (status == WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
                JSObject ret = new JSObject();
                ret.put("status", "suggested");
                ret.put("ssid", ssid);
                call.resolve(ret);
            } else {
                call.reject("Failed to add network suggestion, status code: " + status);
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("status", "unsupported_android_version");
            call.resolve(ret);
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
            if (wifiManager != null) {
                WifiNetworkSuggestion.Builder builder = new WifiNetworkSuggestion.Builder().setSsid(ssid.trim());
                List<WifiNetworkSuggestion> suggestionsList = new ArrayList<>();
                suggestionsList.add(builder.build());
                wifiManager.removeNetworkSuggestions(suggestionsList);
            }
        }
        JSObject ret = new JSObject();
        ret.put("status", "removed");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNetwork(PluginCall call) {
        String ssid = call.getString("ssid");
        String password = call.getString("password", "");

        if (ssid == null || ssid.trim().isEmpty()) {
            call.reject("SSID is required");
            return;
        }

        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) {
                call.reject("ConnectivityManager not available");
                return;
            }

            releaseNetworkCallback();

            WifiNetworkSpecifier.Builder specifierBuilder = new WifiNetworkSpecifier.Builder()
                    .setSsid(ssid.trim());

            if (password != null && !password.trim().isEmpty()) {
                specifierBuilder.setWpa2Passphrase(password.trim());
            }

            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .setNetworkSpecifier(specifierBuilder.build())
                    .build();

            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    super.onAvailable(network);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        connectivityManager.bindProcessToNetwork(network);
                    }
                    JSObject event = new JSObject();
                    event.put("status", "connected");
                    event.put("ssid", ssid);
                    notifyListeners("wifiStateChange", event);
                }

                @Override
                public void onLost(Network network) {
                    super.onLost(network);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        connectivityManager.bindProcessToNetwork(null);
                    }
                    JSObject event = new JSObject();
                    event.put("status", "lost");
                    event.put("ssid", ssid);
                    notifyListeners("wifiStateChange", event);
                }
            };

            try {
                connectivityManager.requestNetwork(request, networkCallback);
                JSObject ret = new JSObject();
                ret.put("status", "requesting");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error requesting network: " + e.getMessage());
            }
        } else {
            JSObject ret = new JSObject();
            ret.put("status", "unsupported_android_version");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void releaseNetwork(PluginCall call) {
        releaseNetworkCallback();
        JSObject ret = new JSObject();
        ret.put("status", "released");
        call.resolve(ret);
    }

    private void releaseNetworkCallback() {
        if (networkCallback != null) {
            try {
                Context context = getContext();
                ConnectivityManager connectivityManager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
                if (connectivityManager != null) {
                    connectivityManager.unregisterNetworkCallback(networkCallback);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        connectivityManager.bindProcessToNetwork(null);
                    }
                }
            } catch (Exception ignored) {}
            networkCallback = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        releaseNetworkCallback();
        super.handleOnDestroy();
    }
}
