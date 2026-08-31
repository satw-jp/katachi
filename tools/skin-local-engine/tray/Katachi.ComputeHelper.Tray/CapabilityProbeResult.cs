using System.Text.Json;

namespace Katachi.ComputeHelper.Tray;

internal sealed record CapabilityProbeResult(bool Available, string DeviceName, string Detail)
{
    internal static CapabilityProbeResult Parse(string json)
    {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var available = root.GetProperty("cudaBackend").GetProperty("available").GetBoolean();
        var deviceName = "Unavailable";
        if (root.GetProperty("driver").TryGetProperty("deviceNames", out var devices)
            && devices.ValueKind == JsonValueKind.Array
            && devices.GetArrayLength() > 0)
        {
            deviceName = devices[0].GetString() ?? "Unavailable";
        }

        var detail = available
            ? deviceName
            : root.GetProperty("cudaBackend").TryGetProperty("reasonCode", out var reason)
                ? reason.GetString() ?? "Unavailable"
                : "Unavailable";
        return new CapabilityProbeResult(available, deviceName, detail);
    }
}
