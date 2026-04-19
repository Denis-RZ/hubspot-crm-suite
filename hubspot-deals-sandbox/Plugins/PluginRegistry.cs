using System.IO.Compression;
using System.Text.Json;
using HubSpotSandbox.Plugin.Abstractions;

namespace HubSpotDealsSandbox.Plugins;

public sealed class PluginRegistry
{
    private readonly Dictionary<string, PluginEntry> _plugins =
        new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, int> _navOrderOverrides =
        new(StringComparer.OrdinalIgnoreCase);

    private readonly string _pluginsDir;
    private readonly string _jsModulesDir;
    private readonly string _orderPath;

    private record PluginEntry(
        IPluginModule Module,
        PluginLoadContext Context,
        string DllPath,
        string JsPath);

    public PluginRegistry(IWebHostEnvironment env)
    {
        _pluginsDir   = Path.Combine(env.ContentRootPath, "installed-plugins");
        _jsModulesDir = Path.Combine(env.WebRootPath, "js", "plugin-modules");
        _orderPath    = Path.Combine(_pluginsDir, "plugin-order.json");
        Directory.CreateDirectory(_pluginsDir);
        Directory.CreateDirectory(_jsModulesDir);
        LoadOrderOverrides();
    }

    public IReadOnlyList<PluginDescriptor> All =>
        _plugins.Values
            .Select(e => new PluginDescriptor(
                e.Module.Id,
                e.Module.Label,
                GetEffectiveNavOrder(e.Module)))
            .OrderBy(m => m.NavOrder)
            .ThenBy(m => m.Label, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public bool TryGet(string id, out IPluginModule? module)
    {
        if (_plugins.TryGetValue(id, out var entry)) { module = entry.Module; return true; }
        module = null;
        return false;
    }

    /// <summary>Loads all *.plugin.dll files found in the plugins directory at startup.</summary>
    public void LoadFromDirectory()
    {
        foreach (var dll in Directory.GetFiles(_pluginsDir, "*.plugin.dll"))
        {
            if (File.Exists(DeleteMarkerPath(dll)))
            {
                CleanupMarkedDll(dll);
                continue;
            }

            try { LoadDll(dll); }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[PluginRegistry] Skipped {Path.GetFileName(dll)}: {ex.Message}");
            }
        }
    }

    /// <summary>
    /// Installs a plugin from a ZIP stream.
    /// The ZIP must contain at least one *.plugin.dll and a matching &lt;id&gt;.js file.
    /// </summary>
    public async Task<string> InstallZipAsync(Stream zipStream)
    {
        using var zip = new ZipArchive(zipStream, ZipArchiveMode.Read);

        string? dllPath = null;
        var extractedFiles = new List<string>();
        var extractedJsFiles = new List<string>();

        try
        {
            foreach (var entry in zip.Entries)
            {
                if (entry.Name.EndsWith(".plugin.dll", StringComparison.OrdinalIgnoreCase))
                {
                    var dllFileName =
                        $"{Path.GetFileNameWithoutExtension(entry.Name)}-{Guid.NewGuid():N}.plugin.dll";
                    dllPath = Path.Combine(_pluginsDir, dllFileName);
                    await using var fs = File.Create(dllPath);
                    await using var es = entry.Open();
                    await es.CopyToAsync(fs);
                    extractedFiles.Add(dllPath);
                }
                else if (entry.Name.EndsWith(".js", StringComparison.OrdinalIgnoreCase))
                {
                    var jsPath = Path.Combine(_jsModulesDir, entry.Name);
                    await using var fs = File.Create(jsPath);
                    await using var es = entry.Open();
                    await es.CopyToAsync(fs);
                    extractedFiles.Add(jsPath);
                    extractedJsFiles.Add(jsPath);
                }
            }

            if (dllPath is null)
                throw new InvalidOperationException("ZIP must contain a *.plugin.dll file.");

            var moduleIds = InspectModuleIds(dllPath);
            var missingJs = moduleIds
                .Where(id => !HasExtractedJs(extractedJsFiles, id))
                .ToArray();

            if (missingJs.Length > 0)
            {
                throw new InvalidOperationException(
                    $"ZIP must contain matching frontend module(s): {string.Join(", ", missingJs.Select(id => $"{id}.js"))}.");
            }

            return LoadDll(dllPath);
        }
        catch
        {
            foreach (var path in extractedFiles)
                TryDeleteFile(path);

            throw;
        }
    }

    public bool Unload(string id)
    {
        if (!_plugins.TryGetValue(id, out var entry)) return false;
        _plugins.Remove(id);
        var orderChanged = _navOrderOverrides.Remove(id);
        entry.Context.Unload();
        CollectUnloadedAssemblies();
        DeletePluginFiles(entry);
        if (orderChanged)
        {
            SaveOrderOverrides();
        }
        return true;
    }

    public string[] SaveOrder(IReadOnlyDictionary<string, int> pluginOrders)
    {
        var unknown = pluginOrders.Keys
            .Where(id => !_plugins.ContainsKey(id))
            .ToArray();
        if (unknown.Length > 0)
        {
            return unknown;
        }

        _navOrderOverrides.Clear();
        foreach (var (id, navOrder) in pluginOrders)
        {
            _navOrderOverrides[id] = navOrder;
        }

        SaveOrderOverrides();
        return [];
    }

