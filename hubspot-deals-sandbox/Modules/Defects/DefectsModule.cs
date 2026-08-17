namespace HubSpotDealsSandbox.Modules.Defects;

/// <summary>
/// Manufacturing QA module: defect/inspection records instead of CRM deals.
/// Registered through the same ICrmSandboxModule contract as Deals/Contacts/
/// Companies, but backed by its own in-memory store instead of HubSpot -
/// demonstrates the module system is not tied to a single external system.
/// </summary>
public sealed class DefectsModule : ICrmSandboxModule
{
    public string Id => "defects";

    public string Label => "Defects (QA)";

    public int NavOrder => 4;

    public void RegisterServices(IServiceCollection services) =>
        services.AddSingleton<DefectsService>();

    public void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapDefectEndpoints();

    public Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        IServiceProvider services,
        CancellationToken cancellationToken) =>
        services.GetRequiredService<DefectsService>().BuildBootstrapAsync(cancellationToken);
}
