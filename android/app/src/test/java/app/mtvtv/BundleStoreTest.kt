package app.mtvtv

import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import java.security.MessageDigest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BundleStoreTest {

    private val base = "https://usuario.github.io/mtv-tv-app/"
    private lateinit var dir: File

    @Before
    fun criaPasta() {
        dir = createTempDir("bundle-store")
    }

    @After
    fun apagaPasta() {
        dir.deleteRecursively()
    }

    private fun sha(bytes: ByteArray) =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    /** Servidor falso: url -> bytes; ausente = 404. Guarda as urls pedidas. */
    private class FakeDownloader(val responses: MutableMap<String, ByteArray>) : Downloader {
        val requested = mutableListOf<String>()
        override fun fetch(url: String, maxBytes: Long): ByteArray {
            requested += url
            return responses[url] ?: throw FileNotFoundException(url)
        }
    }

    /** Publica [files] como [version] no servidor falso. */
    private fun publish(server: FakeDownloader, version: String, files: Map<String, String>, hashOverride: Map<String, String> = emptyMap()) {
        val entries = files.entries.joinToString(",") { (path, text) ->
            val bytes = text.toByteArray()
            """{"path":"$path","sha256":"${hashOverride[path] ?: sha(bytes)}","size":${bytes.size}}"""
        }
        server.responses[base + "manifest.json"] = """{"version":"$version","minShell":1,"files":[$entries]}""".toByteArray()
        files.forEach { (path, text) -> server.responses[base + path] = text.toByteArray() }
    }

    private fun store(server: Downloader) = BundleStore(dir, server, shellVersion = 1)

    private val v1 = "site-20261114-120000"
    private val v2 = "site-20261114-130000"
    private val v3 = "site-20261114-140000"

    @Test
    fun semNadaInstaladoNaoHaVersaoAtual() {
        assertNull(store(FakeDownloader(mutableMapOf())).currentDir())
    }

    @Test
    fun baixaOPacoteETrocaOPonteiro() {
        val server = FakeDownloader(mutableMapOf())
        publish(server, v1, mapOf("index.html" to "<html>1</html>", "assets/app.js" to "js1"))
        val s = store(server)

        assertEquals(BundleStore.Result.Updated(v1), s.checkAndUpdate(base))

        assertEquals(v1, s.currentVersion())
        assertEquals("<html>1</html>", File(s.currentDir()!!, "index.html").readText())
        assertEquals("js1", File(s.currentDir()!!, "assets/app.js").readText())
        assertEquals(setOf(v1, "current"), dir.list()!!.toSet())
    }

    @Test
    fun hashErradoNaoTrocaOPonteiroELimpaOTemporario() {
        val server = FakeDownloader(mutableMapOf())
        publish(server, v1, mapOf("index.html" to "ok"))
        val s = store(server)
        s.checkAndUpdate(base)
        publish(server, v2, mapOf("index.html" to "novo"), hashOverride = mapOf("index.html" to "0".repeat(64)))

        assertTrue(s.checkAndUpdate(base) is BundleStore.Result.Failed)

        assertEquals(v1, s.currentVersion())
        assertEquals(setOf(v1, "current"), dir.list()!!.toSet())
    }

    @Test
    fun tamanhoDiferenteDoManifestoFalha() {
        val server = FakeDownloader(mutableMapOf())
        publish(server, v1, mapOf("index.html" to "abc"))
        server.responses[base + "index.html"] = "abcd".toByteArray()

        assertTrue(store(server).checkAndUpdate(base) is BundleStore.Result.Failed)
        assertNull(store(server).currentDir())
        assertTrue(dir.list()!!.isEmpty())
    }

    @Test
    fun manifestoAusenteOuMesmaVersaoNaoFazNada() {
        val server = FakeDownloader(mutableMapOf())
        val s = store(server)
        assertEquals(BundleStore.Result.NothingToDo, s.checkAndUpdate(base))

        publish(server, v1, mapOf("index.html" to "ok"))
        s.checkAndUpdate(base)
        server.requested.clear()
        assertEquals(BundleStore.Result.NothingToDo, s.checkAndUpdate(base))
        assertEquals(listOf(base + "manifest.json"), server.requested)
    }

    @Test
    fun erroDeRedeNoManifestoNaoFazNada() {
        val failing = object : Downloader {
            override fun fetch(url: String, maxBytes: Long): ByteArray = throw IOException("sem rede")
        }
        assertEquals(BundleStore.Result.NothingToDo, store(failing).checkAndUpdate(base))
    }

    @Test
    fun reaproveitaArquivosIguaisCopiandoEmVezDeBaixar() {
        val server = FakeDownloader(mutableMapOf())
        publish(server, v1, mapOf("index.html" to "um", "big.js" to "grande"))
        val s = store(server)
        s.checkAndUpdate(base)
        publish(server, v2, mapOf("index.html" to "dois", "big.js" to "grande"))
        server.requested.clear()

        assertEquals(BundleStore.Result.Updated(v2), s.checkAndUpdate(base))

        assertEquals(listOf(base + "manifest.json", base + "index.html"), server.requested)
        assertEquals("grande", File(s.currentDir()!!, "big.js").readText())
        assertEquals("dois", File(s.currentDir()!!, "index.html").readText())
    }

    @Test
    fun mantemSoAAtualEAAnterior() {
        val server = FakeDownloader(mutableMapOf())
        val s = store(server)
        for ((i, v) in listOf(v1, v2, v3).withIndex()) {
            publish(server, v, mapOf("index.html" to "v$i"))
            s.checkAndUpdate(base)
        }
        assertEquals(setOf(v2, v3, "current"), dir.list()!!.toSet())
        assertEquals(v3, s.currentVersion())
    }

    @Test
    fun ponteiroParaPastaSemIndexNaoValeEApagaTemporariosVelhos() {
        File(dir, "current").writeText(v1)
        File(dir, v1).mkdirs()
        File(dir, ".tmp-site-20200101-000000").mkdirs()
        val server = FakeDownloader(mutableMapOf())
        val s = store(server)
        assertNull(s.currentDir())

        publish(server, v2, mapOf("index.html" to "ok"))
        s.checkAndUpdate(base)

        assertEquals(v2, s.currentVersion())
        assertFalse(File(dir, ".tmp-site-20200101-000000").exists())
    }

    @Test
    fun recusaUrlQueNaoSejaHttps() {
        val server = FakeDownloader(mutableMapOf())
        assertEquals(BundleStore.Result.NothingToDo, store(server).checkAndUpdate("http://x.test/"))
        assertTrue(server.requested.isEmpty())
    }
}