    private string LoadDll(string dllPath)
    {
        var ctx = new PluginLoadContext(dllPath);
        try
        {
            var asm         = ctx.LoadFromAssemblyPath(dllPath);
            var moduleTypes = asm.GetExportedTypes()
                .Where(t => typeof(IPluginModule).IsAssignableFrom(t) && !t.IsAbstract)
                .ToList();

            if (moduleTypes.Count == 0)
            {
                ctx.Unload();
                throw new InvalidOperationException("No IPluginModule implementations found in the assembly.");
            }

            string firstId = string.Empty;
            foreach (var type in moduleTypes)
            {
                var mod = (IPluginModule)Activator.CreateInstance(type)!;
                if (!IsSafePluginId(mod.Id))
                {
                    throw new InvalidOperationException(
                        $"Plugin id '{mod.Id}' is invalid. Use only letters, digits, '-' and '_'.");
                }

                var jsPath = Path.Combine(_jsModulesDir, $"{mod.Id}.js");
                if (!File.Exists(jsPath))
                {
                    throw new InvalidOperationException(
                        $"Missing frontend module '{Path.GetFileName(jsPath)}'.");
                }

                // Hot-reload: unload previous version if present
                if (_plugins.TryGetValue(mod.Id, out var old))
                {
                    _plugins.Remove(mod.Id);
                    old.Context.Unload();
                    CollectUnloadedAssemblies();
                    DeletePluginDll(old.DllPath);
                }

                _plugins[mod.Id] = new(mod, ctx, dllPath, jsPath);
                if (firstId.Length == 0) firstId = mod.Id;
            }

            return firstId;
        }
        catch
        {
            ctx.Unload();
            throw;
        }
    }

    private IReadOnlyList<string> InspectModuleIds(string dllPath)
    {
        var ctx = new PluginLoadContext(dllPath);
        try
        {
            var asm = ctx.LoadFromAssemblyPath(dllPath);
            var moduleIds = asm.GetExportedTypes()
                .Where(t => typeof(IPluginModule).IsAssignableFrom(t) && !t.IsAbstract)
                .Select(t => ((IPluginModule)Activator.CreateInstance(t)!).Id)
                .ToArray();

            if (moduleIds.Length == 0)
            {
                throw new InvalidOperationException("No IPluginModule implementations found in the assembly.");
            }

            foreach (var id in moduleIds)
            {
                if (!IsSafePluginId(id))
                {
                    throw new InvalidOperationException(
                        $"Plugin id '{id}' is invalid. Use only letters, digits, '-' and '_'.");
                }
            }

            return moduleIds;
        }
        finally
        {
            ctx.Unload();
            CollectUnloadedAssemblies();
        }
    }

    private bool HasExtractedJs(IEnumerable<string> extractedJsFiles, string moduleId)
    {
        var expectedJsPath = Path.Combine(_jsModulesDir, $"{moduleId}.js");
        return extractedJsFiles.Any(path =>
            string.Equals(
                Path.GetFullPath(path),
                Path.GetFullPath(expectedJsPath),
            StringComparison.OrdinalIgnoreCase));
    }

    private int GetEffectiveNavOrder(IPluginModule module) =>
        _navOrderOverrides.TryGetValue(module.Id, out var navOrder)
            ? navOrder
            : 10_000 + module.NavOrder;

    private static bool IsSafePluginId(string id) =>
        !string.IsNullOrWhiteSpace(id) &&
        id.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');

    private void LoadOrderOverrides()
    {
        if (!File.Exists(_orderPath))
        {
            return;
        }

        try
        {
            var loaded = JsonSerializer.Deserialize<Dictionary<string, int>>(
                File.ReadAllText(_orderPath));
            if (loaded is null)
            {
                return;
            }

            foreach (var (id, navOrder) in loaded)
            {
                if (IsSafePluginId(id))
                {
                    _navOrderOverrides[id] = navOrder;
                }
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PluginRegistry] Could not read plugin order: {ex.Message}");
        }
    }

    private void SaveOrderOverrides()
    {
        try
        {
            var ordered = _navOrderOverrides
                .OrderBy(item => item.Value)
                .ThenBy(item => item.Key, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(item => item.Key, item => item.Value, StringComparer.OrdinalIgnoreCase);
            var json = JsonSerializer.Serialize(ordered, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_orderPath, json);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PluginRegistry] Could not save plugin order: {ex.Message}");
        }
    }

    private static void CollectUnloadedAssemblies()
    {
        GC.Collect();
        GC.WaitForPendingFinalizers();
        GC.Collect();
    }

    private static void CleanupMarkedDll(string dllPath)
    {
        if (TryDeleteFile(dllPath))
        {
            TryDeleteFile(DeleteMarkerPath(dllPath));
        }
    }

    private static void DeletePluginFiles(PluginEntry entry)
    {
        DeletePluginDll(entry.DllPath);
        TryDeleteFile(entry.JsPath);
    }

    private static void DeletePluginDll(string dllPath)
    {
        MarkDllDeleted(dllPath);
        CleanupMarkedDll(dllPath);
    }

    private static void MarkDllDeleted(string dllPath)
    {
        try
        {
            File.WriteAllText(
                DeleteMarkerPath(dllPath),
                $"Deleted at {DateTimeOffset.UtcNow:O}");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PluginRegistry] Could not mark {dllPath} as deleted: {ex.Message}");
        }
    }

    private static string DeleteMarkerPath(string dllPath) => $"{dllPath}.delete";

    private static bool TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
                File.Delete(path);
            return !File.Exists(path);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[PluginRegistry] Could not delete {path}: {ex.Message}");
            return false;
        }
    }
}

public sealed record PluginDescriptor(string Id, string Label, int NavOrder);
