const path = require("path");
const PptxGenJS = require("pptxgenjs");

const pptx = new PptxGenJS();

const FONT = "Microsoft JhengHei";
const COLORS = {
  bg: "FBF7F1",
  surface: "FFFAF2",
  white: "FFFFFF",
  ink: "182033",
  muted: "5F6778",
  line: "E7DCCB",
  accent: "FF7A59",
  accentSoft: "FFE4DB",
  accentDeep: "D75A35",
  success: "1D9F55",
  navySoft: "F3F5F9",
  goldSoft: "FFF2D7",
};

const ROOT = __dirname;
const SHOTS = {
  deals: path.join(ROOT, "screenshots", "deals-panel.png"),
  companies: path.join(ROOT, "screenshots", "companies-panel.png"),
  links: path.join(ROOT, "screenshots", "links-panel.png"),
  import: path.join(ROOT, "screenshots", "import-panel.png"),
};
const OUTPUT = path.join(ROOT, "HubSpot-CRM-Integration-Candidate-Deck.pptx");

pptx.layout = "LAYOUT_WIDE";
pptx.author = "OpenAI Codex";
pptx.company = "OpenAI";
pptx.subject = "Bilingual candidate presentation for HubSpot CRM integration demo";
pptx.title = "HubSpot CRM Integration Candidate Deck";
pptx.lang = "zh-TW";

function addSlideBase(slide) {
  slide.background = { color: COLORS.bg };
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 7.5,
    line: { color: COLORS.bg, transparency: 100 },
    fill: { color: COLORS.bg },
  });
}

function addEyebrow(slide, text, x = 0.48, y = 0.32, w = 2.3) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.34,
    rectRadius: 0.08,
    line: { color: COLORS.accentSoft, transparency: 100 },
    fill: { color: COLORS.accentSoft },
  });
  slide.addText(text, {
    x: x + 0.12,
    y: y + 0.06,
    w: w - 0.2,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    bold: true,
    color: COLORS.accentDeep,
    charSpace: 0.6,
  });
}

function addTitle(slide, zh, en, x = 0.48, y = 0.8, w = 6.4) {
  slide.addText(zh, {
    x,
    y,
    w,
    h: 0.48,
    fontFace: FONT,
    fontSize: 22,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
  slide.addText(en, {
    x,
    y: y + 0.42,
    w,
    h: 0.36,
    fontFace: FONT,
    fontSize: 19,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
}

function addPairParagraph(slide, zh, en, x, y, w, zhSize = 10.5, enSize = 9.5) {
  slide.addText(zh, {
    x,
    y,
    w,
    h: 0.42,
    fontFace: FONT,
    fontSize: zhSize,
    color: COLORS.ink,
    bold: true,
    breakLine: false,
    margin: 0,
  });
  slide.addText(en, {
    x,
    y: y + 0.28,
    w,
    h: 0.4,
    fontFace: FONT,
    fontSize: enSize,
    color: COLORS.muted,
    italic: false,
    margin: 0,
  });
}

function addCard(slide, x, y, w, h, fill = COLORS.white) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    line: { color: COLORS.line, pt: 1 },
    fill: { color: fill },
  });
}

function addTag(slide, text, x, y, w) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.28,
    rectRadius: 0.07,
    line: { color: COLORS.navySoft, transparency: 100 },
    fill: { color: COLORS.navySoft },
  });
  slide.addText(text, {
    x: x + 0.08,
    y: y + 0.045,
    w: w - 0.12,
    h: 0.18,
    fontFace: FONT,
    fontSize: 8.3,
    bold: true,
    color: COLORS.ink,
    align: "center",
    margin: 0,
  });
}

