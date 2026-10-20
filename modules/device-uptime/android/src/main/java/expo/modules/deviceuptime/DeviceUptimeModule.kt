package expo.modules.deviceuptime

import android.os.SystemClock
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceUptimeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeviceUptime")

    Function("elapsedRealtime") {
      SystemClock.elapsedRealtime().toDouble()
    }
  }
}
