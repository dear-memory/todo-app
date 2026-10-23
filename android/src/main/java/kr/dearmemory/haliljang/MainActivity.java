package kr.dearmemory.haliljang;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.speech.RecognizerIntent;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.net.Uri;
import android.widget.Toast;
import android.view.Window;
import java.util.ArrayList;
import org.json.JSONObject;

/**
 * Lightweight native Android shell for the existing, independently hosted todo app.
 * All task CRUD, login, and synchronization remain on the existing Firebase-backed site.
 */
public class MainActivity extends Activity {
    private static final String SITE = "https://dear-memory.github.io/todo-app/";
    private static final int VOICE_REQUEST_CODE = 9023;
    private WebView webView;
    private boolean voiceInProgress = false;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.WHITE);
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
            | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        );

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.addJavascriptInterface(new NativeSpeechBridge(), "HaliljangNative");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("https".equals(url.getScheme())
                    && "dear-memory.github.io".equals(url.getHost())
                    && url.getPath() != null && url.getPath().startsWith("/todo-app/")) {
                    return false;
                }
                if ("https".equals(url.getScheme()) || "http".equals(url.getScheme())) {
                    try {
                        Intent browser = new Intent(Intent.ACTION_VIEW, url);
                        startActivity(browser);
                    } catch (Exception ignored) {
                        Toast.makeText(MainActivity.this, "링크를 열 수 없습니다.", Toast.LENGTH_SHORT).show();
                    }
                }
                return true;
            }
        });
        if (state == null) webView.loadUrl(SITE);
        else webView.restoreState(state);
    }

    public class NativeSpeechBridge {
        @JavascriptInterface
        public void startSpeech() {
            runOnUiThread(() -> openSpeechRecognizer());
        }
    }

    private void openSpeechRecognizer() {
        if (voiceInProgress || webView == null) return;
        if (webView.getUrl() == null || !webView.getUrl().startsWith(SITE)) return;
        voiceInProgress = true;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ko-KR");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "할 일을 말씀해 주세요.");
        try {
            startActivityForResult(intent, VOICE_REQUEST_CODE);
        } catch (Exception e) {
            voiceInProgress = false;
            nativeSpeechError("이 기기에 음성 인식 앱이 없습니다.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != VOICE_REQUEST_CODE) return;
        voiceInProgress = false;
        if (resultCode != RESULT_OK || data == null) {
            nativeSpeechError("음성 입력이 취소됐습니다.");
            return;
        }
        ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (results == null || results.isEmpty() || results.get(0).trim().isEmpty()) {
            nativeSpeechError("인식된 음성이 없습니다.");
            return;
        }
        String value = JSONObject.quote(results.get(0));
        webView.evaluateJavascript(
            "document.dispatchEvent(new CustomEvent('haliljang-native-speech',{detail:{text:" + value + "}}));", null
        );
    }

    private void nativeSpeechError(String message) {
        if (webView == null) return;
        webView.evaluateJavascript(
            "document.dispatchEvent(new CustomEvent('haliljang-native-speech-error',{detail:{message:"+
            JSONObject.quote(message) + "}}));", null
        );
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("HaliljangNative");
            webView.destroy();
        }
        super.onDestroy();
    }
}
