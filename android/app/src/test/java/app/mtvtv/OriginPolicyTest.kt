package app.mtvtv

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class OriginPolicyTest {

    private val policy = OriginPolicy("https://mtv.example.pages.dev/tok123")

    @Test
    fun permiteNavegarParaOAppHospedado() {
        assertTrue(policy.canNavigate("https://mtv.example.pages.dev/tok123"))
        assertTrue(policy.canNavigate("https://mtv.example.pages.dev/tok123/"))
        assertTrue(policy.canNavigate("https://mtv.example.pages.dev/tok123/index.html?a=1#x"))
    }

    @Test
    fun permiteNavegarParaOPlayerDoYoutube() {
        assertTrue(policy.canNavigate("https://www.youtube.com/embed/abc"))
        assertTrue(policy.canNavigate("https://www.youtube-nocookie.com/embed/abc"))
    }

    @Test
    fun recusaDominiosParecidosComOHospedado() {
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev.evil.com/tok123"))
        assertFalse(policy.canNavigate("https://evil-mtv.example.pages.dev/tok123"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev@evil.com/tok123"))
        assertFalse(policy.canNavigate("https://evil.com@mtv.example.pages.dev/tok123"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev:8443/tok123"))
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
        assertFalse(policy.canNavigate("http://mtv.example.pages.dev/tok123"))
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
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123 /x"))
        assertFalse(policy.canNavigate("https://"))
        assertFalse(policy.canNavigate("não é url"))
        assertFalse(policy.canCallExitApp(null))
        assertFalse(policy.canCallExitApp("https://mtv.example.pages.dev/tok 123"))
    }

    @Test
    fun recusaCaminhoSemOTokenOuComTokenParecido() {
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/outro"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123x"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok1234/index.html"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123/../outro"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/x/../../tok123/a"))
    }

    @Test
    fun recusaCaminhoCodificadoQueEscapaDoToken() {
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123%2F..%2Foutro"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/x%2F..%2Ftok123/a"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123/%2e%2e/outro"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123/%2E./outro"))
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev/tok123/a%5Cb"))
        assertFalse(policy.canCallExitApp("https://mtv.example.pages.dev/tok123/%2e%2e/outro"))
        assertTrue(policy.canNavigate("https://mtv.example.pages.dev/tok123/a%20b.html"))
    }

    @Test
    fun recusaHostComPontoFinalOuNaoAscii() {
        assertFalse(policy.canNavigate("https://mtv.example.pages.dev./tok123"))
        assertFalse(policy.canNavigate("https://www.youtube.com./embed/abc"))
        assertFalse(policy.canNavigate("https://mtv.exämple.pages.dev/tok123"))
    }

    @Test
    fun ignoraMaiusculasNoEsquemaENoHost() {
        assertTrue(policy.canNavigate("HTTPS://MTV.Example.Pages.Dev/tok123/"))
        assertTrue(policy.canNavigate("https://mtv.example.pages.dev:443/tok123/"))
        assertTrue(policy.canNavigate("https://WWW.YouTube.com/embed/abc"))
    }

    @Test
    fun soOAppHospedadoPodeChamarExitApp() {
        assertTrue(policy.canCallExitApp("https://mtv.example.pages.dev/tok123/"))
        assertTrue(policy.canCallExitApp("https://mtv.example.pages.dev/tok123/index.html#x"))
        assertFalse(policy.canCallExitApp("https://www.youtube.com/embed/abc"))
        assertFalse(policy.canCallExitApp("https://www.youtube-nocookie.com/embed/abc"))
        assertFalse(policy.canCallExitApp("https://evil.com/tok123"))
        assertFalse(policy.canCallExitApp("https://mtv.example.pages.dev/outro"))
        assertFalse(policy.canCallExitApp("http://mtv.example.pages.dev/tok123"))
        assertFalse(policy.canCallExitApp("file:///android_asset/web/index.html"))
        assertFalse(policy.canCallExitApp("javascript:MtvTv.exitApp()"))
    }

    @Test
    fun aceitaBaseComOuSemBarraFinal() {
        val comBarra = OriginPolicy("https://mtv.example.pages.dev/tok123/")
        assertTrue(comBarra.canNavigate("https://mtv.example.pages.dev/tok123"))
        assertTrue(comBarra.canNavigate("https://mtv.example.pages.dev/tok123/a"))
        assertFalse(comBarra.canNavigate("https://mtv.example.pages.dev/tok1234"))
    }

    @Test
    fun construtorRecusaBaseInvalida() {
        val invalidas = listOf(
            "",
            "não é url",
            "http://mtv.example.pages.dev/tok123",
            "file:///tok123",
            "https:///tok123",
            "https://mtv.example.pages.dev",
            "https://mtv.example.pages.dev/",
            "https://usuario@mtv.example.pages.dev/tok123",
            "https://mtv.example.pages.dev:8443/tok123",
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
