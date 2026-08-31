using Katachi.ComputeHelper.Tray;
using Microsoft.Win32;
using System.Net.NetworkInformation;

var tests = new (string Name, Action Run)[]
{
    ("discovers only the fixed helper layout", DiscoverFixedLayout),
    ("rejects incomplete helper layout", RejectIncompleteLayout),
    ("uses a fixed shell-free node invocation", FixedNodeInvocation),
    ("parses an available RTX capability", ParseCapability),
    ("builds a quoted current-user startup command", BuildStartupCommand),
    ("round-trips the current-user startup registration", RoundTripStartupRegistration),
    ("starts, stops, and restarts the real fixed helper", RealHelperLifecycle),
    ("stops the managed helper when the tray context exits", TrayExitStopsHelper),
};

var failures = 0;
foreach (var test in tests)
{
    try
    {
        test.Run();
        Console.WriteLine($"PASS {test.Name}");
    }
    catch (Exception exception)
    {
        failures++;
        Console.Error.WriteLine($"FAIL {test.Name}: {exception.Message}");
    }
}

Console.WriteLine($"{tests.Length - failures}/{tests.Length} tray launcher contract tests passed.");
return failures == 0 ? 0 : 1;

static void DiscoverFixedLayout()
{
    using var fixture = new LayoutFixture(complete: true);
    var layout = HelperLayout.Discover(fixture.LauncherPath);
    AssertEqual(fixture.HelperRoot, layout.RootDirectory);
    AssertEqual(Path.Combine(fixture.HelperRoot, "server.mjs"), layout.ServerScriptPath);
    AssertEqual(Path.Combine(fixture.HelperRoot, "bin", "katachi-containment-cuda.exe"), layout.CudaExecutablePath);
}

static void RejectIncompleteLayout()
{
    using var fixture = new LayoutFixture(complete: false);
    try
    {
        _ = HelperLayout.Discover(fixture.LauncherPath);
        throw new Exception("Incomplete layout was accepted.");
    }
    catch (InvalidOperationException)
    {
        // Expected: the launcher cannot be redirected to an arbitrary partial runtime.
    }
}

static void FixedNodeInvocation()
{
    using var fixture = new LayoutFixture(complete: true);
    var info = HelperLayout.Discover(fixture.LauncherPath).CreateServerStartInfo();
    AssertEqual("node.exe", info.FileName);
    AssertEqual(false, info.UseShellExecute);
    AssertEqual(true, info.CreateNoWindow);
    AssertEqual(1, info.ArgumentList.Count);
    AssertEqual(Path.Combine(fixture.HelperRoot, "server.mjs"), info.ArgumentList[0]);
}

static void ParseCapability()
{
    const string json = """
        {
          "driver": { "deviceNames": ["NVIDIA GeForce RTX 3080"] },
          "cudaBackend": { "available": true, "reasonCode": null }
        }
        """;
    var result = CapabilityProbeResult.Parse(json);
    AssertEqual(true, result.Available);
    AssertEqual("NVIDIA GeForce RTX 3080", result.DeviceName);
}

static void BuildStartupCommand()
{
    var command = StartupRegistration.BuildCommand(@"C:\Apps\Katachi Compute Helper.exe");
    AssertEqual("\"C:\\Apps\\Katachi Compute Helper.exe\" --startup", command);
}

static void RoundTripStartupRegistration()
{
    using var key = Registry.CurrentUser.CreateSubKey(StartupRegistration.RunKeyPath, writable: true)
        ?? throw new Exception("HKCU Run key is unavailable.");
    var prior = key.GetValue(StartupRegistration.ValueName) as string;
    const string fixtureExecutable = @"C:\Apps\Katachi Compute Helper QA.exe";
    try
    {
        StartupRegistration.SetEnabled(fixtureExecutable, enabled: true);
        AssertEqual(true, StartupRegistration.IsEnabled(fixtureExecutable));
        StartupRegistration.SetEnabled(fixtureExecutable, enabled: false);
        AssertEqual(false, StartupRegistration.IsEnabled(fixtureExecutable));
    }
    finally
    {
        if (prior is null) key.DeleteValue(StartupRegistration.ValueName, throwOnMissingValue: false);
        else key.SetValue(StartupRegistration.ValueName, prior, RegistryValueKind.String);
    }
}

