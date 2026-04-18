namespace HubSpotDealsSandbox.Modules.Contacts;

public sealed class ContactsModule : ICrmSandboxModule
{
    public string Id => "contacts";

    public string Label => "Contacts";

    public int NavOrder => 2;

    public void RegisterServices(IServiceCollection services) =>
        services.AddScoped<ContactsService>();

    public void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapContactEndpoints();

    public Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        IServiceProvider services,
        CancellationToken cancellationToken) =>
        services.GetRequiredService<ContactsService>().BuildBootstrapAsync(cancellationToken);
}
