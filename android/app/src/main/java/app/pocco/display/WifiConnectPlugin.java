package app.pocco.display;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.TransportInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiNetworkSpecifier;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

@CapacitorPlugin(name = "WifiConnect")
public class WifiConnectPlugin extends Plugin {

    private static final String TAG = "WifiConnectPlugin";
    private static final long RETRY_WINDOW_MS = 5 * 60 * 1000;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private ConnectivityManager.NetworkCallback defaultNetworkCallback;
    private Network requestedNetwork;
    private Runnable retryTimeout;
    private String requestedSsid = "";
    private String requestedPassword = "";
    private String lastError = "";
    private boolean connected;
    private boolean retryOnResume;

    @Override
    public void load() {
        super.load();
        connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        removeLegacySuggestions();
        startMonitoringDefaultNetwork();
    }

    private void startMonitoringDefaultNetwork() {
        if (connectivityManager == null || defaultNetworkCallback != null) return;
        defaultNetworkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                notifyNetworkChanged();
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                notifyNetworkChanged();
            }

            @Override
            public void onLost(Network network) {
                notifyNetworkChanged();
            }
        };
        try {
            connectivityManager.registerDefaultNetworkCallback(defaultNetworkCallback);
        } catch (Exception e) {
            defaultNetworkCallback = null;
            Log.e(TAG, "Could not monitor the default network", e);
        }
    }

    private void removeLegacySuggestions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return;
        WifiManager wifiManager = (WifiManager) getContext().getApplicationContext()
                .getSystemService(Context.WIFI_SERVICE);
        if (wifiManager == null) return;
        try {
            int status = wifiManager.removeNetworkSuggestions(new ArrayList<>());
            if (status != WifiManager.STATUS_NETWORK_SUGGESTIONS_SUCCESS) {
                Log.w(TAG, "Could not remove old Wi-Fi suggestions, status code: " + status);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not remove old Wi-Fi suggestions", e);
        }
    }

    @PluginMethod
    public void requestNetwork(PluginCall call) {
        String ssid = call.getString("ssid");
        String password = call.getString("password", "");
        if (ssid == null || ssid.trim().isEmpty()) {
            call.reject("SSID is required");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Wi-Fi network requests require Android 10 or newer");
            return;
        }
        if (connectivityManager == null) {
            call.reject("Connectivity service not available");
            return;
        }

        String normalizedSsid = ssid.trim();
        String normalizedPassword = password == null ? "" : password.trim();
        if (networkCallback != null && normalizedSsid.equals(requestedSsid)
                && normalizedPassword.equals(requestedPassword)) {
            call.resolve(networkStatus());
            return;
        }
        releaseRequestedNetwork();
        requestedSsid = normalizedSsid;
        requestedPassword = normalizedPassword;
        lastError = "";
        connected = false;
        retryOnResume = false;

        WifiNetworkSpecifier.Builder specifierBuilder = new WifiNetworkSpecifier.Builder()
                .setSsid(requestedSsid);
        if (!requestedPassword.isEmpty()) {
            specifierBuilder.setWpa2Passphrase(requestedPassword);
        }
        NetworkRequest request = new NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(specifierBuilder.build())
                .build();

        ConnectivityManager.NetworkCallback callback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                if (this != networkCallback) return;
                if (!connectivityManager.bindProcessToNetwork(network)) {
                    String error = "Could not route app traffic over the requested Wi-Fi";
                    connected = false;
                    releaseRequestedNetwork();
                    lastError = error;
                    notifyNetworkChanged();
                    return;
                }
                requestedNetwork = network;
                connected = true;
                lastError = "";
                cancelRetryTimeout();
                notifyNetworkChanged();
            }

            @Override
            public void onLost(Network network) {
                if (this != networkCallback) return;
                if (requestedNetwork != null && !requestedNetwork.equals(network)) return;
                requestedNetwork = null;
                connectivityManager.bindProcessToNetwork(null);
                connected = false;
                notifyNetworkChanged();
                scheduleRetryTimeout();
            }

            @Override
            public void onUnavailable() {
                if (this != networkCallback) return;
                cancelRetryTimeout();
                requestedNetwork = null;
                connected = false;
                requestedSsid = "";
                requestedPassword = "";
                networkCallback = null;
                lastError = "Android could not connect to POCCO Wi-Fi";
                retryOnResume = true;
                notifyNetworkChanged();
            }
        };

        networkCallback = callback;
        scheduleRetryTimeout();
        try {
            connectivityManager.requestNetwork(request, callback);
            call.resolve(networkStatus());
        } catch (Exception e) {
            cancelRetryTimeout();
            networkCallback = null;
            requestedSsid = "";
            requestedPassword = "";
            lastError = "Could not request Wi-Fi: " + e.getMessage();
            retryOnResume = false;
            call.reject(lastError, e);
        }
    }

    @PluginMethod
    public void getRequestStatus(PluginCall call) {
        call.resolve(networkStatus());
    }

    @PluginMethod
    public void getCurrentNetwork(PluginCall call) {
        call.resolve(currentNetworkStatus());
    }

    @PluginMethod
    public void releaseNetwork(PluginCall call) {
        releaseRequestedNetwork();
        lastError = "";
        retryOnResume = false;
        call.resolve(networkStatus());
    }

    private JSObject networkStatus() {
        JSObject result = new JSObject();
        result.put("requested", networkCallback != null);
        result.put("connected", connected);
        result.put("ssid", connected ? requestedSsid : "");
        result.put("error", lastError);
        result.put("retryOnResume", retryOnResume);
        putCurrentNetworkStatus(result);
        return result;
    }

    private JSObject currentNetworkStatus() {
        JSObject result = new JSObject();
        putCurrentNetworkStatus(result);
        return result;
    }

    private void putCurrentNetworkStatus(JSObject result) {
        Network activeNetwork = connectivityManager == null ? null : connectivityManager.getActiveNetwork();
        NetworkCapabilities capabilities = activeNetwork == null || connectivityManager == null
                ? null : connectivityManager.getNetworkCapabilities(activeNetwork);
        boolean isWifi = capabilities != null
                && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        String ssid = isWifi ? extractSsid(capabilities) : "";
        result.put("isWifi", isWifi);
        result.put("ssid", ssid);
        result.put("currentIsWifi", isWifi);
        result.put("currentSsid", ssid);
    }

    private String extractSsid(NetworkCapabilities capabilities) {
        String ssid = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            TransportInfo transportInfo = capabilities.getTransportInfo();
            if (transportInfo instanceof WifiInfo) {
                ssid = ((WifiInfo) transportInfo).getSSID();
            }
        }
        if (ssid == null || ssid.equals("<unknown ssid>") || ssid.isEmpty()) {
            WifiManager wifiManager = (WifiManager) getContext().getApplicationContext()
                    .getSystemService(Context.WIFI_SERVICE);
            if (wifiManager != null && wifiManager.getConnectionInfo() != null) {
                ssid = wifiManager.getConnectionInfo().getSSID();
            }
        }
        if (ssid != null && ssid.startsWith("\"") && ssid.endsWith("\"") && ssid.length() > 2) {
            ssid = ssid.substring(1, ssid.length() - 1);
        }
        return ssid == null || ssid.equals("<unknown ssid>") ? "" : ssid;
    }

    private void notifyNetworkChanged() {
        notifyListeners("wifiNetworkChanged", networkStatus());
    }

    private void scheduleRetryTimeout() {
        cancelRetryTimeout();
        retryTimeout = () -> {
            if (networkCallback == null) return;
            boolean hadConnection = connected;
            releaseRequestedNetwork();
            lastError = hadConnection
                    ? "POCCO Wi-Fi was unavailable for five minutes"
                    : "POCCO Wi-Fi was not found within five minutes";
            retryOnResume = true;
            notifyNetworkChanged();
        };
        handler.postDelayed(retryTimeout, RETRY_WINDOW_MS);
    }

    private void cancelRetryTimeout() {
        if (retryTimeout != null) {
            handler.removeCallbacks(retryTimeout);
            retryTimeout = null;
        }
    }

    private void releaseRequestedNetwork() {
        cancelRetryTimeout();
        ConnectivityManager.NetworkCallback callback = networkCallback;
        networkCallback = null;
        connected = false;
        requestedNetwork = null;
        requestedSsid = "";
        requestedPassword = "";
        if (connectivityManager != null) {
            connectivityManager.bindProcessToNetwork(null);
            if (callback != null) {
                try {
                    connectivityManager.unregisterNetworkCallback(callback);
                } catch (IllegalArgumentException e) {
                    Log.w(TAG, "Wi-Fi network callback was already unregistered", e);
                }
            }
        }
    }

    @Override
    protected void handleOnDestroy() {
        releaseRequestedNetwork();
        if (defaultNetworkCallback != null && connectivityManager != null) {
            try {
                connectivityManager.unregisterNetworkCallback(defaultNetworkCallback);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Default network callback was already unregistered", e);
            }
            defaultNetworkCallback = null;
        }
        super.handleOnDestroy();
    }
}
