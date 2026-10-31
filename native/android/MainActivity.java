package ru.yashagayu.kazan.demo;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public final class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state){
        registerPlugin(KazanAudioPlugin.class);registerPlugin(KazanOfflinePlugin.class);
        super.onCreate(state);
        WebView view=getBridge().getWebView();view.getSettings().setTextZoom(100);view.getSettings().setSupportZoom(false);view.getSettings().setBuiltInZoomControls(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        getOnBackPressedDispatcher().addCallback(this,new OnBackPressedCallback(true){
            @Override public void handleOnBackPressed(){
                WindowInsetsCompat insets=ViewCompat.getRootWindowInsets(view);
                if(insets!=null&&insets.isVisible(WindowInsetsCompat.Type.ime())){
                    new WindowInsetsControllerCompat(getWindow(),view).hide(WindowInsetsCompat.Type.ime());view.clearFocus();return;
                }
                view.evaluateJavascript("Boolean(window.kazanAndroidBack && window.kazanAndroidBack())",handled->{if(!"true".equals(handled))moveTaskToBack(true);});
            }
        });
    }
}
