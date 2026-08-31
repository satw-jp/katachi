using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace Katachi.ComputeHelper.Tray;

internal static class StatusIconFactory
{
    internal static Icon Create(Color color)
    {
        using var bitmap = new Bitmap(32, 32);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.Clear(Color.Transparent);
        using var brush = new SolidBrush(color);
        using var border = new Pen(Color.FromArgb(225, 245, 245, 245), 2);
        graphics.FillEllipse(brush, 3, 3, 26, 26);
        graphics.DrawEllipse(border, 3, 3, 26, 26);
        using var font = new Font("Segoe UI", 13, FontStyle.Bold, GraphicsUnit.Pixel);
        using var textBrush = new SolidBrush(Color.White);
        var text = "K";
        var size = graphics.MeasureString(text, font);
        graphics.DrawString(text, font, textBrush, (32 - size.Width) / 2, (32 - size.Height) / 2 - 1);

        var handle = bitmap.GetHicon();
        try { return (Icon)Icon.FromHandle(handle).Clone(); }
        finally { DestroyIcon(handle); }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(nint handle);
}
