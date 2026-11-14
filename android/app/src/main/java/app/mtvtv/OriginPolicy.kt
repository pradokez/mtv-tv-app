package app.mtvtv

import java.net.URI
import java.net.URISyntaxException

/**
 * Política de origem da casca: decide para quais URLs a WebView pode navegar e quais origens
 * podem chamar a ponte `MtvTv.exitApp()`. Kotlin puro (sem `android.*`) para rodar em teste JVM.
 *
 * O domínio e o caminho base do app hospedado vêm só pelo construtor. O site é público (sem
 * token), mas o GitHub Pages serve vários sites no mesmo domínio: vale só o caminho base,
 * para a casca não navegar para outro repositório do mesmo `github.io`.
 *
 * @param hostedBaseUrl URL base do app hospedado, `https://<domínio><caminho>`, ex.:
 *   `https://usuario.github.io/repo/` (barra final opcional; caminho vazio = raiz do domínio).
 * @throws IllegalArgumentException se a base não for https, não tiver host, tiver credenciais
 *   na URL, porta diferente da padrão ou `%2e`/`%2f`/`%5c` no caminho.
 */
class OriginPolicy(hostedBaseUrl: String) {

    private val hostedHost: String

    /** Caminho base sem a barra final: `/repo`, ou vazio quando o app está na raiz do domínio. */
    private val hostedPrefix: String

    init {
        val base = parse(hostedBaseUrl)
            ?: throw IllegalArgumentException("URL base do app hospedado inválida")
        require(isPlainHttps(base)) { "URL base precisa ser https, sem credenciais nem porta" }
        val path = base.rawPath.orEmpty()
        require(!ENCODED_PATH_TRICKS.containsMatchIn(path)) {
            "URL base com sequência codificada no caminho"
        }
        val segments = path.trim('/')
        hostedHost = base.host.lowercase()
        hostedPrefix = if (segments.isEmpty()) "" else "/$segments"
    }

    /** A casca pode navegar para [url]: app hospedado (dentro do caminho base) ou player do YouTube. */
    fun canNavigate(url: String?): Boolean = isHosted(url) || isYoutube(url)

    /** [url] pode chamar `MtvTv.exitApp()`: só o app hospedado. */
    fun canCallExitApp(url: String?): Boolean = isHosted(url)

    private fun isHosted(url: String?): Boolean {
        val uri = parse(url) ?: return false
        if (!isPlainHttps(uri) || uri.host.lowercase() != hostedHost) return false
        // rawPath: o caminho como o navegador/servidor o vê. `path` (decodificado) deixaria
        // `/repo%2F..%2Foutro` parecer estar dentro do caminho base.
        val path = uri.rawPath.orEmpty()
        if (ENCODED_PATH_TRICKS.containsMatchIn(path)) return false
        // Base na raiz do domínio: qualquer caminho vale (já normalizado, sem `..`).
        return hostedPrefix.isEmpty() || path == hostedPrefix || path.startsWith("$hostedPrefix/")
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
        /**
         * `%2e` (ponto), `%2f` (barra) e `%5c` (barra invertida) no caminho: o navegador trata
         * `%2e%2e` como `..` e alguns servidores decodificam `%2f`, mas `URI.normalize()` não
         * enxerga nenhum dos dois. Recusa em vez de tentar adivinhar.
         */
        val ENCODED_PATH_TRICKS = Regex("%(2e|2f|5c)", RegexOption.IGNORE_CASE)

        /** Hosts usados por `web/src/player/youtube-player.ts` e pelo CSP de `web/index.html`. */
        val YOUTUBE_HOSTS = setOf("www.youtube.com", "www.youtube-nocookie.com")
    }
}
