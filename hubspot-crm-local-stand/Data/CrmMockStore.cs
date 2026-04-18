using HubSpotCrmLocalStand.Models;

namespace HubSpotCrmLocalStand.Data;

public sealed class CrmMockStore
{
    private readonly Dictionary<string, StoredEntity<DealProperties>> _deals = [];
    private readonly Dictionary<string, StoredEntity<ContactProperties>> _contacts = [];
    private readonly Dictionary<string, StoredEntity<CompanyProperties>> _companies = [];
    private readonly Dictionary<string, StoredEntity<NoteProperties>> _notes = [];
    private readonly Dictionary<string, StoredEntity<TaskProperties>> _tasks = [];

    private static readonly IReadOnlyList<OwnerDto> Owners =
    [
        new() { Id = "1001", UserId = 1001, Email = "owner.alice@acme.example", FirstName = "Alice", LastName = "Chen" },
        new() { Id = "1002", UserId = 1002, Email = "owner.ben@acme.example",   FirstName = "Ben",   LastName = "Hsu" }
    ];

    private int _nextDealId = 9100;
    private int _nextContactId = 3100;
    private int _nextCompanyId = 4100;
    private int _nextNoteId = 7100;
    private int _nextTaskId = 8100;

    public CrmMockStore()
    {
        Seed();
    }

    public CrmOverviewDto GetOverview() =>
        new()
        {
            Notes =
            [
                "This is a local in-memory stand, not a real HubSpot instance.",
                "Endpoints are intentionally HubSpot-like so you can inspect object shape and relationships.",
                "PATCH merges only the non-null property values and appends any new associations."
            ],
            Endpoints =
            [
                "/crm/v3/objects/deals",
                "/crm/v3/objects/contacts",
                "/crm/v3/objects/companies",
                "/crm/v3/objects/notes",
                "/crm/v3/objects/tasks",
                "/crm/v3/properties/deals",
                "/crm/v3/properties/contacts",
                "/crm/v3/properties/companies",
                "/crm/v3/properties/notes",
                "/crm/v3/properties/tasks",
                "/crm/v3/pipelines/deals",
                "/crm/v3/owners"
            ]
        };

    public ListResponse<PropertyDefinitionDto> GetDealPropertyDefinitions() =>
        new()
        {
            Results =
            [
                new() { Name = "dealname", Label = "Deal name", Type = "string", Description = "Human-readable deal title.", Example = "Cooling retrofit for AI rack", RequiredForCreate = true },
                new() { Name = "amount", Label = "Amount", Type = "string", Description = "Expected deal amount.", Example = "45000", RequiredForCreate = false },
                new() { Name = "dealstage", Label = "Deal stage", Type = "string", Description = "Current pipeline stage id.", Example = "qualifiedtobuy", RequiredForCreate = true },
                new() { Name = "pipeline", Label = "Pipeline", Type = "string", Description = "Pipeline id.", Example = "default", RequiredForCreate = true },
                new() { Name = "closedate", Label = "Close date", Type = "datetime", Description = "Expected close date.", Example = "2026-05-15T00:00:00Z", RequiredForCreate = false }
            ]
        };

    public ListResponse<PropertyDefinitionDto> GetContactPropertyDefinitions() =>
        new()
        {
            Results =
            [
                new() { Name = "email", Label = "Email", Type = "string", Description = "Primary email address.", Example = "alice@northwind.example", RequiredForCreate = true },
                new() { Name = "firstname", Label = "First name", Type = "string", Description = "Contact first name.", Example = "Alice", RequiredForCreate = false },
                new() { Name = "lastname", Label = "Last name", Type = "string", Description = "Contact last name.", Example = "Chen", RequiredForCreate = false },
                new() { Name = "phone", Label = "Phone", Type = "string", Description = "Primary phone number.", Example = "+886-3-555-0101", RequiredForCreate = false },
                new() { Name = "lifecyclestage", Label = "Lifecycle stage", Type = "string", Description = "Commercial lifecycle stage.", Example = "lead", RequiredForCreate = false }
            ]
        };

