package expo.modules.deviceintegrity

import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class DeviceIntegrityModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceIntegrity")

    Function("probe") {
      val resolver = appContext.reactContext?.contentResolver
      val developer =
        if (resolver == null) null
        else
          try {
            Settings.Global.getInt(resolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) == 1
          } catch (_: Throwable) {
            null
          }
      val hits = mutableListOf<String>()
      for (path in ROOT_PATHS) {
        try {
          if (File(path).exists()) hits.add(path)
        } catch (_: Throwable) {
          // Una ruta ilegible no es una prueba de root.
        }
      }
      mapOf(
        "developerOptionsEnabled" to developer,
        "fingerprint" to Build.FINGERPRINT,
        "hardware" to Build.HARDWARE,
        "product" to Build.PRODUCT,
        "model" to Build.MODEL,
        "brand" to Build.BRAND,
        "device" to Build.DEVICE,
        "rootChecked" to true,
        "rootHits" to hits,
      )
    }
  }

  companion object {
    private val ROOT_PATHS = listOf(
      "/system/bin/su",
      "/system/xbin/su",
      "/sbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su",
      "/data/local/bin/su",
      "/data/local/xbin/su",
      "/su/bin/su",
      "/system/xbin/busybox",
      "/system/bin/busybox",
      "/sbin/.magisk",
      "/data/adb/magisk",
      "/data/adb/magisk.db",
    )
  }
}
