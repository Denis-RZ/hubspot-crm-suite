using System.Reflection;
using System.Runtime.Loader;
using HubSpotSandbox.Plugin.Abstractions;

namespace HubSpotDealsSandbox.Plugins;

/// <summary>
/// Isolates a plugin assembly while sharing the Abstractions assembly from the host.
/// This ensures that the host can cast plugin types to IPluginModule without an
/// InvalidCastException caused by type-identity mismatch across load contexts.
/// </summary>
public sealed class PluginLoadContext : AssemblyLoadContext
{
    private static readonly string AbstractionsName =
        typeof(IPluginModule).Assembly.GetName().Name!;

    private readonly AssemblyDependencyResolver _resolver;

    public PluginLoadContext(string dllPath) : base(isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(dllPath);
    }

    protected override Assembly? Load(AssemblyName assemblyName)
    {
        // Always use the host's copy of Abstractions so the interface types match.
        if (assemblyName.Name == AbstractionsName)
            return typeof(IPluginModule).Assembly;

        var path = _resolver.ResolveAssemblyToPath(assemblyName);
        return path is not null ? LoadFromAssemblyPath(path) : null;
    }
}
