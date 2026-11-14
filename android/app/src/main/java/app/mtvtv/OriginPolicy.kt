package app.mtvtv

import java.net.URI
import java.net.URISyntaxException

/**
 * Política de origem da casca: decide para quais URLs a WebView pode navegar e quais origens
 * podem chamar a ponte `MtvTv.exitApp()`. Kotlin puro (sem `android.*`) para rodar em teste JVM.
 *
 * O domínio hospedado vem só pelo construtor. O site é público: vale a origem inteira
 * (qualquer caminho), sem token.
 *
 * @param hostedBaseUrl URL base do app hospedado, `https://<domínio>/` (barra final opcional).
 * @throws IllegalArgumentException se a base não for https, não tiver host, tiver caminho,
 *   credenciais na URL ou porta diferente da padrão.
 */
class OriginPolicy(hostedBaseUrl: String) {

    private val hostedHost: String

    init {
        val base = parse(hostedBaseUrl)
            ?: throw IllegalArgumentException("URL base do app hospedado inválida")
        require(isPlainHttps(base)) { "URL base precisa ser https, sem credenciais nem porta" }
        require(base.rawPath.orEmpty().trim('/').isEmpty()) {
            "URL base é só a origem: https://<domínio>/"
        }
        hostedHost = base.host.lowercase()
    }

    /** A casca pode navegar para [url]: app hospedado (qualquer caminho) ou player do YouTube. */
    fun canNavigate(url: String?): Boolean = isHosted(url) || isYoutube(url)

    /** [url] pode chamar `MtvTv.exitApp()`: só o app hospedado. */
    fun canCallExitApp(url: String?): Boolean = isHosted(url)

    private fun isHosted(url: String?): Boolean {
        val uri = parse(url) ?: return false
        return isPlainHttps(uri) && uri.host.lowercase() == hostedHost
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
