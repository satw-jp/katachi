using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace HikariBlenderBridge;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        if (TryRunSelfTest(args)) return;

        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var incomingUrl = args.FirstOrDefault(value =>
            value.StartsWith("hikari-blender://", StringComparison.OrdinalIgnoreCase));
        Application.Run(new BridgeForm(incomingUrl));
    }

    private static bool TryRunSelfTest(string[] args)
    {
        var index = Array.FindIndex(args, value => value == "--self-test-report");
        if (index < 0 || index + 1 >= args.Length) return false;
        var importer = Assembly.GetExecutingAssembly()
            .GetManifestResourceStream(BridgeForm.ImporterResourceName);
        var result = new
        {
            importer = importer is not null ? "ok" : "missing",
            blender = BridgeForm.FindBlenderExecutable() ?? "missing",
            platform = Environment.OSVersion.ToString(),
        };
        importer?.Dispose();
        File.WriteAllText(args[index + 1], JsonSerializer.Serialize(result));
        Environment.ExitCode = importer is null ? 1 : 0;
        return true;
    }
}

internal sealed class BridgeForm : Form
{
    internal const string ImporterResourceName = "HikariBlenderBridge.import_hikari_study.py";
    private const string StudySuffix = ".blender-study.json";
    private static readonly Regex SafeCaseName = new("^[a-zA-Z0-9_-]{1,160}$", RegexOptions.CultureInvariant);

    private readonly Label _status = new();
    private readonly Button _chooseButton = new();
    private readonly ProgressBar _progress = new();
    private readonly string? _incomingUrl;
    private bool _busy;

    internal BridgeForm(string? incomingUrl)
    {
        _incomingUrl = incomingUrl;
        Text = "Hikari Blender Bridge";
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(560, 300);
        MinimumSize = new Size(520, 280);
        Font = new Font("Segoe UI", 10F);
        AutoScaleMode = AutoScaleMode.Dpi;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(32, 28, 32, 24),
            ColumnCount = 1,
            RowCount = 5,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var title = new Label
        {
            Text = "HikariからBlenderへ",
            Font = new Font("Segoe UI", 22F, FontStyle.Regular),
            AutoSize = true,
            Anchor = AnchorStyles.None,
            TextAlign = ContentAlignment.MiddleCenter,
            Margin = new Padding(0, 0, 0, 14),
        };
        var description = new Label
        {
            Text = "Hikariで見つけた雰囲気を、Blenderの詳細制作の開始点へ渡します。\n書き出しフォルダを選ぶと.blendを生成して開きます。",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            ForeColor = SystemColors.GrayText,
        };
        _chooseButton.Text = "Hikari書き出しフォルダを選ぶ";
        _chooseButton.AutoSize = true;
        _chooseButton.Padding = new Padding(18, 7, 18, 7);
        _chooseButton.Anchor = AnchorStyles.None;
        _chooseButton.Click += async (_, _) => await ChooseBundleDirectoryAsync(null);
        _progress.Style = ProgressBarStyle.Marquee;
        _progress.MarqueeAnimationSpeed = 28;
        _progress.Visible = false;
        _progress.Width = 210;
        _progress.Anchor = AnchorStyles.None;
        _status.Text = InitialStatus();
        _status.Dock = DockStyle.Fill;
        _status.AutoSize = true;
        _status.TextAlign = ContentAlignment.MiddleCenter;
        _status.ForeColor = SystemColors.GrayText;
        _status.Margin = new Padding(0, 12, 0, 0);

        layout.Controls.Add(title, 0, 0);
        layout.Controls.Add(description, 0, 1);
        layout.Controls.Add(_chooseButton, 0, 2);
        layout.Controls.Add(_progress, 0, 3);
        layout.Controls.Add(_status, 0, 4);
        Controls.Add(layout);

        Shown += async (_, _) =>
        {
            if (_incomingUrl is null) return;
            var caseName = ParseCaseName(_incomingUrl);
            if (caseName is null)
            {
                ShowError("Hikariから受け取ったケース名が正しくありません");
                return;
            }
            await ChooseBundleDirectoryAsync(caseName);
        };
    }

    private string InitialStatus()
    {
        return FindBlenderExecutable() is null
            ? "Blenderが見つかりません。Blender 4以降をインストールしてください"
            : "準備できています";
    }

