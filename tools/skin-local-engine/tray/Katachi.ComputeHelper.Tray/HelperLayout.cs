using System.Diagnostics;

namespace Katachi.ComputeHelper.Tray;

internal sealed record HelperLayout(
    string RootDirectory,
    string ServerScriptPath,
    string CapabilityProbeScriptPath,
    string CudaExecutablePath)
{
    internal const string NodeExecutableName = "node.exe";
    internal const string ServerScriptName = "server.mjs";
    internal const string CapabilityProbeScriptName = "probe-windows-capability.mjs";
    internal const string CudaExecutableName = "katachi-containment-cuda.exe";

    internal static HelperLayout Discover(string launcherExecutablePath)
    {
        var directory = new DirectoryInfo(Path.GetDirectoryName(Path.GetFullPath(launcherExecutablePath))
            ?? throw new InvalidOperationException("The launcher directory is unavailable."));

        for (var depth = 0; depth < 12 && directory is not null; depth++, directory = directory.Parent)
        {
            var server = Path.Combine(directory.FullName, ServerScriptName);
            var probe = Path.Combine(directory.FullName, CapabilityProbeScriptName);
            var cuda = Path.Combine(directory.FullName, "bin", CudaExecutableName);
            if (File.Exists(server) && File.Exists(probe) && File.Exists(cuda))
            {
                return new HelperLayout(directory.FullName, server, probe, cuda);
            }
        }

        throw new InvalidOperationException(
            $"Could not locate the fixed helper runtime ({ServerScriptName} and bin\\{CudaExecutableName}) relative to the launcher.");
    }

    internal ProcessStartInfo CreateServerStartInfo() => CreateNodeStartInfo(ServerScriptPath);

    internal ProcessStartInfo CreateCapabilityProbeStartInfo() => CreateNodeStartInfo(CapabilityProbeScriptPath);

    private ProcessStartInfo CreateNodeStartInfo(string scriptPath)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = NodeExecutableName,
            WorkingDirectory = RootDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        startInfo.ArgumentList.Add(scriptPath);
        return startInfo;
    }
}
