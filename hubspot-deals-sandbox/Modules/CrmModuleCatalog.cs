using System.Reflection;

namespace HubSpotDealsSandbox.Modules;

public static class CrmModuleCatalog
{
    public static IReadOnlyList<ICrmSandboxModule> DiscoverAllModules(Assembly assembly) =>
        assembly.GetTypes()
            .Where(t => typeof(ICrmSandboxModule).IsAssignableFrom(t) && !t.IsAbstract && !t.IsInterface)
            .Select(t => (ICrmSandboxModule)Activator.CreateInstance(t)!)
            .OrderBy(m => m.NavOrder)
            .ToArray();

    public static IReadOnlyList<ICrmSandboxModule> LoadEnabledModules(
        IConfiguration configuration,
        Assembly assembly)
    {
        var discoveredModules = DiscoverAllModules(assembly)
            .ToDictionary(module => module.Id, StringComparer.OrdinalIgnoreCase);

        var configuredModules = configuration
            .GetSection("Modules")
            .Get<string[]>();

        if (configuredModules is null || configuredModules.Length == 0)
        {
            throw new InvalidOperationException("appsettings.json must define a non-empty Modules array.");
        }

        var enabledModules = new List<ICrmSandboxModule>(configuredModules.Length);

        foreach (var moduleId in configuredModules)
        {
            if (!discoveredModules.TryGetValue(moduleId, out var module))
            {
                throw new InvalidOperationException(
                    $"Configured module '{moduleId}' was not found. Add the module implementation or remove it from appsettings.json.");
            }

            enabledModules.Add(module);
        }

        return enabledModules.ToArray();
    }
}
