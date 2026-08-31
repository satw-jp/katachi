# Katachi Compute Helper Tray

This Windows-only WinForms launcher manages the existing shadow-only helper without changing its protocol or CUDA implementation.

## Build and test

```powershell
dotnet run --project tools\skin-local-engine\tray\Katachi.ComputeHelper.Tray.Tests
dotnet publish tools\skin-local-engine\tray\Katachi.ComputeHelper.Tray -c Release -r win-x64 --self-contained true -o tools\skin-local-engine\tray\artifacts\win-x64
```

Run `tools\skin-local-engine\tray\artifacts\win-x64\Katachi Compute Helper.exe` from the repository layout. The launcher finds only the fixed sibling runtime (`server.mjs`, `probe-windows-capability.mjs`, and `bin/katachi-containment-cuda.exe`), launches it through `node.exe` with `UseShellExecute=false`, and binds no new port.

The tray menu provides Start, Stop, Restart, Open SKIN, View Log, per-user Start with Windows, and Exit. The startup toggle writes only `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; administrator privileges are not requested. Logs are capped and stored under `%LOCALAPPDATA%\Katachi\ComputeHelper\logs`.

The production origin and optional exact review origin remain entirely controlled by the existing helper. The launcher inherits `KATACHI_SHADOW_REVIEW_ORIGIN` without adding origins or wildcard behavior. CUDA remains a shadow candidate; Web stays authoritative and `productionApplied=false`.