function addMetricCard(slide, x, y, w, h, number, zh, en) {
  addCard(slide, x, y, w, h);
  slide.addText(String(number), {
    x: x + 0.18,
    y: y + 0.18,
    w: w - 0.3,
    h: 0.4,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
  addPairParagraph(slide, zh, en, x + 0.18, y + 0.62, w - 0.3, 8.8, 8.3);
}

function addBulletCard(slide, x, y, w, h, label, zh, en, fill = COLORS.white) {
  addCard(slide, x, y, w, h, fill);
  slide.addShape(pptx.ShapeType.ellipse, {
    x: x + 0.16,
    y: y + 0.18,
    w: 0.32,
    h: 0.32,
    line: { color: COLORS.accentSoft, transparency: 100 },
    fill: { color: COLORS.accentSoft },
  });
  slide.addText(label, {
    x: x + 0.16,
    y: y + 0.22,
    w: 0.32,
    h: 0.12,
    fontFace: FONT,
    fontSize: 8.5,
    bold: true,
    align: "center",
    color: COLORS.accentDeep,
    margin: 0,
  });
  addPairParagraph(slide, zh, en, x + 0.58, y + 0.14, w - 0.74, 9.1, 8.5);
}

function addSectionCard(slide, x, y, w, h, titleZh, titleEn) {
  addCard(slide, x, y, w, h);
  slide.addText(titleZh, {
    x: x + 0.2,
    y: y + 0.16,
    w: w - 0.4,
    h: 0.24,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
  slide.addText(titleEn, {
    x: x + 0.2,
    y: y + 0.42,
    w: w - 0.4,
    h: 0.2,
    fontFace: FONT,
    fontSize: 9,
    color: COLORS.muted,
    margin: 0,
  });
}

function addScreenshot(slide, imagePath, x, y, w, h) {
  addCard(slide, x, y, w, h);
  slide.addImage({
    path: imagePath,
    x: x + 0.12,
    y: y + 0.12,
    w: w - 0.24,
    h: h - 0.24,
  });
}

function addValueBanner(slide, x, y, w, zh, en) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h: 0.6,
    rectRadius: 0.12,
    line: { color: COLORS.goldSoft, transparency: 100 },
    fill: { color: COLORS.goldSoft },
  });
  slide.addText(zh, {
    x: x + 0.18,
    y: y + 0.13,
    w: w - 0.35,
    h: 0.18,
    fontFace: FONT,
    fontSize: 10.5,
    bold: true,
    color: COLORS.ink,
    margin: 0,
  });
  slide.addText(en, {
    x: x + 0.18,
    y: y + 0.32,
    w: w - 0.35,
    h: 0.16,
    fontFace: FONT,
    fontSize: 8.7,
    color: COLORS.muted,
    margin: 0,
  });
}

function slide1() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "CANDIDATE PRESENTATION", 0.48, 0.32, 2.15);
  addTitle(slide, "HubSpot CRM 整合展示", "HubSpot CRM Integration Demo", 0.48, 0.82, 6.2);
  addPairParagraph(
    slide,
    "這份簡報不是單純介紹畫面，而是用一個可運作的系統來說明我如何處理 CRM 流程、資料驗證、API 整合與後續擴充。",
    "This deck is not just a screen tour. It shows how I approach CRM workflow design, data validation, API integration, and practical next-step thinking.",
    0.5,
    1.65,
    6.0,
    10.2,
    9.2
  );

  const tags = [
    ["C# Backend", 0.5, 2.45, 1.02],
    ["HubSpot API", 1.58, 2.45, 1.15],
    ["CRM Workflow", 2.82, 2.45, 1.25],
    ["CSV Validation", 4.15, 2.45, 1.33],
    ["SQL-ready Next Step", 5.56, 2.45, 1.62],
  ];
  tags.forEach(([text, x, y, w]) => addTag(slide, text, x, y, w));

  addMetricCard(slide, 0.5, 2.95, 1.9, 1.18, "Live", "真實 HubSpot 測試環境", "Live HubSpot sandbox");
  addMetricCard(slide, 2.55, 2.95, 1.9, 1.18, "4", "核心流程區塊", "Core workflow areas");
  addMetricCard(slide, 4.6, 2.95, 2.0, 1.18, "Role", "對應 CRM / Integration 職缺", "Aligned to CRM / Integration roles");

  addValueBanner(
    slide,
    0.5,
    4.35,
    6.2,
    "重點不是把畫面做滿，而是證明我能把業務流程翻譯成可運作、可說明、可延伸的系統。",
    "The point is not to decorate a UI. The point is to show I can turn a business workflow into a working, explainable, extensible system."
  );

  addScreenshot(slide, SHOTS.deals, 7.05, 0.75, 5.75, 5.95);
  addPairParagraph(
    slide,
    "右側畫面來自真實 HubSpot sandbox，並非靜態 mockup。",
    "The screen on the right is connected to a live HubSpot sandbox, not a static mockup.",
    7.15,
    6.78,
    5.4,
    9,
    8.4
  );
}

