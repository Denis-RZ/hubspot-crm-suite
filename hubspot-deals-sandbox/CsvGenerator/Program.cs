using System.Text;

namespace CsvGenerator;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new GeneratorForm());
    }
}

internal sealed class GeneratorForm : Form
{
    private readonly ComboBox _type;
    private readonly NumericUpDown _count;
    private readonly TextBox _preview;
    private readonly ToolStripStatusLabel _status;
    private readonly Button _btnSave;
    private string _csv = string.Empty;

    private static readonly Random Rng = new();

    private static readonly string[] DealWords =
    [
        "Cloud migration", "ERP upgrade", "Security audit", "Mobile app", "Data warehouse",
        "API integration", "CRM rollout", "SaaS licence", "Infra expansion", "AI pilot"
    ];

    private static readonly string[] FirstNames =
        ["Alice", "Bob", "Carol", "David", "Emily", "Frank", "Grace", "Henry", "Iris", "Jack"];

    private static readonly string[] LastNames =
        ["Chen", "Wang", "Lin", "Zhang", "Liu", "Wu", "Lee", "Kim", "Park", "Tanaka"];

    private static readonly string[] CompanyNames =
        ["Northwind", "Contoso", "Fabrikam", "TailSpin", "Woodgrove", "Wingtip", "BlueSky", "AdventureWorks"];

    private static readonly string[] CompanySuffixes =
        ["Systems", "Technologies", "Solutions", "Group", "Corp"];

    private static readonly string[] Cities =
        ["Taipei", "Taoyuan", "Taichung", "Kaohsiung", "Hsinchu", "Tokyo", "Singapore", "Hong Kong"];

    private static readonly string[] Industries =
        ["COMPUTER_SOFTWARE", "INFORMATION_TECHNOLOGY_SERVICES", "INTERNET", "SEMICONDUCTORS",
         "TELECOMMUNICATIONS", "MANAGEMENT_CONSULTING", "FINANCIAL_SERVICES", "RETAIL"];

    private static readonly string[] ContactStages =
        ["lead", "customer", "opportunity", "marketingqualifiedlead"];

    public GeneratorForm()
    {
        Text = "CSV Import Generator";
        Size = new Size(720, 500);
        MinimumSize = new Size(560, 360);
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9f);

        var bar = new Panel
        {
            Dock = DockStyle.Top,
            Height = 40,
            Padding = new Padding(8, 6, 8, 0)
        };

        _type = new ComboBox
        {
            DropDownStyle = ComboBoxStyle.DropDownList,
            Width = 130,
            Location = new Point(60, 6)
        };
        _type.Items.AddRange(["Deals", "Contacts", "Companies"]);
        _type.SelectedIndex = 0;
        _type.SelectedIndexChanged += (_, _) => Generate();

        _count = new NumericUpDown
        {
            Minimum = 1,
            Maximum = 200,
            Value = 5,
            Width = 58,
            Location = new Point(220, 6)
        };

        var btnGenerate = CreateButton("Generate", 290, Generate);
        _btnSave = CreateButton("Save CSV...", 375, Save);
        _btnSave.Enabled = false;
        var btnCopy = CreateButton("Copy", 460, CopyToClipboard);

        bar.Controls.AddRange(
        [
            CreateLabel("Object:", 8),
            _type,
            CreateLabel("Rows:", 196),
            _count,
            btnGenerate,
            _btnSave,
            btnCopy
        ]);

