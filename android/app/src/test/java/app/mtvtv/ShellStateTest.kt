package app.mtvtv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellStateTest {

    private val app = "https://usuario.github.io/mtv-tv-app/"
    private val state = ShellState(OriginPolicy(app))

    @Test
    fun deixaOFramePrincipalIrParaOAppEOYoutube() {
        assertFalse(state.shouldBlockNavigation(app, isMainFrame = true))
        assertFalse(state.shouldBlockNavigation("${app}index.html?canal=2", isMainFrame = true))
        assertFalse(state.shouldBlockNavigation("https://www.youtube.com/watch?v=x", isMainFrame = true))
    }

    @Test
    fun barraOFramePrincipalForaDaPolitica() {
        assertTrue(state.shouldBlockNavigation("https://usuario.github.io/outro-repo/", isMainFrame = true))
        assertTrue(state.shouldBlockNavigation("https://exemplo.com/", isMainFrame = true))
        assertTrue(state.shouldBlockNavigation("http://usuario.github.io/mtv-tv-app/", isMainFrame = true))
        assertTrue(state.shouldBlockNavigation("intent://abrir#Intent;end", isMainFrame = true))
        assertTrue(state.shouldBlockNavigation("about:blank", isMainFrame = true))
        assertTrue(state.shouldBlockNavigation(null, isMainFrame = true))
    }

    @Test
    fun naoPoliciaOsFramesInternosDoPlayer() {
        assertFalse(state.shouldBlockNavigation("https://accounts.google.com/x", isMainFrame = false))
    }

    @Test
    fun saiPelaPonteSoComOAppHospedadoNaPaginaPrincipal() {
        assertTrue(state.canExitFromPage(app))
        assertTrue(state.canExitFromPage("${app}#guia"))
        assertFalse(state.canExitFromPage("https://www.youtube.com/watch?v=x"))
        assertFalse(state.canExitFromPage("https://usuario.github.io/outro-repo/"))
        assertFalse(state.canExitFromPage("about:blank"))
        assertFalse(state.canExitFromPage("data:text/html,oi"))
        assertFalse(state.canExitFromPage(null))
    }

    @Test
    fun aPonteNaoSaiComOAvisoNaTela() {
        state.onLoadFailed()
        // Mesmo que a WebView ainda informe a URL do app (carga que falhou), o aviso não usa a ponte.
        assertFalse(state.canExitFromPage(app))
        state.onLoadRequested()
        assertTrue(state.canExitFromPage(app))
    }

    @Test
    fun mostraOAvisoUmaVezPorFalha() {
        assertFalse(state.noticeVisible)
        assertTrue(state.onLoadFailed())
        assertTrue(state.noticeVisible)
        assertFalse(state.onLoadFailed())
        state.onLoadRequested()
        assertFalse(state.noticeVisible)
        assertTrue(state.onLoadFailed())
    }

    @Test
    fun tentaDeNovoAoVoltarARedeSoComOAvisoNaTela() {
        assertFalse(state.shouldRetryOnNetworkAvailable())
        state.onLoadFailed()
        assertTrue(state.shouldRetryOnNetworkAvailable())
    }

    @Test
    fun semAvisoAsTeclasVaoParaOAppWeb() {
        for (key in RemoteKey.values()) {
            assertEquals(KeyAction.FORWARD, state.keyAction(key, isDown = true, isRepeat = false))
            assertEquals(KeyAction.FORWARD, state.keyAction(key, isDown = false, isRepeat = false))
        }
    }

    @Test
    fun comAvisoVoltarEOkSaemEORestoEEngolido() {
        state.onLoadFailed()
        assertEquals(KeyAction.EXIT, state.keyAction(RemoteKey.BACK, isDown = true, isRepeat = false))
        assertEquals(KeyAction.EXIT, state.keyAction(RemoteKey.OK, isDown = true, isRepeat = false))
        assertEquals(KeyAction.CONSUME, state.keyAction(RemoteKey.BACK, isDown = false, isRepeat = false))
        assertEquals(KeyAction.CONSUME, state.keyAction(RemoteKey.BACK, isDown = true, isRepeat = true))
        assertEquals(KeyAction.CONSUME, state.keyAction(RemoteKey.OTHER, isDown = true, isRepeat = false))
    }

    @Test
    fun textoDoAvisoDependeDaRede() {
        assertEquals("Sem conexão com a internet", Notice.text(online = false))
        assertEquals("Não foi possível abrir o MTV TV", Notice.text(online = true))
        assertEquals("<p>Sem conexão com a internet</p>", Notice.render("<p>{{texto}}</p>", online = false))
    }

    @Test
    fun sondagemSoLiberaARecargaComSucesso() {
        assertTrue(Retry.isProbeOk(200))
        assertTrue(Retry.isProbeOk(304))
        assertFalse(Retry.isProbeOk(404))
        assertFalse(Retry.isProbeOk(503))
        assertFalse(Retry.isProbeOk(-1))
    }

    @Test
    fun httpDeErroNoFramePrincipalEFalha() {
        assertFalse(Retry.isLoadFailure(200))
        assertFalse(Retry.isLoadFailure(304))
        assertTrue(Retry.isLoadFailure(404))
        assertTrue(Retry.isLoadFailure(500))
    }
}
