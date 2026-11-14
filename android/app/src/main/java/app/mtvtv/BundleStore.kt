package app.mtvtv

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Baixa uma URL inteira para a memória; lança [IOException] em erro de rede ou status != 200. */
interface Downloader {
    fun fetch(url: String, maxBytes: Long): ByteArray
}

/** [Downloader] real: só https, com timeouts e teto de tamanho. */
class HttpDownloader : Downloader {
    override fun fetch(url: String, maxBytes: Long): ByteArray {
        if (!url.startsWith("https://")) throw IOException("só https: $url")
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.instanceFollowRedirects = false
            if (conn.responseCode != HttpURLConnection.HTTP_OK) throw IOException("HTTP ${conn.responseCode}: $url")
            val out = ByteArrayOutputStream()
            conn.inputStream.use { input ->
                val buf = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    if (out.size() > maxBytes) throw IOException("resposta maior que o limite: $url")
                }
            }
            return out.toByteArray()
        } finally {
            conn.disconnect()
        }
    }
}

/**
 * Pacotes web baixados, em [base] (`filesDir/web`): `<versão>/` com os arquivos e o ponteiro
 * `current` com o nome da versão em uso. Sem `android.*`, para testar com uma pasta temporária.
 *
 * Um pacote só vira o atual depois de baixado inteiro, conferido (sha256 e tamanho) e renomeado;
 * qualquer falha descarta o temporário e mantém a versão atual.
 */
class BundleStore(
    private val base: File,
    private val downloader: Downloader,
    private val shellVersion: Int,
) {
    sealed interface Result {
        data object NothingToDo : Result
        data class Updated(val version: String) : Result
        data class Failed(val reason: String) : Result
    }

    private val pointer get() = File(base, "current")

    /** Versão do ponteiro, se a pasta dela existir com `index.html`. */
    fun currentVersion(): String? {
        val name = try {
            pointer.readText().trim()
        } catch (e: IOException) {
            return null
        }
        if (!VERSION.matches(name)) return null
        return name.takeIf { File(base, "$name/index.html").isFile }
    }

    fun currentDir(): File? = currentVersion()?.let { File(base, it) }

    /**
     * Busca o manifesto em [baseUrl] (termina em `/`) e, havendo versão nova, baixa e instala.
     * [inUse] é a versão que a página aberta está servindo: a limpeza não a apaga.
     */
    fun checkAndUpdate(baseUrl: String, inUse: String? = null): Result {
        if (!baseUrl.startsWith("https://")) return Result.NothingToDo
        val manifest = try {
            String(downloader.fetch(baseUrl + "manifest.json", MAX_MANIFEST_BYTES), Charsets.UTF_8)
        } catch (e: IOException) {
            return Result.NothingToDo
        }
        val current = currentVersion()
        val currentDir = currentDir()
        val decision = UpdatePlan.decide(manifest, shellVersion, current, currentDir?.let { hashes(it) }.orEmpty())
        return when (decision) {
            UpdateDecision.UpToDate, UpdateDecision.ShellTooOld -> Result.NothingToDo
            is UpdateDecision.Invalid -> Result.Failed(decision.reason)
            is UpdateDecision.Download -> install(baseUrl, decision, currentDir, keep = setOfNotNull(current, inUse))
        }
    }

    private fun install(baseUrl: String, plan: UpdateDecision.Download, currentDir: File?, keep: Set<String>): Result {
        base.mkdirs()
        val tmp = File(base, ".tmp-${plan.version}")
        tmp.deleteRecursively()
        try {
            for (f in plan.reuse) copyInto(File(currentDir!!, f.path), File(tmp, f.path))
            for (f in plan.fetch) {
                val bytes = downloader.fetch(baseUrl + f.path, f.size)
                if (bytes.size.toLong() != f.size) throw IOException("tamanho diferente: ${f.path}")
                if (sha256(bytes) != f.sha256) throw IOException("hash diferente: ${f.path}")
                val target = File(tmp, f.path)
                target.parentFile!!.mkdirs()
                target.writeBytes(bytes)
            }
            val finalDir = File(base, plan.version)
            finalDir.deleteRecursively()
            if (!tmp.renameTo(finalDir)) throw IOException("não consegui renomear o pacote")
            writePointer(plan.version)
            prune(keep = keep + plan.version)
            return Result.Updated(plan.version)
        } catch (e: IOException) {
            tmp.deleteRecursively()
            return Result.Failed(e.message ?: "falha")
        }
    }

    private fun writePointer(version: String) {
        val temp = File(base, "current.tmp")
        temp.writeText(version)
        if (!temp.renameTo(pointer)) throw IOException("não consegui trocar o ponteiro")
    }

    /** Apaga versões fora de [keep] e temporários esquecidos. */
    private fun prune(keep: Set<String>) {
        for (entry in base.listFiles().orEmpty()) {
            if (entry.isDirectory && entry.name !in keep) entry.deleteRecursively()
        }
    }

    private fun copyInto(source: File, target: File) {
        target.parentFile!!.mkdirs()
        source.copyTo(target, overwrite = true)
    }

    private fun hashes(root: File): Map<String, String> =
        root.walkTopDown().filter { it.isFile }
            .associate { it.relativeTo(root).path.replace(File.separatorChar, '/') to sha256(it.readBytes()) }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private companion object {
        val VERSION = Regex("^site-\\d{8}-\\d{6}$")
        const val MAX_MANIFEST_BYTES = 1L * 1024 * 1024
    }
}
