import ExpoModulesCore

public class DeviceUptimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceUptime")

    Function("elapsedRealtime") { () -> Double in
      ProcessInfo.processInfo.systemUptime * 1000
    }
  }
}