    private async Task ChooseBundleDirectoryAsync(string? caseName)
    {
        if (_busy) return;
        using var panel = new FolderBrowserDialog
        {
            Description = "Hikariの5ファイルを書き出したフォルダを選んでください。通常はDownloadsです。",
            UseDescriptionForTitle = true,
            ShowNewFolderButton = false,
            InitialDirectory = KnownDownloadsDirectory(),
        };
        if (panel.ShowDialog(this) != DialogResult.OK) return;

        string? sidecar;
        if (caseName is not null)
        {
            sidecar = Path.Combine(panel.SelectedPath, caseName + StudySuffix);
        }
        else
        {
            var candidates = Directory.GetFiles(panel.SelectedPath, "*" + StudySuffix, SearchOption.TopDirectoryOnly);
            if (candidates.Length == 1)
            {
                sidecar = candidates[0];
            }
            else
            {
                using var files = new OpenFileDialog
                {
                    Title = "Blenderへ渡すケースを選ぶ",
                    InitialDirectory = panel.SelectedPath,
                    Filter = "Hikari Blender study (*.blender-study.json)|*.blender-study.json|JSON (*.json)|*.json",
                    CheckFileExists = true,
                    Multiselect = false,
                };
                sidecar = files.ShowDialog(this) == DialogResult.OK ? files.FileName : null;
            }
        }
        if (sidecar is null) return;
        await ImportStudyAsync(sidecar);
    }

    private async Task ImportStudyAsync(string sidecar)
    {
        if (_busy) return;
        if (!sidecar.EndsWith(StudySuffix, StringComparison.OrdinalIgnoreCase) || !File.Exists(sidecar))
        {
            ShowError($"{Path.GetFileName(sidecar)} が見つかりません。Hikariの5ファイルを同じフォルダへ置いてください");
            return;
        }
        var blender = FindBlenderExecutable();
        if (blender is null)
        {
            ShowError("Blenderが見つかりません。Blender 4以降をインストールしてください");
            return;
        }

        SetBusy(true, "Blenderシーンを生成中…");
        StagedStudy? staged = null;
        try
        {
            var baseName = Path.GetFileName(sidecar)[..^StudySuffix.Length];
            var output = AvailableBlendPath(Path.GetDirectoryName(sidecar)!, baseName);
            staged = StageStudy(sidecar, baseName);
            var result = await RunBlenderAsync(blender, staged);
            if (result.ExitCode != 0 || !File.Exists(staged.Blend))
            {
                throw new InvalidOperationException("Blender変換に失敗しました\n" + Tail(result.Log, 6));
            }
            File.Copy(staged.Blend, output, overwrite: false);
            SetStatus($"{Path.GetFileName(output)} を作成しました", Color.ForestGreen);
            Process.Start(new ProcessStartInfo(output) { UseShellExecute = true });
            WindowState = FormWindowState.Minimized;
        }
        catch (Exception error)
        {
            ShowError(error.Message);
        }
        finally
        {
            if (staged is not null) TryDeleteDirectory(staged.Directory);
            SetBusy(false, null);
        }
    }

