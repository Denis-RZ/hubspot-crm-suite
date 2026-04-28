using HubSpotDealsSandbox.HubSpot;
using HubSpotDealsSandbox.HubSpot.Models;

namespace HubSpotDealsSandbox.Modules.Contacts;

public sealed class ContactsService
{
    private readonly HubSpotDealsClient _client;

    public ContactsService(HubSpotDealsClient client)
    {
        _client = client;
    }

    public async Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        CancellationToken cancellationToken = default)
    {
        var contactsTask = _client.ListContactsAsync(100, cancellationToken);
        var lifecycleOptionsTask = _client.GetContactLifecycleOptionsAsync(cancellationToken);

        await Task.WhenAll(contactsTask, lifecycleOptionsTask);

        return new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["contacts"] = await contactsTask,
            ["contactLifecycleOptions"] = await lifecycleOptionsTask
        };
    }

    public Task<IReadOnlyList<HubSpotCrmRecord>> ListAsync(
        int limit = 100,
        CancellationToken cancellationToken = default) =>
        _client.ListContactsAsync(limit, cancellationToken);

    public Task<HubSpotCrmRecord> CreateAsync(
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.CreateContactAsync(request, cancellationToken);
    }

    public Task<HubSpotCrmRecord> UpdateAsync(
        string contactId,
        Dictionary<string, string?> properties,
        CancellationToken cancellationToken = default)
    {
        var request = new HubSpotCrmMutationRequest { Properties = properties };
        return _client.UpdateContactAsync(contactId, request, cancellationToken);
    }

    public Task DeleteAsync(
        string contactId,
        CancellationToken cancellationToken = default) =>
        _client.DeleteContactAsync(contactId, cancellationToken);
}
