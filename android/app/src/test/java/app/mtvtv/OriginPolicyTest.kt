package app.mtvtv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OriginPolicyTest {

    private val policy = OriginPolicy("https://usuario.github.io/mtv-tv-app/")

    @Test
    fun permiteNavegarParaOAppHospedado() {
        assertTrue(policy.canNavigate("https://usuario.github.io/mtv-tv-app"))
        assertTrue(policy.canNavigate("https://usuario.github.io/mtv-tv-app/"))
        assertTrue(policy.canNavigate("https://usuario.github.io/mtv-tv-app/index.html?a=1#x"))
        assertTrue(policy.canNavigate("https://usuario.github.io/mtv-tv-app/catalog.json"))
        assertTrue(policy.canNavigate("https://usuario.github.io/mtv-tv-app/a/../catalog.json"))
    }

    @Test
    fun recusaOutrosCaminhosDoMesmoDominio() {
        assertFalse(policy.canNavigate("https://usuario.github.io"))
        assertFalse(policy.canNavigate("https://usuario.github.io/"))
        assertFalse(policy.canNavigate("https://usuario.github.io/outro-repo/"))
        assertFalse(policy.canNavigate("https://usuario.github.io/index.html"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app-parecido/"))
        assertFalse(policy.canNavigate("https://usuario.github.io/MTV-TV-APP/"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app/../outro/"))
        assertFalse(policy.canNavigate("https://usuario.github.io/outro/../../mtv-tv-appx"))
        assertFalse(policy.canCallExitApp("https://usuario.github.io/outro-repo/"))
        assertFalse(policy.canCallExitApp("https://usuario.github.io/"))
    }

    @Test
    fun recusaCaminhoCodificadoQueEscapaDoCaminhoBase() {
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app%2F..%2Foutro"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app/%2e%2e/outro"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app/%2E%2E/outro"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app/a%2fb"))
        assertFalse(policy.canNavigate("https://usuario.github.io/mtv-tv-app/a%5Cb"))
        assertFalse(policy.canCallExitApp("https://usuario.github.io/mtv-tv-app/%2e%2e/outro"))
    }

    @Test
    fun permiteNavegarParaOPlayerDoYoutube() {
        assertTrue(policy.canNavigate("https://www.youtube.com/embed/abc"))
        assertTrue(policy.canNavigate("https://www.youtube-nocookie.com/embed/abc"))
    }

    @Test
    fun recusaDominiosParecidosComOHospedado() {
        assertFalse(policy.canNavigate("https://usuario.github.io.evil.com"))
        assertFalse(policy.canNavigate("https://evil-usuario.github.io"))
        assertFalse(policy.canNavigate("https://usuario.github.io@evil.com"))
        assertFalse(policy.canNavigate("https://evil.com@usuario.github.io"))
        assertFalse(policy.canNavigate("https://usuario.github.io:8443"))
    }

    @Test
    fun recusaDominiosParecidosComOYoutube() {
        assertFalse(policy.canNavigate("https://youtube.com.evil.com/embed/abc"))
        assertFalse(policy.canNavigate("https://www.youtube.com.evil.com/embed/abc"))
        assertFalse(policy.canNavigate("https://m.youtube.com/embed/abc"))
        assertFalse(policy.canNavigate("https://www.youtube.com@evil.com/embed/abc"))
    }

    @Test
    fun recusaEsquemasQueNaoSejamHttps() {
        assertFalse(policy.canNavigate("http://usuario.github.io"))
        assertFalse(policy.canNavigate("http://www.youtube.com/embed/abc"))
        assertFalse(policy.canNavigate("file:///android_asset/web/index.html"))
        assertFalse(policy.canNavigate("javascript:alert(1)"))
        assertFalse(policy.canNavigate("data:text/html,<h1>oi</h1>"))
        assertFalse(policy.canNavigate("about:blank"))
    }

    @Test
    fun recusaUrlNulaVaziaOuMalformadaSemLancarExcecao() {
        assertFalse(policy.canNavigate(null))
        assertFalse(policy.canNavigate(""))
        assertFalse(policy.canNavigate("   "))
        assertFalse(policy.canNavigate("https://usuario.github.io /x"))
        assertFalse(policy.canNavigate("https://"))
        assertFalse(policy.canNavigate("não é url"))
        assertFalse(policy.canCallExitApp(null))
        assertFalse(policy.canCallExitApp("https://usuario.github.io/a b"))
    }

    @Test
    fun recusaHostComPontoFinalOuNaoAscii() {
        assertFalse(policy.canNavigate("https://usuario.github.io."))
        assertFalse(policy.canNavigate("https://www.youtube.com./embed/abc"))
        assertFalse(policy.canNavigate("https://mtv.exämple.pages.dev"))
    }

    @Test
    fun ignoraMaiusculasNoEsquemaENoHost() {
        assertTrue(policy.canNavigate("HTTPS://Usuario.GitHub.IO/mtv-tv-app/"))
        assertTrue(policy.canNavigate("https://usuario.github.io:443/mtv-tv-app/"))
        assertTrue(policy.canNavigate("https://WWW.YouTube.com/embed/abc"))
    }

    @Test
    fun soOAppHospedadoPodeChamarExitApp() {
        assertTrue(policy.canCallExitApp("https://usuario.github.io/mtv-tv-app/"))
        assertTrue(policy.canCallExitApp("https://usuario.github.io/mtv-tv-app/index.html#x"))
        assertFalse(policy.canCallExitApp("https://www.youtube.com/embed/abc"))
        assertFalse(policy.canCallExitApp("https://www.youtube-nocookie.com/embed/abc"))
        assertFalse(policy.canCallExitApp("https://evil.com"))
        assertFalse(policy.canCallExitApp("http://usuario.github.io"))
        assertFalse(policy.canCallExitApp("file:///android_asset/web/index.html"))
        assertFalse(policy.canCallExitApp("javascript:MtvTv.exitApp()"))
    }

    @Test
    fun aceitaBaseComOuSemBarraFinal() {
        val semBarra = OriginPolicy("https://usuario.github.io/mtv-tv-app")
        assertTrue(semBarra.canNavigate("https://usuario.github.io/mtv-tv-app/a"))
        assertFalse(semBarra.canNavigate("https://usuario.github.io/a"))
        assertFalse(semBarra.canNavigate("https://evil.com/mtv-tv-app/a"))
    }

    @Test
    fun baseNaRaizDoDominioAceitaQualquerCaminho() {
        val raiz = OriginPolicy("https://mtv.example.pages.dev/")
        assertTrue(raiz.canNavigate("https://mtv.example.pages.dev"))
        assertTrue(raiz.canNavigate("https://mtv.example.pages.dev/a/b"))
        assertFalse(raiz.canNavigate("https://mtv.example.pages.dev/%2e%2e/a"))
        assertFalse(raiz.canNavigate("https://evil.com/a"))
    }

    @Test
    fun baseComVariosSegmentos() {
        val aninhada = OriginPolicy("https://usuario.github.io/a/b/")
        assertTrue(aninhada.canNavigate("https://usuario.github.io/a/b/index.html"))
        assertFalse(aninhada.canNavigate("https://usuario.github.io/a/"))
        assertFalse(aninhada.canNavigate("https://usuario.github.io/a/bc"))
    }

    @Test
    fun construtorRecusaBaseInvalida() {
        val invalidas = listOf(
            "",
            "não é url",
            "http://usuario.github.io",
            "file://",
            "https://",
            "https://usuario.github.io/mtv-tv-app/%2e%2e/outro",
            "https://usuario.github.io/mtv-tv-app%2Fx",
            "https://usuario@usuario.github.io",
            "https://usuario.github.io:8443",
        )
        for (base in invalidas) {
            try {
                OriginPolicy(base)
                fail("devia recusar a base: '$base'")
            } catch (esperado: IllegalArgumentException) {
                // ok
            }
        }
    }
}