    private static StagedStudy StageStudy(string sidecar, string baseName)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(sidecar));
        var assets = document.RootElement
            .GetProperty("geometry")
            .GetProperty("meshes")
            .GetProperty("assets")
            .EnumerateArray()
            .Select(asset => asset.GetProperty("filename").GetString())
            .ToArray();
        var sourceDirectory = Path.GetFullPath(Path.GetDirectoryName(sidecar)!);
        var stageDirectory = Path.Combine(Path.GetTempPath(), "HikariBlenderBridge", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stageDirectory);
        try
        {
            var stagedSidecar = Path.Combine(stageDirectory, Path.GetFileName(sidecar));
            File.Copy(sidecar, stagedSidecar);
            foreach (var filename in assets)
            {
                if (string.IsNullOrWhiteSpace(filename) || Path.GetFileName(filename) != filename)
                    throw new InvalidDataException("Downloads外のmesh参照は使えません");
                var source = Path.GetFullPath(Path.Combine(sourceDirectory, filename));
                if (!source.StartsWith(sourceDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Downloads外のmesh参照は使えません");
                if (!File.Exists(source)) throw new FileNotFoundException("meshファイルが見つかりません", filename);
                File.Copy(source, Path.Combine(stageDirectory, filename));
            }
            var importer = Path.Combine(stageDirectory, "import_hikari_study.py");
            using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(ImporterResourceName)
                ?? throw new InvalidOperationException("Bridge内のHikari importerが見つかりません");
            using (var output = File.Create(importer)) resource.CopyTo(output);
            return new StagedStudy(
                stageDirectory,
                stagedSidecar,
                importer,
                Path.Combine(stageDirectory, baseName + ".blend"));
        }
        catch
        {
            TryDeleteDirectory(stageDirectory);
            throw;
        }
    }

    private static async Task<BlenderResult> RunBlenderAsync(string blender, StagedStudy staged)
    {
        var start = new ProcessStartInfo(blender)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var value in new[]
        {
            "--background", "--python", staged.Importer, "--", staged.Sidecar,
            "--clear", "--save", staged.Blend,
        }) start.ArgumentList.Add(value);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Blenderを起動できませんでした");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        return new BlenderResult(process.ExitCode, (await stdout) + Environment.NewLine + (await stderr));
    }

    internal static string? FindBlenderExecutable()
    {
        var environmentPath = Environment.GetEnvironmentVariable("HIKARI_BLENDER_PATH");
        if (File.Exists(environmentPath)) return Path.GetFullPath(environmentPath!);

        foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            try
            {
                using var key = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\blender.exe");
                if (key?.GetValue(null) is string value && File.Exists(value)) return value;
            }
            catch { }
        }

        var roots = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        }.Where(value => !string.IsNullOrWhiteSpace(value));
        var candidates = new List<string>();
        foreach (var root in roots)
        {
            foreach (var relative in new[] { @"Blender Foundation", @"Programs\Blender Foundation" })
            {
                var directory = Path.Combine(root, relative);
                if (!Directory.Exists(directory)) continue;
                try
                {
                    candidates.AddRange(Directory.GetDirectories(directory, "Blender*")
                        .Select(path => Path.Combine(path, "blender.exe"))
                        .Where(File.Exists));
                }
                catch { }
            }
        }
        return candidates.OrderByDescending(path => path, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
    }

    private static string KnownDownloadsDirectory()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
    }

    private static string? ParseCaseName(string incomingUrl)
    {
        if (!Uri.TryCreate(incomingUrl, UriKind.Absolute, out var uri)
            || !uri.Scheme.Equals("hikari-blender", StringComparison.OrdinalIgnoreCase)
            || !uri.Host.Equals("open", StringComparison.OrdinalIgnoreCase)) return null;
        foreach (var pair in uri.Query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2 && Uri.UnescapeDataString(parts[0]) == "case")
            {
                var value = Uri.UnescapeDataString(parts[1]);
                return SafeCaseName.IsMatch(value) ? value : null;
            }
        }
        return null;
    }

    private static string AvailableBlendPath(string directory, string baseName)
    {
        var primary = Path.Combine(directory, baseName + ".blend");
        return !File.Exists(primary)
            ? primary
            : Path.Combine(directory, $"{baseName}-from-hikari-{DateTime.Now:yyyyMMdd-HHmmss}.blend");
    }

    private static string Tail(string value, int lines)
    {
        return string.Join(Environment.NewLine,
            value.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None).TakeLast(lines));
    }

    private static void TryDeleteDirectory(string path)
    {
        try { Directory.Delete(path, recursive: true); } catch { }
    }

    private void SetBusy(bool busy, string? status)
    {
        _busy = busy;
        _chooseButton.Enabled = !busy;
        _progress.Visible = busy;
        if (status is not null) SetStatus(status, SystemColors.GrayText);
    }

    private void SetStatus(string value, Color color)
    {
        _status.Text = value;
        _status.ForeColor = color;
    }

    private void ShowError(string value)
    {
        SetStatus(value, Color.Firebrick);
        MessageBox.Show(this, value, "Hikari Blender Bridge", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private sealed record StagedStudy(string Directory, string Sidecar, string Importer, string Blend);
    private sealed record BlenderResult(int ExitCode, string Log);
}
