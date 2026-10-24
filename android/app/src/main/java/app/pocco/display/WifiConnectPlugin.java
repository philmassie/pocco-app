package app.pocco.display;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.TransportInfo;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Arrays;
import java.util.List;

@CapacitorPlugin(
        name = "WifiConnect",
        permissions = {
                @Permission(alias = "nearbyWifi", strings = { Manifest.permission.NEARBY_WIFI_DEVICES }),
                @Permission(alias = "wifiLocation", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
        }
)
public class WifiConnectPlugin extends Plugin {

    private static final String TAG = "WifiConnectPlugin";
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback wifiNetworkCallback;
    private Network boundNetwork;

    @Override
    public void load() {
        super.load();
        connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        startMonitoringDefaultNetwork();
    }

    private void startMonitoringDefaultNetwork() {
        if (connectivityManager == null || wifiNetworkCallback != null) return;
        wifiNetworkCallback = new ConnectivityManager.NetworkCallback() {
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
            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();
            connectivityManager.registerNetworkCallback(request, wifiNetworkCallback);
        } catch (Exception e) {
            wifiNetworkCallback = null;
            Log.e(TAG, "Could not monitor Wi-Fi networks", e);
        }
    }

    @PluginMethod
    public void useCurrentNetwork(PluginCall call) {
        if (!hasWifiReadPermission()) {
            requestPermissionForAlias(getWifiPermissionAlias(), call, "wifiPermissionCallback");
            return;
        }
        useCurrentNetworkForCall(call);
    }

    @PermissionCallback
    private void wifiPermissionCallback(PluginCall call) {
        if (!hasWifiReadPermission()) {
            call.reject("Permission to identify nearby Wi-Fi networks was denied");
            return;
        }
        useCurrentNetworkForCall(call);
    }

    private void useCurrentNetworkForCall(PluginCall call) {
        String targetSsid = call.getString("ssid");
        if (targetSsid == null || targetSsid.trim().isEmpty()) {
            call.reject("SSID is required");
            return;
        }

        Network wifiNetwork = findCurrentWifiNetwork();
        NetworkCapabilities capabilities = wifiNetwork == null || connectivityManager == null
                ? null : connectivityManager.getNetworkCapabilities(wifiNetwork);
        String currentSsid = capabilities == null ? "" : extractSsid(capabilities);
        boolean matches = capabilities != null
                && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                && currentSsid.equalsIgnoreCase(targetSsid.trim());

        if (matches) {
            if (!connectivityManager.bindProcessToNetwork(wifiNetwork)) {
                call.reject("Could not route app traffic over the connected POCCO Wi-Fi");
                return;
            }
            boundNetwork = wifiNetwork;
        } else if (boundNetwork != null) {
            connectivityManager.bindProcessToNetwork(null);
            boundNetwork = null;
        }

        JSObject result = new JSObject();
        result.put("connected", matches);
        result.put("ssid", matches ? currentSsid : "");
        call.resolve(result);
    }

    private Network findCurrentWifiNetwork() {
        if (connectivityManager == null) return null;
        Network activeNetwork = connectivityManager.getActiveNetwork();
        NetworkCapabilities activeCapabilities = activeNetwork == null
                ? null : connectivityManager.getNetworkCapabilities(activeNetwork);
        if (activeCapabilities != null
                && activeCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            return activeNetwork;
        }
        List<Network> networks = Arrays.asList(connectivityManager.getAllNetworks());
        for (Network network : networks) {
            NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
            if (capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                return network;
            }
        }
        return null;
    }

    private String getWifiPermissionAlias() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "nearbyWifi" : "wifiLocation";
    }

    private boolean hasWifiReadPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return getContext().checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)
                    == PackageManager.PERMISSION_GRANTED;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return getContext().checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
        }
        return true;
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
        Network wifiNetwork = findCurrentWifiNetwork();
        NetworkCapabilities capabilities = wifiNetwork == null || connectivityManager == null
                ? null : connectivityManager.getNetworkCapabilities(wifiNetwork);
        boolean isWifi = capabilities != null
                && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
        JSObject event = new JSObject();
        event.put("isWifi", isWifi);
        event.put("ssid", isWifi ? extractSsid(capabilities) : "");
        notifyListeners("wifiNetworkChanged", event);
    }

    @Override
    protected void handleOnDestroy() {
        if (connectivityManager != null && boundNetwork != null) {
            connectivityManager.bindProcessToNetwork(null);
            boundNetwork = null;
        }
        if (wifiNetworkCallback != null && connectivityManager != null) {
            try {
                connectivityManager.unregisterNetworkCallback(wifiNetworkCallback);
            } catch (IllegalArgumentException e) {
                Log.w(TAG, "Wi-Fi network callback was already unregistered", e);
            }
            wifiNetworkCallback = null;
        }
        super.handleOnDestroy();
    }
}
