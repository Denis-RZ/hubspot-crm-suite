using HubSpotCrmLocalStand.Data;
using HubSpotCrmLocalStand.Models;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<CrmMockStore>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "HubSpot-like CRM Local Stand",
        Version = "v1",
        Description = "Local in-memory stand for exploring deals, contacts, companies, pipelines, properties, and associations."
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();

app.MapGet("/", () => Results.Redirect("/swagger"))
    .ExcludeFromDescription();

app.MapGet("/health", () => TypedResults.Ok(new { status = "ok" }))
    .WithTags("Overview");

var crm = app.MapGroup("/crm/v3");

crm.MapGet("/mock/schema", (CrmMockStore store) => TypedResults.Ok(store.GetOverview()))
    .WithTags("Overview")
    .WithName("GetMockSchema");

var properties = crm.MapGroup("/properties").WithTags("Properties");

properties.MapGet("/deals", (CrmMockStore store) => TypedResults.Ok(store.GetDealPropertyDefinitions()))
    .WithName("GetDealPropertyDefinitions");

properties.MapGet("/contacts", (CrmMockStore store) => TypedResults.Ok(store.GetContactPropertyDefinitions()))
    .WithName("GetContactPropertyDefinitions");

properties.MapGet("/companies", (CrmMockStore store) => TypedResults.Ok(store.GetCompanyPropertyDefinitions()))
    .WithName("GetCompanyPropertyDefinitions");

properties.MapGet("/notes", (CrmMockStore store) => TypedResults.Ok(store.GetNotePropertyDefinitions()))
    .WithName("GetNotePropertyDefinitions");

properties.MapGet("/tasks", (CrmMockStore store) => TypedResults.Ok(store.GetTaskPropertyDefinitions()))
    .WithName("GetTaskPropertyDefinitions");

crm.MapGet("/pipelines/deals", (CrmMockStore store) => TypedResults.Ok(store.GetDealPipelines()))
    .WithTags("Pipelines")
    .WithName("GetDealPipelines");

var deals = crm.MapGroup("/objects/deals").WithTags("Deals");

deals.MapGet("/", (int? limit, CrmMockStore store) =>
    TypedResults.Ok(store.GetDeals(limit ?? 10)))
    .WithName("ListDeals");

deals.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var deal = store.GetDeal(id);
    return deal is null
        ? Results.NotFound(new { message = $"Deal '{id}' was not found." })
        : Results.Ok(deal);
})
    .WithName("GetDealById");

deals.MapPost("/", (CrmMutationRequest<DealProperties> request, CrmMockStore store) =>
{
    var created = store.CreateDeal(request);
    return Results.Created($"/crm/v3/objects/deals/{created.Id}", created);
})
    .WithName("CreateDeal");

deals.MapPatch("/{id}", (string id, CrmMutationRequest<DealProperties> request, CrmMockStore store) =>
{
    var updated = store.UpdateDeal(id, request);
    return updated is null
        ? Results.NotFound(new { message = $"Deal '{id}' was not found." })
        : Results.Ok(updated);
})
    .WithName("UpdateDeal");

var contacts = crm.MapGroup("/objects/contacts").WithTags("Contacts");

contacts.MapGet("/", (int? limit, CrmMockStore store) =>
    TypedResults.Ok(store.GetContacts(limit ?? 10)))
    .WithName("ListContacts");

contacts.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var contact = store.GetContact(id);
    return contact is null
        ? Results.NotFound(new { message = $"Contact '{id}' was not found." })
        : Results.Ok(contact);
})
    .WithName("GetContactById");

contacts.MapPost("/", (CrmMutationRequest<ContactProperties> request, CrmMockStore store) =>
{
    var created = store.CreateContact(request);
    return Results.Created($"/crm/v3/objects/contacts/{created.Id}", created);
})
    .WithName("CreateContact");

