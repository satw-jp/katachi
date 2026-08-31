using System.Diagnostics;

namespace Katachi.ComputeHelper.Tray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private const string SkinUrl = "https://katachi.a-8c3.workers.dev/skin-rebuild";
    private readonly AppLog log = new();
    private readonly NotifyIcon notifyIcon;
    private readonly ToolStripMenuItem helperStatusItem = new() { Enabled = false };
    private readonly ToolStripMenuItem rtxStatusItem = new() { Enabled = false };
    private readonly ToolStripMenuItem skinStatusItem = new() { Enabled = false };
    private readonly ToolStripMenuItem startItem = new("Start Helper");
    private readonly ToolStripMenuItem stopItem = new("Stop Helper");
    private readonly ToolStripMenuItem restartItem = new("Restart Helper");
    private readonly ToolStripMenuItem startupItem = new("Start with Windows") { CheckOnClick = false };
    private readonly System.Windows.Forms.Timer timer = new() { Interval = 500 };
    private readonly Icon readyIcon = StatusIconFactory.Create(Color.FromArgb(36, 166, 87));
    private readonly Icon waitingIcon = StatusIconFactory.Create(Color.FromArgb(210, 151, 23));
    private readonly Icon errorIcon = StatusIconFactory.Create(Color.FromArgb(205, 55, 55));
    private HelperRuntime? runtime;
    private string? initializationError;
    private bool exiting;

    internal bool IsNotifyIconVisible => notifyIcon.Visible;

    internal HelperStatus? CurrentStatus => runtime?.Status;

    internal bool StartCommandEnabled => startItem.Enabled;

    internal IReadOnlyList<string> MenuLabels => notifyIcon.ContextMenuStrip?.Items
        .OfType<ToolStripMenuItem>()
        .Select(item => item.Text ?? string.Empty)
        .ToArray() ?? [];

    internal void ClickStartForTest() => startItem.PerformClick();

    internal void ClickStopForTest() => stopItem.PerformClick();

    internal void ClickRestartForTest() => restartItem.PerformClick();

    internal void ClickStartupForTest() => startupItem.PerformClick();

    internal void ClickExitForTest() => Exit();

    internal TrayApplicationContext()
    {
        log.Write($"Tray app start. version={Application.ProductVersion}; executable={Application.ExecutablePath}");
        try
        {
            var layout = HelperLayout.Discover(Application.ExecutablePath);
            runtime = new HelperRuntime(layout, log);
            log.Write($"Fixed helper runtime located at {layout.RootDirectory}");
        }
        catch (Exception exception)
        {
            initializationError = exception.Message;
            log.Write($"Tray initialization error: {exception}");
        }

        var menu = new ContextMenuStrip();
        menu.Items.AddRange([
            helperStatusItem,
            rtxStatusItem,
            skinStatusItem,
            new ToolStripSeparator(),
            startItem,
            stopItem,
            restartItem,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Open SKIN", null, (_, _) => OpenSkin()),
            new ToolStripMenuItem("View Log", null, (_, _) => ViewLog()),
            startupItem,
            new ToolStripSeparator(),
            new ToolStripMenuItem("Exit", null, (_, _) => Exit()),
        ]);

        notifyIcon = new NotifyIcon
        {
            ContextMenuStrip = menu,
            Icon = waitingIcon,
            Text = "Katachi Compute Helper — Starting",
            Visible = true,
        };
        notifyIcon.DoubleClick += (_, _) => OpenSkin();
        startItem.Click += (_, _) => runtime?.Start();
        stopItem.Click += (_, _) => runtime?.Stop();
        restartItem.Click += (_, _) => runtime?.Restart();
        startupItem.Click += (_, _) => ToggleStartup();

        timer.Tick += (_, _) => RefreshUi();
        timer.Start();
        if (runtime is not null)
        {
            runtime.Start();
            _ = runtime.RefreshCapabilityAsync();
        }
        RefreshUi();
    }

    private void RefreshUi()
    {
        runtime?.RefreshObservedState();
        if (runtime is null)
        {
            helperStatusItem.Text = "Helper: Error";
            rtxStatusItem.Text = "RTX: Unavailable";
            skinStatusItem.Text = "SKIN: Waiting";
            notifyIcon.Icon = errorIcon;
            notifyIcon.Text = TruncateTooltip($"Katachi Compute Helper — Error: {initializationError}");
            startItem.Enabled = false;
            stopItem.Enabled = false;
            restartItem.Enabled = false;
        }
        else
        {
            var status = runtime.Status;
            helperStatusItem.Text = $"Helper: {status.Lifecycle}";
            rtxStatusItem.Text = $"RTX: {(status.Capability.Available ? status.Capability.DeviceName : "Unavailable")}";
            skinStatusItem.Text = $"SKIN: {(status.SkinConnected ? "Connected" : "Waiting")}";
            startItem.Enabled = status.Lifecycle is HelperLifecycleState.Stopped or HelperLifecycleState.Error;
            stopItem.Enabled = status.Lifecycle is HelperLifecycleState.Starting or HelperLifecycleState.Running;
            restartItem.Enabled = true;
            notifyIcon.Icon = status.Lifecycle == HelperLifecycleState.Error
                ? errorIcon
                : status.Lifecycle == HelperLifecycleState.Running && status.Capability.Available
                    ? readyIcon
                    : waitingIcon;
            notifyIcon.Text = TruncateTooltip(
                $"Katachi Compute Helper — {status.Lifecycle} — {(status.Capability.Available ? status.Capability.DeviceName : status.Capability.Detail)}");
        }

        try { startupItem.Checked = StartupRegistration.IsEnabled(Application.ExecutablePath); }
        catch (Exception exception)
        {
            startupItem.Checked = false;
            log.Write($"Startup status error: {exception}");
        }
    }

    private void ToggleStartup()
    {
        try
        {
            var enabled = !StartupRegistration.IsEnabled(Application.ExecutablePath);
            StartupRegistration.SetEnabled(Application.ExecutablePath, enabled);
            startupItem.Checked = enabled;
            log.Write($"Start with Windows set to {enabled}. scope=HKCU");
        }
        catch (Exception exception)
        {
            log.Write($"Start with Windows error: {exception}");
            MessageBox.Show(exception.Message, "Katachi Compute Helper", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void OpenSkin()
    {
        try
        {
            Process.Start(new ProcessStartInfo { FileName = SkinUrl, UseShellExecute = true });
            log.Write($"Open SKIN: {SkinUrl}");
        }
        catch (Exception exception)
        {
            log.Write($"Open SKIN error: {exception}");
        }
    }

    private void ViewLog()
    {
        try { log.Open(); }
        catch (Exception exception)
        {
            log.Write($"View Log error: {exception}");
            MessageBox.Show(exception.Message, "Katachi Compute Helper", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void Exit()
    {
        if (exiting) return;
        exiting = true;
        timer.Stop();
        log.Write("Tray app exit requested.");
        runtime?.Dispose();
        notifyIcon.Visible = false;
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            timer.Dispose();
            runtime?.Dispose();
            notifyIcon.Dispose();
            readyIcon.Dispose();
            waitingIcon.Dispose();
            errorIcon.Dispose();
        }
        base.Dispose(disposing);
    }

    private static string TruncateTooltip(string value) => value.Length <= 63 ? value : value[..60] + "…";
}