function slide2() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "BUSINESS SCENARIO", 0.48, 0.32, 1.95);
  addTitle(slide, "這個系統解決什麼問題", "What Business Problem It Solves", 0.48, 0.82, 5.6);
  addPairParagraph(
    slide,
    "如果公司希望用 CRM 管理客戶、窗口、商機與匯入資料，系統的重點就是資料正確、流程清楚、後續整合容易。",
    "If a company wants CRM to manage accounts, contacts, opportunities, and batch updates, the real priorities are clean data, clear workflow, and easier downstream integration.",
    0.5,
    1.62,
    5.8,
    10.2,
    9.2
  );

  addSectionCard(slide, 0.5, 2.45, 5.9, 3.85, "實際 CRM 作業流程", "Practical CRM operating flow");
  addBulletCard(slide, 0.72, 2.95, 5.45, 0.68, "1", "先建立公司主資料，避免商機沒有所屬組織。", "Create company master data first so the deal belongs to a real organization.");
  addBulletCard(slide, 0.72, 3.75, 5.45, 0.68, "2", "再建立聯絡人，對應實際窗口與溝通對象。", "Then create the contact so communication is tied to a real person.");
  addBulletCard(slide, 0.72, 4.55, 5.45, 0.68, "3", "建立商機並指定 pipeline / stage，讓銷售狀態可追蹤。", "Create the deal with pipeline and stage so the sales process becomes trackable.");
  addBulletCard(slide, 0.72, 5.35, 5.45, 0.68, "4", "用關聯與 CSV 流程把資料串起來，為後續整合做準備。", "Use associations and CSV workflow to connect records and prepare for future integration.");

  addSectionCard(slide, 6.7, 1.95, 6.1, 4.35, "對 HR 與主管的意義", "Why this matters to HR and a hiring manager");
  addBulletCard(slide, 6.92, 2.45, 5.66, 0.78, "A", "這不是單一 CRUD 畫面，而是完整 CRM 物件思維。", "This is not a single CRUD page. It shows complete CRM object thinking.", COLORS.surface);
  addBulletCard(slide, 6.92, 3.4, 5.66, 0.78, "B", "它反映我能理解業務流程，不只是寫 API。", "It reflects that I understand business workflow, not just endpoints.", COLORS.surface);
  addBulletCard(slide, 6.92, 4.35, 5.66, 0.78, "C", "它也保留了下一步做 SQL staging / audit 的空間。", "It also leaves a clean next step for SQL staging and audit capability.", COLORS.surface);

  addValueBanner(
    slide,
    6.92,
    5.48,
    5.66,
    "這份作品的價值在於：它既能展示實作能力，也能展示系統思考。",
    "The value of this work is that it shows both implementation ability and systems thinking."
  );
}

function slide3() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "WHAT I BUILT", 0.48, 0.32, 1.7);
  addTitle(slide, "我實際完成的能力範圍", "What I Actually Built", 0.48, 0.82, 5.7);
  addPairParagraph(
    slide,
    "我把這個作品整理成可以面試展示的版本，重點不是功能堆疊，而是每個功能都對應到 CRM / integration 的核心能力。",
    "I shaped this into an interview-ready working prototype. The focus is not feature count, but whether each feature maps to a real CRM / integration capability.",
    0.5,
    1.62,
    5.9,
    10.1,
    9.2
  );

  addBulletCard(slide, 0.52, 2.55, 5.75, 0.95, "1", "真實物件操作：Company / Contact / Deal。", "Live object handling for companies, contacts, and deals.");
  addBulletCard(slide, 0.52, 3.7, 5.75, 0.95, "2", "受控輸入與驗證：pipeline、stage、industry 來自 HubSpot。", "Controlled validation where pipeline, stage, and industry come from HubSpot metadata.");
  addBulletCard(slide, 0.52, 4.85, 5.75, 0.95, "3", "商機關聯：把 deal 與 company / contact 串起來。", "Association workflow that links deals to companies and contacts.");
  addBulletCard(slide, 0.52, 6.0, 5.75, 0.95, "4", "CSV 匯入匯出：樣板、匯出、預覽、套用。", "CSV import/export with template, export, preview, and apply steps.");

  addScreenshot(slide, SHOTS.deals, 6.75, 1.55, 6.1, 5.55);
}

