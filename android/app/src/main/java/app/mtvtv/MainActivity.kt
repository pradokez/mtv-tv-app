package app.mtvtv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.util.concurrent.Executors

/**
 * Casca nativa: uma Activity em tela cheia com uma única WebView.
 *
 * O app web é servido sempre pela origem local da WebView (`appassets.androidplatform.net`):
 * o YouTube embutido não mostra anúncios nela, e o localStorage (favoritos, modo, último canal)
 * fica no mesmo lugar (#91). O conteúdo vem do pacote baixado do site publicado (ver
 * [BundleStore]) ou, sem ele, dos assets do APK (`assets/web/`), que ficam como reserva.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var store: BundleStore
    private val updater = Executors.newSingleThreadExecutor()

    /** Pasta servida na página atual (`null` = assets do APK). Fixada a cada carga do index. */
    @Volatile private var servedDir: File? = null

    /** Versão da página atual (`null` = assets do APK); decide se vale recarregar. */
    @Volatile private var servedVersion: String? = null
    private var wasPaused = false
    private var lastCheckAt = 0L

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        store = BundleStore(File(filesDir, "web"), HttpDownloader(), BuildConfig.VERSION_CODE)

        val assetLoader = WebViewAssetLoader.Builder()
            .setDomain(ASSET_HOST)
            .addPathHandler("/app/", AppPathHandler())
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
        // "Sair" da confirmação de saída do app web: window.MtvTv.exitApp().
        webView.addJavascriptInterface(ExitBridge(), "MtvTv")
        setContentView(webView)

        webView.loadUrl(START_URL)
        checkForUpdate()
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        webView.onResume()
        if (wasPaused) {
            wasPaused = false
            // A versão nova só entra aqui (ou na próxima abertura), nunca no meio de um vídeo.
            if (store.currentVersion() != servedVersion) webView.loadUrl(START_URL)
            checkForUpdate()
        }
    }

    override fun onPause() {
        wasPaused = true
        webView.onPause()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        updater.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Repassa as teclas do controle para o app web como KeyboardEvent. CH+/CH- (e PAGE_UP/DOWN,
     * que alguns controles enviam no lugar) não chegam ao navegador sozinhos.
     * O app web decide o que fazer com Voltar (keydown); se não retornar true, a Activity sai.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val spec = KEYS[event.keyCode] ?: return super.dispatchKeyEvent(event)
        val isDown = event.action == KeyEvent.ACTION_DOWN
        if (!isDown || event.repeatCount == 0) {
            val type = if (isDown) "keydown" else "keyup"
            val js = "window.dispatchTvKey && window.dispatchTvKey('$type','${spec.key}','${spec.code}',${spec.keyCode},${event.keyCode})"
            webView.evaluateJavascript(js) { handled ->
                if (event.keyCode == KeyEvent.KEYCODE_BACK && isDown && handled != "true") {
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

    /** Busca o manifesto publicado e baixa a versão nova em segundo plano (no máx. 1 vez por hora). */
    private fun checkForUpdate() {
        val now = System.currentTimeMillis()
        if (lastCheckAt != 0L && now - lastCheckAt < CHECK_INTERVAL_MS) return
        lastCheckAt = now
        val baseUrl = BuildConfig.APP_URL.let { if (it.endsWith("/")) it else "$it/" }
        updater.execute {
            try {
                store.checkAndUpdate(baseUrl, inUse = servedVersion)
            } catch (e: Exception) {
                // Atualizar é um extra: qualquer falha mantém a versão atual.
            }
        }
    }

    /**
     * Serve o caminho `/app/` (tudo abaixo dele). O `index.html` fixa a versão da página (pasta baixada ou assets do APK);
     * os demais arquivos saem da mesma versão, mesmo que uma nova chegue durante a sessão.
     */
    private inner class AppPathHandler : WebViewAssetLoader.PathHandler {
        private val assets = WebViewAssetLoader.AssetsPathHandler(this@MainActivity)

        override fun handle(path: String): WebResourceResponse? {
            if (path == "index.html") {
                val dir = store.currentDir()
                servedDir = dir
                servedVersion = dir?.name
            }
            val dir = servedDir?.takeIf { File(it, "index.html").isFile }
            return if (dir != null) {
                WebViewAssetLoader.InternalStoragePathHandler(this@MainActivity, dir).handle(path)
            } else {
                assets.handle("web/$path")
            }
        }
    }

    /** Única ação que o app web pode pedir à casca; só fecha a Activity. */
    private inner class ExitBridge {
        @JavascriptInterface
        fun exitApp() {
            runOnUiThread { finish() }
        }
    }

    private data class KeySpec(val key: String, val code: String, val keyCode: Int)

    companion object {
        private const val ASSET_HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://$ASSET_HOST/app/index.html"
        private const val CHECK_INTERVAL_MS = 60 * 60 * 1000L

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
            // Mostra a tarja com as infos do clipe.
            KeyEvent.KEYCODE_INFO to KeySpec("Info", "Info", 165),
            // Alternam o modo ao vivo/fila.
            KeyEvent.KEYCODE_MENU to KeySpec("ContextMenu", "ContextMenu", 93),
            KeyEvent.KEYCODE_PROG_YELLOW to KeySpec("ColorF2Yellow", "ColorF2Yellow", 405),
        )
    }
}
