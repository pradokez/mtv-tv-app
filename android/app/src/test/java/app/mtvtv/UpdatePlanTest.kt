package app.mtvtv

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdatePlanTest {

    private val h1 = "a".repeat(64)
    private val h2 = "b".repeat(64)
    private val v1 = "site-20261114-120000"
    private val v2 = "site-20261114-130000"

    private fun manifest(
        version: String = v2,
        minShell: Int = 1,
        files: String = """{"path":"index.html","sha256":"$h1","size":10}""",
    ) = """{"version":"$version","minShell":$minShell,"files":[$files]}"""

    private fun decide(json: String, shell: Int = 1, current: String? = v1, hashes: Map<String, String> = emptyMap()) =
        UpdatePlan.decide(json, shell, current, hashes)

    @Test
    fun manifestoValidoComVersaoNovaMandaBaixarTudo() {
        val d = decide(manifest()) as UpdateDecision.Download
        assertEquals(v2, d.version)
        assertEquals(listOf("index.html"), d.fetch.map { it.path })
        assertTrue(d.reuse.isEmpty())
    }

    @Test
    fun mesmaVersaoNaoFazNada() {
        assertEquals(UpdateDecision.UpToDate, decide(manifest(version = v1)))
    }

    @Test
    fun versaoDiferenteMesmoMaisAntigaContaComoAtualizacao() {
        assertTrue(decide(manifest(version = "site-20200101-000000"), current = v1) is UpdateDecision.Download)
    }

    @Test
    fun semVersaoAtualBaixa() {
        assertTrue(decide(manifest(), current = null) is UpdateDecision.Download)
    }

    @Test
    fun cascaAntigaDemaisIgnora() {
        assertEquals(UpdateDecision.ShellTooOld, decide(manifest(minShell = 2), shell = 1))
    }

    @Test
    fun reaproveitaArquivosComOMesmoHash() {
        val files = """{"path":"index.html","sha256":"$h1","size":10},{"path":"app.js","sha256":"$h2","size":5}"""
        val d = decide(manifest(files = files), hashes = mapOf("index.html" to h1, "app.js" to h1)) as UpdateDecision.Download
        assertEquals(listOf("index.html"), d.reuse.map { it.path })
        assertEquals(listOf("app.js"), d.fetch.map { it.path })
    }

    @Test
    fun caminhosMaliciososSaoInvalidos() {
        val bad = listOf("../x", "a/../x", "./x", "a/./x", "/abs", "a//b", "a\\b", "a b", "a%2e", "", "x/", "..")
        for (path in bad) {
            val files = """{"path":"index.html","sha256":"$h1","size":1},{"path":"$path","sha256":"$h1","size":1}"""
            assertTrue("deveria recusar '$path'", decide(manifest(files = files)) is UpdateDecision.Invalid)
        }
    }

    @Test
    fun exigeIndexHtml() {
        val files = """{"path":"app.js","sha256":"$h1","size":1}"""
        assertTrue(decide(manifest(files = files)) is UpdateDecision.Invalid)
    }

    @Test
    fun recusaVersaoForaDoFormatoDaTag() {
        assertTrue(decide(manifest(version = "../x")) is UpdateDecision.Invalid)
        assertTrue(decide(manifest(version = "site-1-2")) is UpdateDecision.Invalid)
    }

    @Test
    fun recusaHashMalformadoETamanhoNegativo() {
        assertTrue(decide(manifest(files = """{"path":"index.html","sha256":"xyz","size":1}""")) is UpdateDecision.Invalid)
        assertTrue(decide(manifest(files = """{"path":"index.html","sha256":"$h1","size":-1}""")) is UpdateDecision.Invalid)
    }

    @Test
    fun recusaCaminhoDuplicado() {
        val f = """{"path":"index.html","sha256":"$h1","size":1}"""
        assertTrue(decide(manifest(files = "$f,$f")) is UpdateDecision.Invalid)
    }

    @Test
    fun limitaOTamanhoTotal() {
        val ok = """{"path":"index.html","sha256":"$h1","size":${UpdatePlan.MAX_TOTAL_BYTES}}"""
        assertTrue(decide(manifest(files = ok)) is UpdateDecision.Download)
        val big = """{"path":"index.html","sha256":"$h1","size":${UpdatePlan.MAX_TOTAL_BYTES},"x":0},{"path":"b.js","sha256":"$h2","size":1}"""
        assertTrue(decide(manifest(files = big)) is UpdateDecision.Invalid)
    }

    @Test
    fun jsonInvalidoOuIncompleto() {
        assertTrue(decide("não é json") is UpdateDecision.Invalid)
        assertTrue(decide("{}") is UpdateDecision.Invalid)
        assertTrue(decide("""{"version":"$v2","minShell":1}""") is UpdateDecision.Invalid)
    }
}
