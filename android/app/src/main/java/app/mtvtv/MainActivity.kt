package app.mtvtv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

/**
 * Casca nativa: uma Activity em tela cheia com uma única WebView que carrega o app web
 * dos assets do APK (`assets/web/index.html`).
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                // O app web só precisa dos assets locais e do player do YouTube (https).
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
            }
        }
        setContentView(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        webView.onResume()
        webView.resumeTimers()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Repassa as teclas do controle para o app web como KeyboardEvent. CH+/CH- (e PAGE_UP/DOWN,
     * que alguns controles enviam no lugar) não chegam ao navegador sozinhos.
     * O app web decide o que fazer com Voltar; se ele não tratar, a Activity sai.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val spec = KEYS[event.keyCode] ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0 || event.action == KeyEvent.ACTION_UP) {
            val type = if (event.action == KeyEvent.ACTION_DOWN) "keydown" else "keyup"
            val js = "window.dispatchTvKey && window.dispatchTvKey('$type','${spec.key}','${spec.code}',${spec.keyCode},${event.keyCode})"
            webView.evaluateJavascript(js) { handled ->
                if (event.keyCode == KeyEvent.KEYCODE_BACK && type == "keyup" && handled != "true") {
                    finish()
                }
            }
        }
        return true
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    private data class KeySpec(val key: String, val code: String, val keyCode: Int)

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        // Para apontar para o build da #2, basta substituir o conteúdo de assets/web/.
        private const val START_URL = "https://$ASSET_HOST/assets/web/index.html"

        // keyCode seguem os valores de KeyboardEvent do navegador, para o Input Mapper do app web.
        private val KEYS = mapOf(
            KeyEvent.KEYCODE_DPAD_UP to KeySpec("ArrowUp", "ArrowUp", 38),
            KeyEvent.KEYCODE_DPAD_DOWN to KeySpec("ArrowDown", "ArrowDown", 40),
            KeyEvent.KEYCODE_DPAD_LEFT to KeySpec("ArrowLeft", "ArrowLeft", 37),
            KeyEvent.KEYCODE_DPAD_RIGHT to KeySpec("ArrowRight", "ArrowRight", 39),
            KeyEvent.KEYCODE_DPAD_CENTER to KeySpec("Enter", "Enter", 13),
            KeyEvent.KEYCODE_ENTER to KeySpec("Enter", "Enter", 13),
            KeyEvent.KEYCODE_BACK to KeySpec("Escape", "Escape", 27),
            KeyEvent.KEYCODE_CHANNEL_UP to KeySpec("ChannelUp", "ChannelUp", 427),
            KeyEvent.KEYCODE_CHANNEL_DOWN to KeySpec("ChannelDown", "ChannelDown", 428),
            KeyEvent.KEYCODE_PAGE_UP to KeySpec("ChannelUp", "ChannelUp", 427),
            KeyEvent.KEYCODE_PAGE_DOWN to KeySpec("ChannelDown", "ChannelDown", 428),
        )
    }
}
