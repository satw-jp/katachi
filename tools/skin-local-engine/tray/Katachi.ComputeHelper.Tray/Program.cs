namespace Katachi.ComputeHelper.Tray;

internal static class Program
{
    private const string SingleInstanceMutexName = @"Local\KatachiComputeHelperTray";

    [STAThread]
    private static void Main()
    {
        using var mutex = new Mutex(initiallyOwned: true, SingleInstanceMutexName, out var ownsMutex);
        if (!ownsMutex)
        {
            MessageBox.Show(
                "Katachi Compute Helper is already running.",
                "Katachi Compute Helper",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        ApplicationConfiguration.Initialize();
        using var context = new TrayApplicationContext();
        Application.Run(context);
    }
}
