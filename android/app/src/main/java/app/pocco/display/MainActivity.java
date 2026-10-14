package app.pocco.display;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OutputFolderPlugin.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        int darkColor = Color.parseColor("#0b0d10");
        window.setStatusBarColor(darkColor);
        window.setNavigationBarColor(darkColor);
        window.setBackgroundDrawable(new ColorDrawable(darkColor));

        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, window.getDecorView());
        insetsController.setAppearanceLightStatusBars(false);
        insetsController.setAppearanceLightNavigationBars(false);
    }
}
