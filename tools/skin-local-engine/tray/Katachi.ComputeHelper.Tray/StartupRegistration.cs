using Microsoft.Win32;

namespace Katachi.ComputeHelper.Tray;

internal static class StartupRegistration
{
    internal const string RunKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    internal const string ValueName = "Katachi Compute Helper";

    internal static string BuildCommand(string executablePath) => $"\"{Path.GetFullPath(executablePath)}\" --startup";

    internal static bool IsEnabled(string executablePath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        return string.Equals(key?.GetValue(ValueName) as string, BuildCommand(executablePath), StringComparison.OrdinalIgnoreCase);
    }

    internal static void SetEnabled(string executablePath, bool enabled)
    {
        using var key = Registry.CurrentUser.CreateSubKey(RunKeyPath, writable: true)
            ?? throw new InvalidOperationException("The current-user startup registry key is unavailable.");
        if (enabled) key.SetValue(ValueName, BuildCommand(executablePath), RegistryValueKind.String);
        else key.DeleteValue(ValueName, throwOnMissingValue: false);
    }
}