static void RealHelperLifecycle()
{
    var layout = HelperLayout.Discover(Environment.ProcessPath
        ?? throw new Exception("The test executable path is unavailable."));
    var log = new AppLog();
    using var runtime = new HelperRuntime(layout, log);
    runtime.RefreshCapabilityAsync().GetAwaiter().GetResult();
    AssertEqual(true, runtime.Status.Capability.Available);
    AssertEqual("NVIDIA GeForce RTX 3080", runtime.Status.Capability.DeviceName);

    runtime.Start();
    WaitFor(() => { runtime.RefreshObservedState(); return runtime.Status.Lifecycle == HelperLifecycleState.Running; }, "helper start");
    var firstPid = runtime.Status.ProcessId ?? throw new Exception("Started helper PID is unavailable.");

    runtime.Stop();
    WaitFor(() => runtime.Status.Lifecycle == HelperLifecycleState.Stopped, "helper stop");

    runtime.Start();
    WaitFor(() => { runtime.RefreshObservedState(); return runtime.Status.Lifecycle == HelperLifecycleState.Running; }, "helper second start");
    var secondPid = runtime.Status.ProcessId ?? throw new Exception("Restarted helper PID is unavailable.");
    if (firstPid == secondPid) throw new Exception("Helper restart did not replace the process.");

    runtime.Restart();
    WaitFor(() => { runtime.RefreshObservedState(); return runtime.Status.Lifecycle == HelperLifecycleState.Running; }, "explicit helper restart");
    var thirdPid = runtime.Status.ProcessId ?? throw new Exception("Explicitly restarted helper PID is unavailable.");
    if (secondPid == thirdPid) throw new Exception("Explicit Restart did not replace the process.");
}

static void TrayExitStopsHelper()
{
    Exception? threadError = null;
    var thread = new Thread(() =>
    {
        try
        {
            using var context = new TrayApplicationContext();
            WaitFor(IsHelperListening, "tray auto-start");
        }
        catch (Exception exception)
        {
            threadError = exception;
        }
    });
    thread.SetApartmentState(ApartmentState.STA);
    thread.Start();
    if (!thread.Join(TimeSpan.FromSeconds(20))) throw new Exception("Tray context exit test timed out.");
    if (threadError is not null) throw new Exception("Tray context exit failed.", threadError);
    WaitFor(() => !IsHelperListening(), "helper tree shutdown after tray exit");
}

static bool IsHelperListening() => IPGlobalProperties.GetIPGlobalProperties()
    .GetActiveTcpListeners()
    .Any(endpoint => endpoint.Address.ToString() == "127.0.0.1" && endpoint.Port == HelperRuntime.FixedPort);

static void WaitFor(Func<bool> predicate, string operation)
{
    var deadline = DateTime.UtcNow.AddSeconds(12);
    while (DateTime.UtcNow < deadline)
    {
        if (predicate()) return;
        Thread.Sleep(100);
    }
    throw new Exception($"Timed out waiting for {operation}.");
}

static void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
        throw new Exception($"Expected {expected}; got {actual}.");
}

sealed class LayoutFixture : IDisposable
{
    internal LayoutFixture(bool complete)
    {
        Root = Path.Combine(Path.GetTempPath(), $"katachi-tray-test-{Guid.NewGuid():N}");
        HelperRoot = Path.Combine(Root, "tools", "skin-local-engine");
        var launcherDirectory = Path.Combine(HelperRoot, "tray", "artifacts", "win-x64");
        Directory.CreateDirectory(Path.Combine(HelperRoot, "bin"));
        Directory.CreateDirectory(launcherDirectory);
        File.WriteAllText(Path.Combine(HelperRoot, "server.mjs"), "// fixture");
        File.WriteAllText(Path.Combine(HelperRoot, "probe-windows-capability.mjs"), "// fixture");
        if (complete) File.WriteAllText(Path.Combine(HelperRoot, "bin", "katachi-containment-cuda.exe"), "fixture");
        LauncherPath = Path.Combine(launcherDirectory, "Katachi Compute Helper.exe");
    }

    internal string Root { get; }
    internal string HelperRoot { get; }
    internal string LauncherPath { get; }

    public void Dispose() => Directory.Delete(Root, recursive: true);
}