    public ListResponse<PropertyDefinitionDto> GetCompanyPropertyDefinitions() =>
        new()
        {
            Results =
            [
                new() { Name = "name", Label = "Company name", Type = "string", Description = "Organization display name.", Example = "Northwind Data Systems", RequiredForCreate = true },
                new() { Name = "domain", Label = "Domain", Type = "string", Description = "Company website domain.", Example = "northwind.example", RequiredForCreate = false },
                new() { Name = "city", Label = "City", Type = "string", Description = "Headquarters city.", Example = "Taoyuan", RequiredForCreate = false },
                new() { Name = "industry", Label = "Industry", Type = "string", Description = "Industry tag.", Example = "AI Infrastructure", RequiredForCreate = false }
            ]
        };

    public ListResponse<PropertyDefinitionDto> GetNotePropertyDefinitions() =>
        new()
        {
            Results =
            [
                new() { Name = "hs_note_body",      Label = "Note body",   Type = "string",   Description = "Plain-text content of the note.",        Example = "Discussed liquid cooling requirements.",   RequiredForCreate = true  },
                new() { Name = "hs_timestamp",      Label = "Timestamp",   Type = "datetime", Description = "When the note was recorded.",             Example = "2026-04-15T10:00:00Z",                     RequiredForCreate = false },
                new() { Name = "hubspot_owner_id",  Label = "Owner ID",    Type = "string",   Description = "ID of the owner who created the note.",   Example = "1001",                                     RequiredForCreate = false }
            ]
        };

    public ListResponse<PropertyDefinitionDto> GetTaskPropertyDefinitions() =>
        new()
        {
            Results =
            [
                new() { Name = "hs_task_subject",   Label = "Subject",     Type = "string",   Description = "Short description of the task.",          Example = "Follow up on cooling proposal",            RequiredForCreate = true  },
                new() { Name = "hs_task_body",      Label = "Body",        Type = "string",   Description = "Detailed notes for the task.",            Example = "Send revised quote by Friday.",             RequiredForCreate = false },
                new() { Name = "hs_task_status",    Label = "Status",      Type = "string",   Description = "NOT_STARTED | IN_PROGRESS | WAITING | DEFERRED | COMPLETED", Example = "NOT_STARTED",           RequiredForCreate = false },
                new() { Name = "hs_task_priority",  Label = "Priority",    Type = "string",   Description = "HIGH | MEDIUM | LOW",                     Example = "HIGH",                                     RequiredForCreate = false },
                new() { Name = "hs_timestamp",      Label = "Due date",    Type = "datetime", Description = "Task due date.",                          Example = "2026-04-25T09:00:00Z",                     RequiredForCreate = false },
                new() { Name = "hubspot_owner_id",  Label = "Owner ID",    Type = "string",   Description = "Assigned owner.",                         Example = "1001",                                     RequiredForCreate = false }
            ]
        };

    public PipelineListResponse GetDealPipelines() =>
        new()
        {
            Results =
            [
                new()
                {
                    Id = "default",
                    Label = "Sales pipeline",
                    DisplayOrder = 0,
                    Stages =
                    [
                        new() { Id = "appointmentscheduled", Label = "Appointment scheduled", DisplayOrder = 0 },
                        new() { Id = "qualifiedtobuy", Label = "Qualified to buy", DisplayOrder = 1 },
                        new() { Id = "presentationscheduled", Label = "Presentation scheduled", DisplayOrder = 2 },
                        new() { Id = "decisionmakerboughtin", Label = "Decision maker bought-in", DisplayOrder = 3 },
                        new() { Id = "contractsent", Label = "Contract sent", DisplayOrder = 4 },
                        new() { Id = "closedwon", Label = "Closed won", DisplayOrder = 5 },
                        new() { Id = "closedlost", Label = "Closed lost", DisplayOrder = 6 }
                    ]
                }
            ]
        };

    public ListResponse<CrmEntityResponse<DealProperties>> GetDeals(int limit) =>
        new()
        {
            Results = _deals.Values
                .OrderByDescending(x => x.UpdatedAt)
                .Take(NormalizeLimit(limit))
                .Select(ToResponse)
                .ToList()
        };

    public CrmEntityResponse<DealProperties>? GetDeal(string id) =>
        _deals.TryGetValue(id, out var deal) ? ToResponse(deal) : null;

