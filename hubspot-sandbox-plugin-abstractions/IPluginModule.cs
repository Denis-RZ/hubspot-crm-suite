using Microsoft.AspNetCore.Http;

namespace HubSpotSandbox.Plugin.Abstractions;

/// <summary>
/// Implement this interface in a *.plugin.dll to create a dynamically loadable CRM module.
/// Package the DLL + a matching <id>.js file into a ZIP and upload via Settings → Install Plugin.
/// </summary>
public interface IPluginModule
{
    string Id       { get; }
    string Label    { get; }
    int    NavOrder { get; }

    /// <summary>
    /// Called for every request to /api/plugin/{id}/{action}.
    /// Return any serialisable object — the host wraps it in 200 OK.
    /// Throw to produce a 500 with the exception message.
    /// </summary>
    Task<object?> HandleAsync(string action, HttpRequest request, CancellationToken ct = default);
}