function slide4() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "KEY SCREENS", 0.48, 0.32, 1.55);
  addTitle(slide, "核心畫面一：主資料與商機", "Key Screens: Master Data and Deals", 0.48, 0.82, 6.2);
  addPairParagraph(
    slide,
    "這兩個畫面最能說明我對 CRM 基礎結構的理解：先有主資料，再有商機，避免資料孤立。",
    "These two screens best show my CRM foundation thinking: master data first, deal second, so records do not become isolated.",
    0.5,
    1.62,
    6.2,
    10.1,
    9.2
  );

  addScreenshot(slide, SHOTS.companies, 0.55, 2.25, 5.95, 3.35);
  addScreenshot(slide, SHOTS.deals, 6.83, 2.25, 5.95, 3.35);

  addBulletCard(slide, 0.55, 5.85, 4.0, 0.88, "A", "公司資料不是裝飾，而是商機、聯絡人與後續同步的基礎。", "Company data is the base for deals, contacts, and later synchronization.");
  addBulletCard(slide, 4.67, 5.85, 4.0, 0.88, "B", "商機畫面同時支援建立、查詢與結果檢視。", "The deal screen combines creation, search, and result inspection in one place.");
  addBulletCard(slide, 8.79, 5.85, 4.0, 0.88, "C", "下拉選單直接讀取 HubSpot 規則，減少無效輸入。", "Dropdowns reflect live HubSpot rules and reduce invalid submissions.");
}

function slide5() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "INTEGRATION FLOW", 0.48, 0.32, 1.85);
  addTitle(slide, "核心畫面二：關聯與匯入流程", "Key Screens: Linking and Import Workflow", 0.48, 0.82, 6.4);
  addPairParagraph(
    slide,
    "如果要讓主管看到我不是只會做表單，這一頁最重要：它證明我理解資料關係與批次資料流程。",
    "If I want a hiring manager to see that I am more than a form builder, this slide matters most. It proves I understand data relationships and batch data workflow.",
    0.5,
    1.62,
    6.2,
    10.1,
    9.2
  );

  addScreenshot(slide, SHOTS.links, 0.55, 2.18, 5.95, 3.4);
  addScreenshot(slide, SHOTS.import, 6.83, 2.18, 5.95, 3.4);

  addBulletCard(slide, 0.55, 5.88, 3.9, 0.88, "1", "Links 畫面說明 deal 不該孤立存在，必須連到真實公司與窗口。", "The links screen shows that a deal should be connected to a real company and real contact.");
  addBulletCard(slide, 4.62, 5.88, 4.05, 0.88, "2", "Import 畫面把 CSV 變成可驗證、可預覽、可說明的流程。", "The import screen turns CSV into a workflow that can be validated, previewed, and explained.");
  addBulletCard(slide, 8.84, 5.88, 3.94, 0.88, "3", "這部分最接近 CRM / ERP integration 職位會在意的能力。", "This is the part closest to what CRM / ERP integration roles usually care about.");
}

function slide6() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "TECHNICAL VIEW", 0.48, 0.32, 1.7);
  addTitle(slide, "技術設計與專業化方向", "Technical Design and Next Professional Step", 0.48, 0.82, 6.6);
  addPairParagraph(
    slide,
    "目前版本是可展示、可運作的 prototype；如果往專業 CRM integration 方向走，下一步就是加入 SQL staging、audit 與 import history。",
    "The current version is a working prototype suitable for interviews. The next professional step is SQL staging, audit logging, and import history.",
    0.5,
    1.62,
    6.4,
    10.1,
    9.2
  );

  addSectionCard(slide, 0.55, 2.28, 5.95, 4.55, "目前架構", "Current structure");
  const archX = 0.92;
  [
    ["瀏覽器 UI", "Browser UI", 2.75],
    ["ASP.NET Core API", "ASP.NET Core demo layer", 3.57],
    ["驗證與 CSV 服務", "Validation and CSV workflow", 4.39],
    ["HubSpot Sandbox", "Live HubSpot sandbox data", 5.21],
  ].forEach(([zh, en, y], idx) => {
    addCard(slide, archX, y, 5.18, 0.56, idx === 2 ? COLORS.surface : COLORS.white);
    addPairParagraph(slide, zh, en, archX + 0.18, y + 0.1, 4.8, 9.4, 8.6);
    if (idx < 3) {
      slide.addText("↓", {
        x: archX + 2.45,
        y: y + 0.56,
        w: 0.3,
        h: 0.18,
        fontFace: FONT,
        fontSize: 16,
        bold: true,
        color: COLORS.accent,
        align: "center",
        margin: 0,
      });
    }
  });

  addSectionCard(slide, 6.82, 2.28, 5.95, 4.55, "下一步專業化", "Next step toward production-like integration");
  addBulletCard(slide, 7.05, 2.78, 5.5, 0.72, "A", "加入 SQLite / SQL staging，先存再驗證再套用。", "Add SQLite / SQL staging so import can be stored, validated, and then applied.");
  addBulletCard(slide, 7.05, 3.68, 5.5, 0.72, "B", "保留 import job、row-level error、audit trail。", "Keep import jobs, row-level errors, and audit trail.");
  addBulletCard(slide, 7.05, 4.58, 5.5, 0.72, "C", "支援 retry、deduplication、history 查詢。", "Support retry, deduplication, and history lookup.");
  addValueBanner(
    slide,
    7.05,
    5.6,
    5.5,
    "這會把作品從 demo 提升到更像真實內部系統或 CRM integration stand。",
    "This is what would move the work from a demo toward a more realistic internal system or CRM integration stand."
  );
}