contacts.MapPatch("/{id}", (string id, CrmMutationRequest<ContactProperties> request, CrmMockStore store) =>
{
    var updated = store.UpdateContact(id, request);
    return updated is null
        ? Results.NotFound(new { message = $"Contact '{id}' was not found." })
        : Results.Ok(updated);
})
    .WithName("UpdateContact");

var companies = crm.MapGroup("/objects/companies").WithTags("Companies");

companies.MapGet("/", (int? limit, CrmMockStore store) =>
    TypedResults.Ok(store.GetCompanies(limit ?? 10)))
    .WithName("ListCompanies");

companies.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var company = store.GetCompany(id);
    return company is null
        ? Results.NotFound(new { message = $"Company '{id}' was not found." })
        : Results.Ok(company);
})
    .WithName("GetCompanyById");

companies.MapPost("/", (CrmMutationRequest<CompanyProperties> request, CrmMockStore store) =>
{
    var created = store.CreateCompany(request);
    return Results.Created($"/crm/v3/objects/companies/{created.Id}", created);
})
    .WithName("CreateCompany");

companies.MapPatch("/{id}", (string id, CrmMutationRequest<CompanyProperties> request, CrmMockStore store) =>
{
    var updated = store.UpdateCompany(id, request);
    return updated is null
        ? Results.NotFound(new { message = $"Company '{id}' was not found." })
        : Results.Ok(updated);
})
    .WithName("UpdateCompany");

var owners = crm.MapGroup("/owners").WithTags("Owners");

owners.MapGet("/", (CrmMockStore store) => TypedResults.Ok(store.GetOwners()))
    .WithName("ListOwners");

owners.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var owner = store.GetOwner(id);
    return owner is null
        ? Results.NotFound(new { message = $"Owner '{id}' was not found." })
        : Results.Ok(owner);
})
    .WithName("GetOwnerById");

var notes = crm.MapGroup("/objects/notes").WithTags("Notes");

notes.MapGet("/", (int? limit, CrmMockStore store) =>
    TypedResults.Ok(store.GetNotes(limit ?? 10)))
    .WithName("ListNotes");

notes.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var note = store.GetNote(id);
    return note is null
        ? Results.NotFound(new { message = $"Note '{id}' was not found." })
        : Results.Ok(note);
})
    .WithName("GetNoteById");

notes.MapPost("/", (CrmMutationRequest<NoteProperties> request, CrmMockStore store) =>
{
    var created = store.CreateNote(request);
    return Results.Created($"/crm/v3/objects/notes/{created.Id}", created);
})
    .WithName("CreateNote");

notes.MapPatch("/{id}", (string id, CrmMutationRequest<NoteProperties> request, CrmMockStore store) =>
{
    var updated = store.UpdateNote(id, request);
    return updated is null
        ? Results.NotFound(new { message = $"Note '{id}' was not found." })
        : Results.Ok(updated);
})
    .WithName("UpdateNote");

var tasks = crm.MapGroup("/objects/tasks").WithTags("Tasks");

tasks.MapGet("/", (int? limit, CrmMockStore store) =>
    TypedResults.Ok(store.GetTasks(limit ?? 10)))
    .WithName("ListTasks");

tasks.MapGet("/{id}", (string id, CrmMockStore store) =>
{
    var task = store.GetTask(id);
    return task is null
        ? Results.NotFound(new { message = $"Task '{id}' was not found." })
        : Results.Ok(task);
})
    .WithName("GetTaskById");

tasks.MapPost("/", (CrmMutationRequest<TaskProperties> request, CrmMockStore store) =>
{
    var created = store.CreateTask(request);
    return Results.Created($"/crm/v3/objects/tasks/{created.Id}", created);
})
    .WithName("CreateTask");

tasks.MapPatch("/{id}", (string id, CrmMutationRequest<TaskProperties> request, CrmMockStore store) =>
{
    var updated = store.UpdateTask(id, request);
    return updated is null
        ? Results.NotFound(new { message = $"Task '{id}' was not found." })
        : Results.Ok(updated);
})
    .WithName("UpdateTask");

app.Run();
