namespace HubSpotDealsSandbox.Modules;

public sealed class ModuleAvailability
{
    private readonly HashSet<string> _enabledModuleIds;

    public ModuleAvailability(IEnumerable<ICrmSandboxModule> enabledModules)
    {
        _enabledModuleIds = enabledModules
            .Select(module => Normalize(module.Id))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    public bool IsEnabled(string moduleId) =>
        _enabledModuleIds.Contains(Normalize(moduleId));

    public void EnsureEnabled(string moduleId)
    {
        var normalized = Normalize(moduleId);
        if (!_enabledModuleIds.Contains(normalized))
        {
            throw new InvalidOperationException($"Module '{normalized}' is disabled.");
        }
    }

    public static string Normalize(string moduleId) =>
        moduleId.Trim().ToLowerInvariant() switch
        {
            "deal" => "deals",
            "contact" => "contacts",
            "company" => "companies",
            _ => moduleId.Trim().ToLowerInvariant()
        };
}