function slide7() {
  const slide = pptx.addSlide();
  addSlideBase(slide);
  addEyebrow(slide, "ROLE FIT", 0.48, 0.32, 1.3);
  addTitle(slide, "為什麼我適合這類職位", "Why I Fit This Type of Role", 0.48, 0.82, 5.9);
  addPairParagraph(
    slide,
    "如果面試職位是 C#、HubSpot、API、CRM/ERP integration、import/export、SQL-ready 思維，這份作品正好能作為一個具體說明。",
    "If the role asks for C#, HubSpot, API integration, CRM/ERP workflow, import/export, and SQL-ready thinking, this project gives a concrete way to explain that fit.",
    0.5,
    1.62,
    6.2,
    10.2,
    9.2
  );

  addSectionCard(slide, 0.55, 2.38, 6.0, 4.55, "我能帶來的能力", "Capability I bring");
  addBulletCard(slide, 0.8, 2.88, 5.5, 0.64, "1", "用 C# / ASP.NET Core 快速做出可運作原型。", "I can build a working prototype quickly in C# / ASP.NET Core.");
  addBulletCard(slide, 0.8, 3.66, 5.5, 0.64, "2", "理解 CRM 物件模型：company、contact、deal、association。", "I understand the CRM object model: company, contact, deal, association.");
  addBulletCard(slide, 0.8, 4.44, 5.5, 0.64, "3", "知道何時該做前端控制，何時該做後端驗證。", "I know when to use front-end control and when to enforce server-side validation.");
  addBulletCard(slide, 0.8, 5.22, 5.5, 0.64, "4", "能把 CSV / API / validation 串成實際業務流程。", "I can turn CSV, API, and validation into a practical business workflow.");
  addBulletCard(slide, 0.8, 6.0, 5.5, 0.64, "5", "也清楚下一步如何往 SQL / audit / staging 擴展。", "I also understand the next step toward SQL, audit, and staging capability.");

  addSectionCard(slide, 6.82, 2.38, 5.95, 4.55, "主管最可能想知道", "What a manager is most likely to care about");
  addBulletCard(slide, 7.06, 2.88, 5.47, 0.76, "A", "我不是只做畫面，而是把流程與資料關係做清楚。", "I am not only building screens; I am structuring workflow and data relationships.");
  addBulletCard(slide, 7.06, 3.86, 5.47, 0.76, "B", "我能展示 working solution，也能誠實說明目前邊界。", "I can show a working solution and also explain its current boundaries honestly.");
  addBulletCard(slide, 7.06, 4.84, 5.47, 0.76, "C", "這讓作品更像成熟候選人的展示，而不是單純作業。", "That makes the presentation feel closer to a mature candidate deck than a classroom assignment.");
  addValueBanner(
    slide,
    7.06,
    5.96,
    5.47,
    "一句話總結：我可以把 CRM 需求落地成系統，並知道怎麼把它往更專業的方向推進。",
    "One-line summary: I can turn CRM requirements into a working system and know how to push it toward a more professional solution."
  );
}

async function main() {
  slide1();
  slide2();
  slide3();
  slide4();
  slide5();
  slide6();
  slide7();

  await pptx.writeFile({ fileName: OUTPUT });
  console.log(`PPTX created: ${OUTPUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
