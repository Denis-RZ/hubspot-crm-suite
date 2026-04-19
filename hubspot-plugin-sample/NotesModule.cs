using System.Text.Json;
using HubSpotSandbox.Plugin.Abstractions;
using Microsoft.AspNetCore.Http;

namespace HubSpotPlugin.Sample;

/// <summary>
/// Demo plugin: an in-memory notepad.
/// Demonstrates GET (list) and POST (add/delete) over the plugin dispatcher.
/// Notes are lost on server restart — this is intentional for demo simplicity.
/// </summary>
public sealed class NotesModule : IPluginModule
{
    private static readonly List<NoteEntry> _notes = [];
    private static int _nextId = 1;

    public string Id       => "notes";
    public string Label    => "Notes";
    public int    NavOrder => 90;

    public async Task<object?> HandleAsync(string action, HttpRequest request, CancellationToken ct)
    {
        return action switch
        {
            "list"   => _notes.OrderByDescending(n => n.Id).ToArray(),
            "add"    => await AddAsync(request, ct),
            "delete" => await DeleteAsync(request, ct),
            _        => throw new NotSupportedException($"Unknown action '{action}'.")
        };
    }

    private static async Task<object?> AddAsync(HttpRequest request, CancellationToken ct)
    {
        var body = await JsonSerializer.DeserializeAsync<AddRequest>(
            request.Body,
            new JsonSerializerOptions(JsonSerializerDefaults.Web),
            ct);

        if (string.IsNullOrWhiteSpace(body?.Text))
            throw new ArgumentException("'text' is required.");

        var note = new NoteEntry(_nextId++, body.Text.Trim(), DateTime.UtcNow);
        _notes.Add(note);
        return note;
    }

    private static Task<object?> DeleteAsync(HttpRequest request, CancellationToken ct)
    {
        if (!int.TryParse(request.RouteValues["pluginTail"]?.ToString(), out var id))
            throw new ArgumentException("Provide id as route segment: /api/plugin/notes/delete/{id}");

        var removed = _notes.RemoveAll(n => n.Id == id);
        return Task.FromResult<object?>(new { deleted = removed > 0 });
    }

    private record AddRequest(string? Text);
    private record NoteEntry(int Id, string Text, DateTime CreatedAt);
}
