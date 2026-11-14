plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// A URL do app hospedado vem de config/hosted.json (versionado), pelo mesmo
// módulo que gera o config.xml da Tizen. Falha o build com a mensagem dele se faltar.
// isIgnoreExitValue: sem ele o Gradle só diz "exit value 1" e engole o stderr do script.
val hostedConfig = providers.exec {
    commandLine("node", "${rootDir.parentFile}/web/scripts/hosted-config.ts", "android-url")
    isIgnoreExitValue = true
}
val appUrl: String = if (hostedConfig.result.get().exitValue == 0) {
    hostedConfig.standardOutput.asText.get().trim()
} else {
    throw GradleException(hostedConfig.standardError.asText.get().trim())
}

android {
    namespace = "app.mtvtv"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.mtvtv"
        minSdk = 28
        targetSdk = 30
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "APP_URL", "\"$appUrl\"")
    }

    buildFeatures {
        buildConfig = true
    }
    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")

    testImplementation("junit:junit:4.13.2")
    // O android.jar só traz stubs de org.json: nos testes JVM entra a implementação real.
    testImplementation("org.json:json:20240303")
}
