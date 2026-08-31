using System.Diagnostics;
using System.Net.NetworkInformation;

namespace Katachi.ComputeHelper.Tray;

internal enum HelperLifecycleState
{
    Stopped,
    Starting,
    Running,
    Error,
}

internal sealed record HelperStatus(
    HelperLifecycleState Lifecycle,
    int? ProcessId,
    CapabilityProbeResult Capability,
    bool SkinConnected,
    string? Error);

internal sealed class HelperRuntime : IDisposable
{
    internal const int FixedPort = 47658;
    private static readonly TimeSpan ConnectedHold = TimeSpan.FromSeconds(12);
    private readonly object sync = new();
    private readonly HelperLayout layout;
    private readonly AppLog log;
    private Process? process;
    private HelperLifecycleState lifecycle = HelperLifecycleState.Stopped;
    private CapabilityProbeResult capability = new(false, "Checking…", "Capability probe pending");
    private string? error;
    private bool stopping;
    private bool skinConnectionReported;
    private DateTimeOffset lastSkinConnection = DateTimeOffset.MinValue;
    private bool disposed;

    internal HelperRuntime(HelperLayout layout, AppLog log)
    {
        this.layout = layout;
        this.log = log;
    }

    internal HelperStatus Status
    {
        get
        {
            lock (sync)
            {
                return new HelperStatus(
                    lifecycle,
                    process is { HasExited: false } ? process.Id : null,
                    capability,
                    DateTimeOffset.Now - lastSkinConnection <= ConnectedHold,
                    error);
            }
        }
    }

    internal void Start()
    {
        lock (sync)
        {
            ThrowIfDisposed();
            if (process is { HasExited: false }) return;
            if (IsPortListening())
            {
                lifecycle = HelperLifecycleState.Error;
                error = $"Port {FixedPort} is already in use by an unmanaged process.";
                log.Write($"Helper error: {error}");
                return;
            }

            stopping = false;
            error = null;
            var next = new Process { StartInfo = layout.CreateServerStartInfo(), EnableRaisingEvents = true };
            next.OutputDataReceived += OnOutput;
            next.ErrorDataReceived += OnError;
            next.Exited += OnExited;
            try
            {
                if (!next.Start()) throw new InvalidOperationException("node.exe did not start.");
                process = next;
                lifecycle = HelperLifecycleState.Starting;
                next.BeginOutputReadLine();
                next.BeginErrorReadLine();
                log.Write($"Helper start requested. PID={next.Id}; script={layout.ServerScriptPath}");
            }
            catch (Exception exception)
            {
                next.Dispose();
                lifecycle = HelperLifecycleState.Error;
                error = exception.Message;
                log.Write($"Helper start error: {exception}");
            }
        }
    }

    internal void Stop()
    {
        Process? target;
        lock (sync)
        {
            ThrowIfDisposed();
            target = process;
            if (target is null || target.HasExited)
            {
                process?.Dispose();
                process = null;
                lifecycle = HelperLifecycleState.Stopped;
                error = null;
                return;
            }
            stopping = true;
            log.Write($"Helper stop requested. PID={target.Id}");
        }

        try
        {
            target.Kill(entireProcessTree: true);
            target.WaitForExit(5_000);
        }
        catch (Exception exception)
        {
            log.Write($"Helper stop error: {exception}");
            lock (sync)
            {
                lifecycle = HelperLifecycleState.Error;
                error = exception.Message;
            }
            return;
        }

        lock (sync)
        {
            lifecycle = HelperLifecycleState.Stopped;
            error = null;
            stopping = false;
            process?.Dispose();
            process = null;
            log.Write("Helper stopped.");
        }
    }

    internal void Restart()
    {
        Stop();
        Start();
    }

    internal async Task RefreshCapabilityAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            using var probe = new Process { StartInfo = layout.CreateCapabilityProbeStartInfo() };
            if (!probe.Start()) throw new InvalidOperationException("Capability probe did not start.");
            var stdoutTask = probe.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = probe.StandardError.ReadToEndAsync(cancellationToken);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(8));
            await probe.WaitForExitAsync(timeout.Token);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (probe.ExitCode != 0)
            {
                throw new InvalidOperationException($"Capability probe exited {probe.ExitCode}: {stderr.Trim()}");
            }

            var result = CapabilityProbeResult.Parse(stdout);
            lock (sync) capability = result;
            log.Write($"RTX capability result: available={result.Available}; device={result.DeviceName}; detail={result.Detail}");
        }
        catch (Exception exception)
        {
            lock (sync) capability = new CapabilityProbeResult(false, "Unavailable", exception.Message);
            log.Write($"RTX capability error: {exception}");
        }
    }

    internal void RefreshObservedState()
    {
        lock (sync)
        {
            if (process is { HasExited: false } && IsPortListening()) lifecycle = HelperLifecycleState.Running;
            if (HasRecentSkinConnection()) lastSkinConnection = DateTimeOffset.Now;
            var connected = DateTimeOffset.Now - lastSkinConnection <= ConnectedHold;
            if (connected != skinConnectionReported)
            {
                skinConnectionReported = connected;
                log.Write($"SKIN connection state: {(connected ? "Connected" : "Waiting")} (recent loopback HTTP observation).");
            }
        }
    }

    public void Dispose()
    {
        if (disposed) return;
        try { Stop(); } catch { /* best effort during tray exit */ }
        disposed = true;
    }

    private void OnOutput(object sender, DataReceivedEventArgs eventArgs)
    {
        if (string.IsNullOrWhiteSpace(eventArgs.Data)) return;
        log.Write($"helper stdout: {eventArgs.Data}");
        if (eventArgs.Data.Contains("listening on http://127.0.0.1:47658/", StringComparison.Ordinal))
        {
            lock (sync) lifecycle = HelperLifecycleState.Running;
        }
    }

    private void OnError(object sender, DataReceivedEventArgs eventArgs)
    {
        if (string.IsNullOrWhiteSpace(eventArgs.Data)) return;
        log.Write($"helper stderr: {eventArgs.Data}");
    }

    private void OnExited(object? sender, EventArgs eventArgs)
    {
        if (sender is not Process exited) return;
        lock (sync)
        {
            var exitCode = TryGetExitCode(exited);
            log.Write($"Helper process exited. PID={exited.Id}; code={exitCode}; expected={stopping}");
            if (!stopping)
            {
                lifecycle = HelperLifecycleState.Error;
                error = $"Helper exited unexpectedly with code {exitCode}.";
            }
        }
    }

    private static string TryGetExitCode(Process process)
    {
        try { return process.ExitCode.ToString(); }
        catch { return "unknown"; }
    }

    private static bool IsPortListening()
    {
        try
        {
            return IPGlobalProperties.GetIPGlobalProperties()
                .GetActiveTcpListeners()
                .Any(endpoint => endpoint.Address.ToString() == "127.0.0.1" && endpoint.Port == FixedPort);
        }
        catch
        {
            return false;
        }
    }

    private static bool HasRecentSkinConnection()
    {
        try
        {
            return IPGlobalProperties.GetIPGlobalProperties()
                .GetActiveTcpConnections()
                .Any(connection => connection.LocalEndPoint.Address.ToString() == "127.0.0.1"
                    && connection.LocalEndPoint.Port == FixedPort
                    && connection.RemoteEndPoint.Address.ToString() == "127.0.0.1");
        }
        catch
        {
            return false;
        }
    }

    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);
}