        _preview = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Both,
            ReadOnly = true,
            Font = new Font("Consolas", 9f),
            BackColor = Color.FromArgb(252, 252, 252),
            WordWrap = false
        };

        var statusStrip = new StatusStrip();
        _status = new ToolStripStatusLabel
        {
            Spring = true,
            TextAlign = ContentAlignment.MiddleLeft
        };
        statusStrip.Items.Add(_status);

        Controls.Add(_preview);
        Controls.Add(bar);
        Controls.Add(statusStrip);

        Generate();
    }

    private static Label CreateLabel(string text, int x) =>
        new()
        {
            Text = text,
            AutoSize = true,
            Location = new Point(x, 10)
        };

    private Button CreateButton(string text, int x, Action onClick)
    {
        var button = new Button
        {
            Text = text,
            Width = 78,
            Height = 26,
            Location = new Point(x, 5)
        };

        button.Click += (_, _) => onClick();
        return button;
    }

    private void Generate()
    {
        var type = _type.SelectedItem?.ToString()?.ToLowerInvariant() ?? "deals";
        var rowCount = (int)_count.Value;

        _csv = type switch
        {
            "contacts" => BuildContactsCsv(rowCount),
            "companies" => BuildCompaniesCsv(rowCount),
            _ => BuildDealsCsv(rowCount)
        };

        _preview.Text = _csv.ReplaceLineEndings(Environment.NewLine);
        _btnSave.Enabled = true;

        var header = _csv.Split('\n', 2)[0];
        _status.Text = $"{rowCount} data row(s) | columns: {header}";
    }

    private void Save()
    {
        var type = _type.SelectedItem?.ToString()?.ToLowerInvariant() ?? "deals";
        var defaultDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        var defaultPath = Path.Combine(
            defaultDirectory,
            $"{type}-import-{DateTime.Now:yyyyMMdd-HHmm}.csv");

        using var dialog = new SaveCsvPathDialog(defaultPath);
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var targetPath = dialog.FilePath.Trim();
        if (!targetPath.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
        {
            targetPath += ".csv";
        }

        var targetDirectory = Path.GetDirectoryName(targetPath);
        if (string.IsNullOrWhiteSpace(targetDirectory))
        {
            throw new InvalidOperationException("Choose a valid output folder.");
        }

        Directory.CreateDirectory(targetDirectory);
        File.WriteAllText(
            targetPath,
            _csv,
            new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));

        _status.Text = $"Saved -> {targetPath}";
    }

    private void CopyToClipboard()
    {
        if (string.IsNullOrWhiteSpace(_csv))
        {
            return;
        }

        Clipboard.SetText(_csv);
        _status.Text = "Copied to clipboard.";
    }

    private static string BuildDealsCsv(int rowCount)
    {
        var builder = new StringBuilder("record_id,dealname,amount,dealstage,pipeline,closedate\n");

        for (var i = 1; i <= rowCount; i++)
        {
            var name = $"{DealWords[Rng.Next(DealWords.Length)]} {i}";
            var amount = Rng.Next(5, 500) * 100;
            var closeDate = DateTime.Today.AddDays(Rng.Next(30, 365)).ToString("yyyy-MM-dd");

            builder.AppendLine(BuildCsvRow("", name, amount.ToString(), "", "", closeDate));
        }

        return builder.ToString().TrimEnd();
    }

    private static string BuildContactsCsv(int rowCount)
    {
        var builder = new StringBuilder("record_id,firstname,lastname,email,phone,lifecyclestage\n");

        for (var i = 1; i <= rowCount; i++)
        {
            var firstName = FirstNames[Rng.Next(FirstNames.Length)];
            var lastName = LastNames[Rng.Next(LastNames.Length)];
            var email = $"{firstName.ToLowerInvariant()}.{lastName.ToLowerInvariant()}{i}@example.com";
            var phone = $"+886-9{Rng.Next(10, 100):00}-{Rng.Next(100, 1000):000}-{Rng.Next(100, 1000):000}";
            var stage = ContactStages[Rng.Next(ContactStages.Length)];

            builder.AppendLine(BuildCsvRow("", firstName, lastName, email, phone, stage));
        }

        return builder.ToString().TrimEnd();
    }

    private static string BuildCompaniesCsv(int rowCount)
    {
        var builder = new StringBuilder("record_id,name,domain,city,industry\n");

        for (var i = 1; i <= rowCount; i++)
        {
            var companyName = $"{CompanyNames[Rng.Next(CompanyNames.Length)]} {CompanySuffixes[Rng.Next(CompanySuffixes.Length)]}";
            var domain = $"{CompanyNames[Rng.Next(CompanyNames.Length)].ToLowerInvariant()}{i}.example";
            var city = Cities[Rng.Next(Cities.Length)];
            var industry = Industries[Rng.Next(Industries.Length)];

            builder.AppendLine(BuildCsvRow("", companyName, domain, city, industry));
        }

        return builder.ToString().TrimEnd();
    }

    private static string BuildCsvRow(params string[] values) =>
        string.Join(",", values.Select(value =>
            value.Contains(',') || value.Contains('"')
                ? $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\""
                : value));
}

internal sealed class SaveCsvPathDialog : Form
{
    private readonly TextBox _pathBox;

    public SaveCsvPathDialog(string defaultPath)
    {
        Text = "Save CSV";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        ClientSize = new Size(560, 150);
        Font = new Font("Segoe UI", 9f);

        var pathLabel = new Label
        {
            Text = "Output file path",
            AutoSize = true,
            Location = new Point(16, 18)
        };

        _pathBox = new TextBox
        {
            Location = new Point(16, 42),
            Width = 520,
            Text = defaultPath
        };

        var helperLabel = new Label
        {
            Text = "Edit the path if needed. The folder will be created automatically.",
            AutoSize = true,
            ForeColor = Color.DimGray,
            Location = new Point(16, 74)
        };

        var saveButton = new Button
        {
            Text = "Save",
            DialogResult = DialogResult.OK,
            Location = new Point(380, 104),
            Width = 75
        };

        var cancelButton = new Button
        {
            Text = "Cancel",
            DialogResult = DialogResult.Cancel,
            Location = new Point(461, 104),
            Width = 75
        };

        AcceptButton = saveButton;
        CancelButton = cancelButton;

        Controls.Add(pathLabel);
        Controls.Add(_pathBox);
        Controls.Add(helperLabel);
        Controls.Add(saveButton);
        Controls.Add(cancelButton);
    }

    public string FilePath => _pathBox.Text;
}
