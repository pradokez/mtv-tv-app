package app.mtvtv

import java.net.URI
import java.net.URISyntaxException

/**
 * Política de origem da casca: decide para quais URLs a WebView pode navegar e quais origens
 * podem chamar a ponte `MtvTv.exitApp()`. Kotlin puro (sem `android.*`) para rodar em teste JVM.
 *
 * O domínio hospedado e o token vêm só pelo construtor; nenhum valor real fica no código.
 *
 * @param hostedBaseUrl URL base do app hospedado, `https://<domínio>/<token>` (barra final opcional).
 * @throws IllegalArgumentException se a base não for https, não tiver host, não tiver o token
 *   no caminho, tiver credenciais na URL ou usar porta diferente da padrão.
 */
class OriginPolicy(hostedBaseUrl: String) {

    private val hostedHost: String
    private val hostedPrefix: String

    init {
        val base = parse(hostedBaseUrl)
            ?: throw IllegalArgumentException("URL base do app hospedado inválida")
        require(isPlainHttps(base)) { "URL base precisa ser https, sem credenciais nem porta" }
        val segments = base.path.orEmpty().trim('/')
        require(segments.isNotEmpty() && !segments.contains('/')) {
            "URL base precisa terminar no token: https://<domínio>/<token>"
        }
        hostedHost = base.host.lowercase()
        hostedPrefix = "/$segments"
    }

    /** A casca pode navegar para [url]: app hospedado (com o token) ou player do YouTube. */
    fun canNavigate(url: String?): Boolean = isHosted(url) || isYoutube(url)

    /** [url] pode chamar `MtvTv.exitApp()`: só o app hospedado. */
    fun canCallExitApp(url: String?): Boolean = isHosted(url)

    private fun isHosted(url: String?): Boolean {
        val uri = parse(url) ?: return false
        if (!isPlainHttps(uri) || uri.host.lowercase() != hostedHost) return false
        val path = uri.path.orEmpty()
        return path == hostedPrefix || path.startsWith("$hostedPrefix/")
    }

    private fun isYoutube(url: String?): Boolean {
        val uri = parse(url) ?: return false
        return isPlainHttps(uri) && uri.host.lowercase() in YOUTUBE_HOSTS
    }

    /** https, com host, sem credenciais e na porta padrão. */
    private fun isPlainHttps(uri: URI): Boolean =
        uri.scheme.equals("https", ignoreCase = true) &&
            !uri.host.isNullOrEmpty() &&
            uri.rawUserInfo == null &&
            (uri.port == -1 || uri.port == 443)

    /** Interpreta e normaliza (resolve `..`); `null` se nula, vazia ou malformada. */
    private fun parse(url: String?): URI? {
        if (url.isNullOrBlank()) return null
        return try {
            URI(url).normalize()
        } catch (e: URISyntaxException) {
            null
        }
    }

    private companion object {
        /** Hosts usados por `web/src/player/youtube-player.ts` e pelo CSP de `web/index.html`. */
        val YOUTUBE_HOSTS = setOf("www.youtube.com", "www.youtube-nocookie.com")
    }
}
