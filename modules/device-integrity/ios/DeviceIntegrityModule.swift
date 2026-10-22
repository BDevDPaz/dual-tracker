import ExpoModulesCore

public class DeviceIntegrityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DeviceIntegrity")

    Function("probe") { () -> [String: Any?] in
      [
        "developerOptionsEnabled": nil,
        "fingerprint": nil,
        "hardware": nil,
        "product": nil,
        "model": nil,
        "brand": nil,
        "device": nil,
        "rootChecked": false,
        "rootHits": [String](),
      ]
    }
  }
}
