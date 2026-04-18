namespace HubSpotDealsSandbox.Modules.Companies;

public sealed class CompaniesModule : ICrmSandboxModule
{
    public string Id => "companies";

    public string Label => "Companies";

    public int NavOrder => 3;

    public void RegisterServices(IServiceCollection services) =>
        services.AddScoped<CompaniesService>();

    public void MapEndpoints(IEndpointRouteBuilder app) =>
        app.MapCompanyEndpoints();

    public Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        IServiceProvider services,
        CancellationToken cancellationToken) =>
        services.GetRequiredService<CompaniesService>().BuildBootstrapAsync(cancellationToken);
}
