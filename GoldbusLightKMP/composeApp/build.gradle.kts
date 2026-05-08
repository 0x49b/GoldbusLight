plugins {
    kotlin("multiplatform")
    id("org.jetbrains.compose") version "1.7.3"
    id("org.jetbrains.kotlin.plugin.compose") version "2.1.0"
    kotlin("plugin.serialization")
}

repositories {
    google() // Prioritize Google's Maven for androidx artifacts
    mavenCentral()
    maven("https://maven.pkg.jetbrains.space/public/p/compose/stable")
}

kotlin {
    jvm("desktop")
    
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material)
                implementation(compose.ui)
                implementation(compose.components.resources)
                implementation(compose.components.uiToolingPreview)
                
                // Fluent UI
                implementation("io.github.compose-fluent:fluent:v0.1.0")
                implementation("io.github.compose-fluent:fluent-icons-extended:v0.1.0")

                // Ktor
                implementation("io.ktor:ktor-client-core:3.0.1")
                implementation("io.ktor:ktor-client-content-negotiation:3.0.1")
                implementation("io.ktor:ktor-serialization-kotlinx-json:3.0.1")
                
                // Serialization
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
                
                // Coroutines
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
                
                // Lifecycle
                implementation("androidx.lifecycle:lifecycle-viewmodel:2.8.4")
                implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
                
                // Koin
                implementation("io.insert-koin:koin-core:4.0.0")
                implementation("io.insert-koin:koin-compose:4.0.0")
                implementation("io.insert-koin:koin-compose-viewmodel:4.0.0")
            }
        }
        
        val desktopMain by getting {
            dependencies {
                implementation(compose.desktop.currentOs)

                implementation("io.ktor:ktor-client-okhttp:3.0.1")
                implementation("org.jmdns:jmdns:3.5.9")
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-swing:1.9.0")
                implementation("org.slf4j:slf4j-simple:2.0.16")
            }
        }
    }
}

compose.desktop {
    application {
        mainClass = "com.goldbus.light.MainKt"
        nativeDistributions {
            targetFormats(org.jetbrains.compose.desktop.application.dsl.TargetFormat.Dmg, org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi, org.jetbrains.compose.desktop.application.dsl.TargetFormat.Deb)
            packageName = "GoldbusLight"
            packageVersion = "1.0.0"
        }
    }
}
