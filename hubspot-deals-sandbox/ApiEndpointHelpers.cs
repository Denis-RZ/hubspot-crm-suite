namespace HubSpotDealsSandbox;

public static class ApiEndpointHelpers
{
    public static async Task<IResult> ExecuteAsync(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (ArgumentException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { message = ex.Message });
        }
    }

    public static async Task<IFormFile> ReadUploadedCsvAsync(
        HttpRequest request,
        CancellationToken cancellationToken)
    {
        var form = await request.ReadFormAsync(cancellationToken);
        var file = form.Files["file"];

        if (file is null || file.Length == 0)
        {
            throw new InvalidOperationException("Upload a non-empty CSV file in the form field named 'file'.");
        }

        return file;
    }
}
