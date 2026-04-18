namespace HubSpotDealsSandbox.Modules;

public interface ICrmSandboxModule
{
    string Id { get; }

    string Label { get; }

    int NavOrder { get; }

    void RegisterServices(IServiceCollection services);

    void MapEndpoints(IEndpointRouteBuilder app);

    Task<IReadOnlyDictionary<string, object?>> BuildBootstrapAsync(
        IServiceProvider services,
        CancellationToken cancellationToken);
}

public sealed record EnabledModuleDescriptor(string Id, string Label, int NavOrder);
