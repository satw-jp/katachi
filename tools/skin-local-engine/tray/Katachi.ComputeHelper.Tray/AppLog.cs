using System.Diagnostics;

namespace Katachi.ComputeHelper.Tray;

internal sealed class AppLog
{
    private const long MaximumBytes = 1_048_576;
    private readonly object sync = new();

    internal AppLog()
    {
        var logDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Katachi",
            "ComputeHelper",
            "logs");
        Directory.CreateDirectory(logDirectory);
        FilePath = Path.Combine(logDirectory, "helper-tray.log");
    }

    internal string FilePath { get; }

    internal void Write(string message)
    {
        lock (sync)
        {
            RotateIfNeeded();
            File.AppendAllText(FilePath, $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}");
        }
    }

    internal void Open()
    {
        if (!File.Exists(FilePath)) Write("Log opened.");
        Process.Start(new ProcessStartInfo
        {
            FileName = FilePath,
            UseShellExecute = true,
        });
    }

    private void RotateIfNeeded()
    {
        if (!File.Exists(FilePath) || new FileInfo(FilePath).Length < MaximumBytes) return;
        var previous = $"{FilePath}.1";
        File.Move(FilePath, previous, overwrite: true);
    }
}
