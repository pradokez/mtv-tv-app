package app.mtvtv

/**
 * Regras da casca que não dependem do Android: que navegação bloquear, quando a página pode
 * fechar o app, quando mostrar o aviso de falha e o que fazer com as teclas enquanto ele aparece.
 * Kotlin puro (sem `android.*`) para rodar em teste JVM; a `MainActivity` só liga os eventos.
 */
class ShellState(private val origin: OriginPolicy) {

    /** `true` enquanto a tela de aviso local está no lugar do app hospedado. */
    var noticeVisible: Boolean = false
        private set

    /**
     * A navegação para [url] deve ser barrada. Só o frame principal é policiado: os frames
     * internos são o player do YouTube, que carrega o que precisa, e o CSP do app hospedado
     * já limita `frame-src` ao YouTube.
     */
    fun shouldBlockNavigation(url: String?, isMainFrame: Boolean): Boolean =
        isMainFrame && !origin.canNavigate(url)

    /**
     * A ponte `MtvTv.exitApp()` pode fechar o app: a página principal ([mainFrameUrl]) é do app
     * hospedado e o aviso não está na tela. O aviso nunca sai pela ponte, só pelas teclas.
     */
    fun canExitFromPage(mainFrameUrl: String?): Boolean =
        !noticeVisible && origin.canCallExitApp(mainFrameUrl)

    /** A casca vai (re)carregar o app hospedado: o aviso deixa de valer. */
    fun onLoadRequested() {
        noticeVisible = false
    }

    /**
     * O frame principal falhou (erro de rede, HTTP de erro ou tempo esgotado).
     * @return `true` se o aviso deve ser mostrado agora; `false` se ele já está na tela.
     */
    fun onLoadFailed(): Boolean {
        if (noticeVisible) return false
        noticeVisible = true
        return true
    }

    /**
     * O que fazer com uma tecla do controle. Sem aviso, ela vai para o app web, que decide.
     * Com o aviso, Voltar e OK (o botão Sair está em foco) fecham o app no primeiro aperto e
     * o resto é engolido, sem chamar `window.dispatchTvKey`, que não existe na página de aviso.
     */
    fun keyAction(key: RemoteKey, isDown: Boolean, isRepeat: Boolean): KeyAction {
        if (!noticeVisible) return KeyAction.FORWARD
        val exits = key == RemoteKey.BACK || key == RemoteKey.OK
        return if (exits && isDown && !isRepeat) KeyAction.EXIT else KeyAction.CONSUME
    }
}

/** Papel da tecla para a casca; o resto do mapeamento (setas, CH+/CH-...) é do app web. */
enum class RemoteKey { BACK, OK, OTHER }

enum class KeyAction {
    /** Repassa ao app web por `window.dispatchTvKey`. */
    FORWARD,

    /** Fecha o app. */
    EXIT,

    /** Engole a tecla. */
    CONSUME,
}

/** Textos da tela de aviso local (`assets/aviso.html`). */
object Notice {
    const val OFFLINE = "Sem conexão com a internet"
    const val FAILED = "Não foi possível abrir o MTV TV"

    /** Marca no HTML do aviso trocada pelo texto principal. */
    const val PLACEHOLDER = "{{texto}}"

    fun text(online: Boolean): String = if (online) FAILED else OFFLINE

    fun render(template: String, online: Boolean): String = template.replace(PLACEHOLDER, text(online))
}

/**
 * Tempos e critérios de carga e de nova tentativa. Intervalo e limite da sondagem são os do
 * lançador da Tizen (`tizen/launcher/index.html`); o prazo de carga e o critério por status HTTP
 * são só da Android, que sonda com HEAD e vê o status (a Tizen usa `fetch` `no-cors`, sem status).
 */
object Retry {
    /** Intervalo entre tentativas enquanto o aviso está na tela. */
    const val INTERVAL_MS = 10_000L

    /** Limite da sondagem do app hospedado antes de recarregar a WebView. */
    const val PROBE_TIMEOUT_MS = 8_000

    /** Sem a página aparecer nesse tempo, a carga é tratada como falha. */
    const val LOAD_TIMEOUT_MS = 20_000L

    /**
     * A sondagem só libera a recarga com resposta de sucesso: um 404 (site fora do ar) faria a
     * WebView carregar, falhar e piscar a cada tentativa.
     */
    fun isProbeOk(httpStatus: Int): Boolean = httpStatus in 200..399

    /** Resposta HTTP do frame principal que conta como falha de carga. */
    fun isLoadFailure(httpStatus: Int): Boolean = httpStatus >= 400
}
