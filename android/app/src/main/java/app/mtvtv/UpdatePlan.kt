package app.mtvtv

import org.json.JSONException
import org.json.JSONObject

/** Um arquivo do pacote web publicado (linha do `manifest.json`). */
data class ManifestFile(val path: String, val sha256: String, val size: Long)

/** O que fazer com o manifesto publicado. */
sealed interface UpdateDecision {
    /** A versão publicada já é a atual. */
    data object UpToDate : UpdateDecision

    /** A casca é mais antiga que o `minShell` do manifesto: mantém a versão atual. */
    data object ShellTooOld : UpdateDecision

    /** Manifesto recusado (formato, caminhos ou tamanho). */
    data class Invalid(val reason: String) : UpdateDecision

    /** Baixar [fetch]; [reuse] já existe na versão atual com o mesmo hash e é só copiado. */
    data class Download(
        val version: String,
        val reuse: List<ManifestFile>,
        val fetch: List<ManifestFile>,
    ) : UpdateDecision
}

/**
 * Valida o manifesto baixado e decide a atualização. Kotlin puro (só `org.json`), sem I/O:
 * roda em teste JVM. O manifesto vem da rede, então nada nele é confiado antes de passar aqui
 * (os caminhos viram arquivos no disco).
 */
object UpdatePlan {
    /** Teto do pacote inteiro; o build atual tem uma fração disso. */
    const val MAX_TOTAL_BYTES = 20L * 1024 * 1024

    private val VERSION = Regex("^site-\\d{8}-\\d{6}$")
    private val SHA256 = Regex("^[0-9a-f]{64}$")
    private val PATH_CHARS = Regex("^[A-Za-z0-9._/-]+$")

    /**
     * @param shellVersion `versionCode` da casca, comparado com o `minShell`.
     * @param currentVersion versão em uso (ou `null`); qualquer versão diferente é atualização.
     * @param currentHashes caminho -> sha256 dos arquivos da versão atual, para reaproveitar.
     */
    fun decide(
        manifestJson: String,
        shellVersion: Int,
        currentVersion: String?,
        currentHashes: Map<String, String>,
    ): UpdateDecision {
        val root = try {
            JSONObject(manifestJson)
        } catch (e: JSONException) {
            return UpdateDecision.Invalid("JSON inválido")
        }
        return try {
            val version = root.getString("version")
            if (!VERSION.matches(version)) return UpdateDecision.Invalid("versão fora do formato")
            val minShell = root.getInt("minShell")
            val array = root.getJSONArray("files")
            val files = (0 until array.length()).map { i ->
                val f = array.getJSONObject(i)
                ManifestFile(f.getString("path"), f.getString("sha256"), f.getLong("size"))
            }
            validate(files)?.let { return UpdateDecision.Invalid(it) }
            when {
                version == currentVersion -> UpdateDecision.UpToDate
                minShell > shellVersion -> UpdateDecision.ShellTooOld
                else -> {
                    val (reuse, fetch) = files.partition { currentHashes[it.path] == it.sha256 }
                    UpdateDecision.Download(version, reuse, fetch)
                }
            }
        } catch (e: JSONException) {
            UpdateDecision.Invalid("manifesto incompleto")
        }
    }

    private fun validate(files: List<ManifestFile>): String? {
        if (files.none { it.path == "index.html" }) return "sem index.html"
        if (files.map { it.path }.toSet().size != files.size) return "caminho repetido"
        var total = 0L
        for (f in files) {
            if (!safePath(f.path)) return "caminho inseguro: ${f.path}"
            if (!SHA256.matches(f.sha256)) return "hash inválido: ${f.path}"
            if (f.size < 0) return "tamanho inválido: ${f.path}"
            total += f.size
            if (total > MAX_TOTAL_BYTES) return "pacote grande demais"
        }
        return null
    }

    private fun safePath(path: String): Boolean =
        PATH_CHARS.matches(path) &&
            !path.startsWith("/") &&
            path.split("/").none { it.isEmpty() || it == "." || it == ".." }
}
