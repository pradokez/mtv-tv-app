package app.mtvtv

import android.annotation.SuppressLint
import android.app.Activity
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Casca nativa: uma Activity em tela cheia com uma única WebView que carrega o app hospedado
 * (`BuildConfig.APP_URL`, de `config/hosted.json`). Se ele não carregar, mostra o aviso local
 * (`assets/aviso.html`) e tenta de novo a cada 10 s e quando a rede volta.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private val shell = ShellState(OriginPolicy(BuildConfig.APP_URL))
    private val handler = Handler(Looper.getMainLooper())
    private val probeExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private lateinit var connectivity: ConnectivityManager
    private val noticeTemplate by lazy { assets.open(NOTICE_ASSET).bufferedReader().use { it.readText() } }

    private var resumed = false
    private var probing = false
    private var networkCallbackRegistered = false

    /** Estado de rede do texto que está no aviso; `null` sem aviso na tela. */
    private var noticeOnline: Boolean? = null

    private val retryTick = Runnable { probeAndReload() }
    private val loadTimeout = Runnable {
        Log.w(TAG, "App hospedado não apareceu em ${Retry.LOAD_TIMEOUT_MS} ms")
        webView.stopLoading()
        onMainFrameFailed()
    }

    // Callbacks na thread principal (handler no registro), como o resto do estado da casca.
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        // probeAndReload só age com o aviso na tela.
        override fun onAvailable(network: Network) {
            probeAndReload()
        }

        override fun onLost(network: Network) {
            refreshNoticeText()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        connectivity = getSystemService(ConnectivityManager::class.java)

        webView = WebView(this).apply {
            setBackgroundColor(0xFF000000.toInt())
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            isFocusable = true
            isFocusableInTouchMode = true
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                // O app hospedado e o player do YouTube são https; nada de arquivo local nem http.
                allowFileAccess = false
                allowContentAccess = false
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }
            webViewClient = ShellClient()
        }
        // "Sair" da confirmação de saída do app web: window.MtvTv.exitApp(). A WebView injeta a
        // ponte em toda página e frame; quem pode usá-la é decidido em ExitBridge.
        webView.addJavascriptInterface(ExitBridge(), "MtvTv")
        setContentView(webView)

        loadApp()
    }

    override fun onResume() {
        super.onResume()
        hideSystemBars()
        webView.onResume()
        resumed = true
        registerNetworkCallback()
        if (shell.noticeVisible) probeAndReload()
    }

    override fun onPause() {
        resumed = false
        handler.removeCallbacks(retryTick)
        unregisterNetworkCallback()
        webView.onPause()
        super.onPause()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        probeExecutor.shutdownNow()
        unregisterNetworkCallback()
        webView.destroy()
        super.onDestroy()
    }

    /**
     * Repassa as teclas do controle para o app web como KeyboardEvent. CH+/CH- (e PAGE_UP/DOWN,
     * que alguns controles enviam no lugar) não chegam ao navegador sozinhos.
     * O app web decide o que fazer com Voltar (keydown); se não retornar true, a Activity sai.
     * Com o aviso na tela, a própria casca trata Voltar e OK (Sair) e engole o resto.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val spec = KEYS[event.keyCode] ?: return super.dispatchKeyEvent(event)
        val isDown = event.action == KeyEvent.ACTION_DOWN
        when (shell.keyAction(remoteKey(event.keyCode), isDown, event.repeatCount > 0)) {
            KeyAction.EXIT -> finish()
            KeyAction.CONSUME -> Unit
            KeyAction.FORWARD -> if (!isDown || event.repeatCount == 0) forwardKey(event, spec, isDown)
        }
        return true
    }

    private fun forwardKey(event: KeyEvent, spec: KeySpec, isDown: Boolean) {
        val type = if (isDown) "keydown" else "keyup"
        val js = "window.dispatchTvKey && window.dispatchTvKey('$type','${spec.key}','${spec.code}',${spec.keyCode},${event.keyCode})"
        webView.evaluateJavascript(js) { handled ->
            if (event.keyCode == KeyEvent.KEYCODE_BACK && isDown && handled != "true") {
                finish()
            }
        }
    }

    private fun remoteKey(keyCode: Int): RemoteKey = when (keyCode) {
        KeyEvent.KEYCODE_BACK -> RemoteKey.BACK
        KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> RemoteKey.OK
        else -> RemoteKey.OTHER
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

    /** (Re)carrega o app hospedado, com prazo para a página aparecer. */
    private fun loadApp() {
        shell.onLoadRequested()
        noticeOnline = null
        handler.removeCallbacks(retryTick)
        handler.removeCallbacks(loadTimeout)
        handler.postDelayed(loadTimeout, Retry.LOAD_TIMEOUT_MS)
        webView.loadUrl(BuildConfig.APP_URL)
    }

    /** O frame principal falhou: troca pelo aviso local e agenda a próxima tentativa. */
    private fun onMainFrameFailed() {
        handler.removeCallbacks(loadTimeout)
        if (!shell.onLoadFailed()) return
        renderNotice(isOnline())
        scheduleRetry()
    }

    /**
     * Base nula: o aviso roda em `about:blank`, origem opaca, sem o localStorage do app hospedado
     * e reprovado por `canCallExitApp`. Por isso Sair é tratado nas teclas, não pela ponte.
     */
    private fun renderNotice(online: Boolean) {
        noticeOnline = online
        webView.loadDataWithBaseURL(null, Notice.render(noticeTemplate, online), "text/html", "UTF-8", null)
    }

    /** Troca o texto do aviso se a rede mudou desde que ele apareceu. */
    private fun refreshNoticeText() {
        if (!shell.noticeVisible) return
        val online = isOnline()
        if (online != noticeOnline) renderNotice(online)
    }

    private fun scheduleRetry() {
        handler.removeCallbacks(retryTick)
        if (resumed) handler.postDelayed(retryTick, Retry.INTERVAL_MS)
    }

    /**
     * Sonda o app hospedado fora da thread principal e só recarrega a WebView se ele responder:
     * recarregar às cegas trocaria o aviso pela página de erro da WebView a cada tentativa.
     */
    private fun probeAndReload() {
        if (!shell.noticeVisible || probing || !resumed) return
        probing = true
        handler.removeCallbacks(retryTick)
        val url = BuildConfig.APP_URL
        probeExecutor.execute {
            val ok = probe(url)
            handler.post {
                probing = false
                // Pausada no meio da sondagem: onResume sonda de novo.
                if (isDestroyed || !resumed || !shell.noticeVisible) return@post
                if (ok) {
                    loadApp()
                } else {
                    refreshNoticeText()
                    scheduleRetry()
                }
            }
        }
    }

    private fun probe(url: String): Boolean = try {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "HEAD"
            connection.connectTimeout = Retry.PROBE_TIMEOUT_MS
            connection.readTimeout = Retry.PROBE_TIMEOUT_MS
            connection.useCaches = false
            Retry.isProbeOk(connection.responseCode)
        } finally {
            connection.disconnect()
        }
    } catch (e: Exception) {
        false
    }

    private fun isOnline(): Boolean {
        val network = connectivity.activeNetwork ?: return false
        return connectivity.getNetworkCapabilities(network)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun registerNetworkCallback() {
        if (networkCallbackRegistered) return
        connectivity.registerDefaultNetworkCallback(networkCallback, handler)
        networkCallbackRegistered = true
    }

    private fun unregisterNetworkCallback() {
        if (!networkCallbackRegistered) return
        connectivity.unregisterNetworkCallback(networkCallback)
        networkCallbackRegistered = false
    }

    private inner class ShellClient : WebViewClient() {
        /** Só o frame principal é barrado; ver [ShellState.shouldBlockNavigation]. */
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            val block = shell.shouldBlockNavigation(url, request.isForMainFrame)
            if (block) Log.w(TAG, "Navegação barrada pela política de origem: $url")
            return block
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            if (!shell.noticeVisible) handler.removeCallbacks(loadTimeout)
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (!request.isForMainFrame) return
            Log.w(TAG, "Falha ao carregar ${request.url}: ${error.errorCode} ${error.description}")
            onMainFrameFailed()
        }

        override fun onReceivedHttpError(
            view: WebView,
            request: WebResourceRequest,
            errorResponse: WebResourceResponse,
        ) {
            if (!request.isForMainFrame || !Retry.isLoadFailure(errorResponse.statusCode)) return
            Log.w(TAG, "HTTP ${errorResponse.statusCode} ao carregar ${request.url}")
            onMainFrameFailed()
        }
    }

    /**
     * Única ação que o app web pode pedir à casca; só fecha a Activity. A WebView chama a ponte
     * fora da thread principal e não diz de que frame veio: a URL da página principal é lida na
     * thread principal, no momento de decidir, e precisa ser do app hospedado, sem o aviso na tela.
     */
    private inner class ExitBridge {
        @JavascriptInterface
        fun exitApp() {
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                if (shell.canExitFromPage(webView.url)) {
                    finish()
                } else {
                    Log.w(TAG, "exitApp() recusado para ${webView.url}")
                }
            }
        }
    }

    private data class KeySpec(val key: String, val code: String, val keyCode: Int)

    companion object {
        private const val TAG = "MtvTv"
        private const val NOTICE_ASSET = "aviso.html"

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