    public CrmEntityResponse<DealProperties> CreateDeal(CrmMutationRequest<DealProperties> request)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Interlocked.Increment(ref _nextDealId).ToString();
        var entity = new StoredEntity<DealProperties>
        {
            Id = id,
            CreatedAt = now,
            UpdatedAt = now,
            Properties = request.Properties ?? new DealProperties(),
            Associations = []
        };

        _deals[id] = entity;
        AppendAssociations("deals", id, request.Associations);
        return ToResponse(entity);
    }

    public CrmEntityResponse<DealProperties>? UpdateDeal(string id, CrmMutationRequest<DealProperties> request)
    {
        if (!_deals.TryGetValue(id, out var entity))
        {
            return null;
        }

        entity.Properties = Merge(entity.Properties, request.Properties ?? new DealProperties());
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        AppendAssociations("deals", id, request.Associations);
        return ToResponse(entity);
    }

    public ListResponse<CrmEntityResponse<ContactProperties>> GetContacts(int limit) =>
        new()
        {
            Results = _contacts.Values
                .OrderByDescending(x => x.UpdatedAt)
                .Take(NormalizeLimit(limit))
                .Select(ToResponse)
                .ToList()
        };

    public CrmEntityResponse<ContactProperties>? GetContact(string id) =>
        _contacts.TryGetValue(id, out var contact) ? ToResponse(contact) : null;

    public CrmEntityResponse<ContactProperties> CreateContact(CrmMutationRequest<ContactProperties> request)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Interlocked.Increment(ref _nextContactId).ToString();
        var entity = new StoredEntity<ContactProperties>
        {
            Id = id,
            CreatedAt = now,
            UpdatedAt = now,
            Properties = request.Properties ?? new ContactProperties(),
            Associations = []
        };

        _contacts[id] = entity;
        AppendAssociations("contacts", id, request.Associations);
        return ToResponse(entity);
    }

    public CrmEntityResponse<ContactProperties>? UpdateContact(string id, CrmMutationRequest<ContactProperties> request)
    {
        if (!_contacts.TryGetValue(id, out var entity))
        {
            return null;
        }

        entity.Properties = Merge(entity.Properties, request.Properties ?? new ContactProperties());
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        AppendAssociations("contacts", id, request.Associations);
        return ToResponse(entity);
    }

    public ListResponse<CrmEntityResponse<CompanyProperties>> GetCompanies(int limit) =>
        new()
        {
            Results = _companies.Values
                .OrderByDescending(x => x.UpdatedAt)
                .Take(NormalizeLimit(limit))
                .Select(ToResponse)
                .ToList()
        };

    public CrmEntityResponse<CompanyProperties>? GetCompany(string id) =>
        _companies.TryGetValue(id, out var company) ? ToResponse(company) : null;

    public CrmEntityResponse<CompanyProperties> CreateCompany(CrmMutationRequest<CompanyProperties> request)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Interlocked.Increment(ref _nextCompanyId).ToString();
        var entity = new StoredEntity<CompanyProperties>
        {
            Id = id,
            CreatedAt = now,
            UpdatedAt = now,
            Properties = request.Properties ?? new CompanyProperties(),
            Associations = []
        };

        _companies[id] = entity;
        AppendAssociations("companies", id, request.Associations);
        return ToResponse(entity);
    }

    public CrmEntityResponse<CompanyProperties>? UpdateCompany(string id, CrmMutationRequest<CompanyProperties> request)
    {
        if (!_companies.TryGetValue(id, out var entity))
        {
            return null;
        }

        entity.Properties = Merge(entity.Properties, request.Properties ?? new CompanyProperties());
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        AppendAssociations("companies", id, request.Associations);
        return ToResponse(entity);
    }

    public IReadOnlyList<OwnerDto> GetOwners() => Owners;

    public OwnerDto? GetOwner(string id) =>
        Owners.FirstOrDefault(o => o.Id == id);

    public ListResponse<CrmEntityResponse<NoteProperties>> GetNotes(int limit) =>
        new()
        {
            Results = _notes.Values
                .OrderByDescending(x => x.UpdatedAt)
                .Take(NormalizeLimit(limit))
                .Select(ToResponse)
                .ToList()
        };

    public CrmEntityResponse<NoteProperties>? GetNote(string id) =>
        _notes.TryGetValue(id, out var note) ? ToResponse(note) : null;

    public CrmEntityResponse<NoteProperties> CreateNote(CrmMutationRequest<NoteProperties> request)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Interlocked.Increment(ref _nextNoteId).ToString();
        var entity = new StoredEntity<NoteProperties>
        {
            Id = id,
            CreatedAt = now,
            UpdatedAt = now,
            Properties = request.Properties ?? new NoteProperties(),
            Associations = []
        };

        _notes[id] = entity;
        AppendAssociations("notes", id, request.Associations);
        return ToResponse(entity);
    }

    public CrmEntityResponse<NoteProperties>? UpdateNote(string id, CrmMutationRequest<NoteProperties> request)
    {
        if (!_notes.TryGetValue(id, out var entity))
        {
            return null;
        }

        entity.Properties = Merge(entity.Properties, request.Properties ?? new NoteProperties());
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        AppendAssociations("notes", id, request.Associations);
        return ToResponse(entity);
    }

    public ListResponse<CrmEntityResponse<TaskProperties>> GetTasks(int limit) =>
        new()
        {
            Results = _tasks.Values
                .OrderByDescending(x => x.UpdatedAt)
                .Take(NormalizeLimit(limit))
                .Select(ToResponse)
                .ToList()
        };

    public CrmEntityResponse<TaskProperties>? GetTask(string id) =>
        _tasks.TryGetValue(id, out var task) ? ToResponse(task) : null;

    public CrmEntityResponse<TaskProperties> CreateTask(CrmMutationRequest<TaskProperties> request)
    {
        var now = DateTimeOffset.UtcNow;
        var id = Interlocked.Increment(ref _nextTaskId).ToString();
        var entity = new StoredEntity<TaskProperties>
        {
            Id = id,
            CreatedAt = now,
            UpdatedAt = now,
            Properties = request.Properties ?? new TaskProperties(),
            Associations = []
        };

        _tasks[id] = entity;
        AppendAssociations("tasks", id, request.Associations);
        return ToResponse(entity);
    }

    public CrmEntityResponse<TaskProperties>? UpdateTask(string id, CrmMutationRequest<TaskProperties> request)
    {
        if (!_tasks.TryGetValue(id, out var entity))
        {
            return null;
        }

        entity.Properties = Merge(entity.Properties, request.Properties ?? new TaskProperties());
        entity.UpdatedAt = DateTimeOffset.UtcNow;
        AppendAssociations("tasks", id, request.Associations);
        return ToResponse(entity);
    }

    private void Seed()
    {
        var baseTime = DateTimeOffset.UtcNow.AddDays(-10);

        _contacts["3001"] = new StoredEntity<ContactProperties>
        {
            Id = "3001",
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddDays(2),
            Properties = new ContactProperties
            {
                Email = "alice.chen@northwind.example",
                FirstName = "Alice",
                LastName = "Chen",
                Phone = "+886-3-555-0101",
                LifecycleStage = "lead"
            },
            Associations = []
        };

        _contacts["3002"] = new StoredEntity<ContactProperties>
        {
            Id = "3002",
            CreatedAt = baseTime.AddDays(-1),
            UpdatedAt = baseTime.AddDays(3),
            Properties = new ContactProperties
            {
                Email = "ben.hsu@contoso.example",
                FirstName = "Ben",
                LastName = "Hsu",
                Phone = "+886-2-555-0147",
                LifecycleStage = "marketingqualifiedlead"
            },
            Associations = []
        };

        _companies["4001"] = new StoredEntity<CompanyProperties>
        {
            Id = "4001",
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddDays(2),
            Properties = new CompanyProperties
            {
                Name = "Northwind Data Systems",
                Domain = "northwind.example",
                City = "Taoyuan",
                Industry = "AI Infrastructure"
            },
            Associations = []
        };

        _companies["4002"] = new StoredEntity<CompanyProperties>
        {
            Id = "4002",
            CreatedAt = baseTime.AddDays(-2),
            UpdatedAt = baseTime.AddDays(1),
            Properties = new CompanyProperties
            {
                Name = "Contoso Thermal Labs",
                Domain = "contoso.example",
                City = "Taipei",
                Industry = "Industrial Cooling"
            },
            Associations = []
        };

        _deals["9001"] = new StoredEntity<DealProperties>
        {
            Id = "9001",
            CreatedAt = baseTime,
            UpdatedAt = baseTime.AddDays(4),
            Properties = new DealProperties
            {
                DealName = "AI rack liquid cooling retrofit",
                Amount = "45000",
                DealStage = "qualifiedtobuy",
                Pipeline = "default",
                CloseDate = baseTime.AddDays(20)
            },
            Associations = []
        };

        _deals["9002"] = new StoredEntity<DealProperties>
        {
            Id = "9002",
            CreatedAt = baseTime.AddDays(1),
            UpdatedAt = baseTime.AddDays(5),
            Properties = new DealProperties
            {
                DealName = "Prototype cold-plate evaluation",
                Amount = "18000",
                DealStage = "presentationscheduled",
                Pipeline = "default",
                CloseDate = baseTime.AddDays(14)
            },
            Associations = []
        };

        Link("deals", "9001", "contacts", "3001");
        Link("deals", "9001", "companies", "4001");
        Link("deals", "9002", "contacts", "3002");
        Link("deals", "9002", "companies", "4002");
        Link("contacts", "3001", "companies", "4001");
        Link("contacts", "3002", "companies", "4002");

        _notes["7001"] = new StoredEntity<NoteProperties>
        {
            Id = "7001",
            CreatedAt = baseTime.AddDays(2),
            UpdatedAt = baseTime.AddDays(2),
            Properties = new NoteProperties
            {
                Body = "Discussed liquid cooling retrofit requirements. Customer confirmed server room expansion planned for Q3.",
                Timestamp = baseTime.AddDays(2),
                OwnerId = "1001"
            },
            Associations = []
        };

        _notes["7002"] = new StoredEntity<NoteProperties>
        {
            Id = "7002",
            CreatedAt = baseTime.AddDays(3),
            UpdatedAt = baseTime.AddDays(3),
            Properties = new NoteProperties
            {
                Body = "Cold-plate prototype samples shipped to Contoso Thermal Labs. Evaluation expected within 2 weeks.",
                Timestamp = baseTime.AddDays(3),
                OwnerId = "1002"
            },
            Associations = []
        };

        _tasks["8001"] = new StoredEntity<TaskProperties>
        {
            Id = "8001",
            CreatedAt = baseTime.AddDays(1),
            UpdatedAt = baseTime.AddDays(1),
            Properties = new TaskProperties
            {
                Subject = "Send revised cooling proposal",
                Body = "Include updated pricing for 48-port rack config. Attach datasheet.",
                Status = "NOT_STARTED",
                Priority = "HIGH",
                DueDate = baseTime.AddDays(7),
                OwnerId = "1001"
            },
            Associations = []
        };

        _tasks["8002"] = new StoredEntity<TaskProperties>
        {
            Id = "8002",
            CreatedAt = baseTime.AddDays(2),
            UpdatedAt = baseTime.AddDays(4),
            Properties = new TaskProperties
            {
                Subject = "Follow up on prototype evaluation",
                Body = "Check if Contoso received samples and schedule demo call.",
                Status = "IN_PROGRESS",
                Priority = "MEDIUM",
                DueDate = baseTime.AddDays(12),
                OwnerId = "1002"
            },
            Associations = []
        };

        Link("notes", "7001", "deals",    "9001");
        Link("notes", "7001", "contacts", "3001");
        Link("notes", "7002", "deals",    "9002");
        Link("tasks", "8001", "deals",    "9001");
        Link("tasks", "8002", "deals",    "9002");
        Link("tasks", "8002", "contacts", "3002");
    }

    private void AppendAssociations(string fromType, string fromId, IReadOnlyList<AssociationReference> associations)
    {
        foreach (var association in associations ?? [])
        {
            if (string.IsNullOrWhiteSpace(association.ToObjectType) ||
                string.IsNullOrWhiteSpace(association.ToObjectId))
            {
                continue;
            }

            Link(fromType, fromId, association.ToObjectType, association.ToObjectId);
        }
    }

    private void Link(string fromType, string fromId, string toType, string toId)
    {
        var left = FindStore(fromType, fromId);
        var right = FindStore(toType, toId);

        if (left is null || right is null)
        {
            return;
        }

        AddAssociationIfMissing(left.Associations, NormalizeObjectType(toType), toId);
        AddAssociationIfMissing(right.Associations, NormalizeObjectType(fromType), fromId);
    }

    private static void AddAssociationIfMissing(List<AssociationReference> associations, string toType, string toId)
    {
        if (associations.Any(x =>
                x.ToObjectType.Equals(toType, StringComparison.OrdinalIgnoreCase) &&
                x.ToObjectId.Equals(toId, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        associations.Add(new AssociationReference
        {
            ToObjectType = toType,
            ToObjectId = toId
        });
    }

    private IStoredEntity? FindStore(string objectType, string id)
    {
        var normalizedType = NormalizeObjectType(objectType);

        return normalizedType switch
        {
            "deals"     => _deals.TryGetValue(id, out var deal)       ? deal    : null,
            "contacts"  => _contacts.TryGetValue(id, out var contact) ? contact : null,
            "companies" => _companies.TryGetValue(id, out var company) ? company : null,
            "notes"     => _notes.TryGetValue(id, out var note)       ? note    : null,
            "tasks"     => _tasks.TryGetValue(id, out var task)       ? task    : null,
            _ => null
        };
    }

    private static string NormalizeObjectType(string objectType)
    {
        var normalized = objectType.Trim().ToLowerInvariant();

        return normalized switch
        {
            "deal"    => "deals",
            "contact" => "contacts",
            "company" => "companies",
            "note"    => "notes",
            "task"    => "tasks",
            _ => normalized
        };
    }

    private static int NormalizeLimit(int limit) => limit <= 0 ? 10 : Math.Min(limit, 100);

    private static CrmEntityResponse<TProperties> ToResponse<TProperties>(StoredEntity<TProperties> entity) =>
        new()
        {
            Id = entity.Id,
            CreatedAt = entity.CreatedAt,
            UpdatedAt = entity.UpdatedAt,
            Archived = entity.Archived,
            Properties = entity.Properties,
            Associations = entity.Associations
                .Select(x => new AssociationReference
                {
                    ToObjectType = x.ToObjectType,
                    ToObjectId = x.ToObjectId
                })
                .ToList()
        };

    private static DealProperties Merge(DealProperties current, DealProperties patch) =>
        new()
        {
            DealName = patch.DealName ?? current.DealName,
            Amount = patch.Amount ?? current.Amount,
            DealStage = patch.DealStage ?? current.DealStage,
            Pipeline = patch.Pipeline ?? current.Pipeline,
            CloseDate = patch.CloseDate ?? current.CloseDate
        };

    private static ContactProperties Merge(ContactProperties current, ContactProperties patch) =>
        new()
        {
            Email = patch.Email ?? current.Email,
            FirstName = patch.FirstName ?? current.FirstName,
            LastName = patch.LastName ?? current.LastName,
            Phone = patch.Phone ?? current.Phone,
            LifecycleStage = patch.LifecycleStage ?? current.LifecycleStage
        };

    private static CompanyProperties Merge(CompanyProperties current, CompanyProperties patch) =>
        new()
        {
            Name = patch.Name ?? current.Name,
            Domain = patch.Domain ?? current.Domain,
            City = patch.City ?? current.City,
            Industry = patch.Industry ?? current.Industry
        };

    private static NoteProperties Merge(NoteProperties current, NoteProperties patch) =>
        new()
        {
            Body      = patch.Body      ?? current.Body,
            Timestamp = patch.Timestamp ?? current.Timestamp,
            OwnerId   = patch.OwnerId   ?? current.OwnerId
        };

    private static TaskProperties Merge(TaskProperties current, TaskProperties patch) =>
        new()
        {
            Subject  = patch.Subject  ?? current.Subject,
            Body     = patch.Body     ?? current.Body,
            Status   = patch.Status   ?? current.Status,
            Priority = patch.Priority ?? current.Priority,
            DueDate  = patch.DueDate  ?? current.DueDate,
            OwnerId  = patch.OwnerId  ?? current.OwnerId
        };

    private interface IStoredEntity
    {
        List<AssociationReference> Associations { get; }
    }

    private sealed class StoredEntity<TProperties> : IStoredEntity
    {
        public string Id { get; init; } = string.Empty;

        public DateTimeOffset CreatedAt { get; init; }

        public DateTimeOffset UpdatedAt { get; set; }

        public bool Archived { get; init; }

        public TProperties Properties { get; set; } = default!;

        public List<AssociationReference> Associations { get; set; } = [];
    }
}
