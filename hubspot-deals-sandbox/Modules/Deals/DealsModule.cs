namespace HubSpotDealsSandbox.Modules.Deals;

public sealed class DealsModule : ICrmSandboxModule
{
    public string Id => "deals";

    public string Label => "Deals";

    public int NavOrder => 1;

    public void RegisterServices(IServiceCollection services) =>
        services.AddScoped<DealsService>();

    public void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapDealEndpoints();

    public Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        IServiceProvider services,
        CancellationToken cancellationToken) =>
        services.GetRequiredService<DealsService>().BuildBootstrapAsync(cancellationToken);
}
