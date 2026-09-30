const fs = require("fs");
const { clientForDisplay } = require("../utils/clientSnapshot");
const path = require("path");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");
const { amountInWords, formatMoney } = require("../utils/amountInWords");

const { ENVIRONMENT } = require("../config/env");

// --single-process / --no-zygote are concessions to constrained container
// runtimes, and both are Linux notions: there is no zygote on Windows or macOS,
// and --single-process is unsupported there - Chrome exits the instant it
// starts, surfacing as "TargetCloseError: Protocol error
// (Target.setDiscoverTargets): Target closed" from launch(), which names
// nothing resembling the real cause.
//
// Gated on platform as well as environment so a non-Linux host cannot hit this
// even with ENVIRONMENT=production, and on environment as well as platform so a
// teammate developing on Linux gets the more robust multi-process Chrome.
const USE_CONSTRAINED_CHROME_ARGS =
  process.platform === "linux" && ENVIRONMENT !== "local";

const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  ...(USE_CONSTRAINED_CHROME_ARGS ? ["--no-zygote", "--single-process"] : []),
];

const getTaxSystem = (country)=> {
  if (!country) return "";
  if (country === "India") return "GST";
  if (country === "United States" || country === "US") return "SALES";
  return "VAT";
};

const getTaxLabel = (country) => {
  const sys = getTaxSystem(country);
  if (sys === "GST") return "GSTIN";
  if (sys === "VAT") return "VATIN";
  if (sys === "SALES") return "Sales Tax ID";
  return "Tax ID (GST/VAT/Sales Tax)";
};

// In CommonJS, __dirname already exists
// taxSummary is free-form JSON: { CGST: { rate, amount }, ... }. Only the
// amounts need formatting; the rates are percentages.
function formatTaxSummary(taxSummary, money) {
  if (!taxSummary || typeof taxSummary !== "object") return taxSummary;

  return Object.fromEntries(
    Object.entries(taxSummary).map(([label, entry]) => [
      label,
      { ...entry, amount: money(entry?.amount) },
    ])
  );
}

function generateInvoicePdf(invoice) {
  // console.log("Generating PDF for invoice:", invoice);
  return (async () => {
    // src/services -> src/templates
    const templatePath = path.join(__dirname, "../templates/invoice.html");

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Invoice template not found at ${templatePath}`);
    }

    const html = fs.readFileSync(templatePath, "utf-8");
    const template = Handlebars.compile(html);
    // Read through the snapshot: invoice.client is null once that client is
    // deleted, and reaching into it directly threw before the PDF ever rendered.
    const client = clientForDisplay(invoice);
    const clientTaxLabel = getTaxLabel(client.country);
    const organizationLogoUrl = invoice.organizationLogoUrl || "";
    // console.log("Using organization logo URL:", organizationLogoUrl);
    const money = (value) => formatMoney(value, invoice.currency);

    const htmlWithData = template({
      ...invoice,
      client,
      clientTaxLabel,
      organizationLogoUrl,
      issueDate: invoice.issueDate.toISOString().split("T")[0],
      dueDate: invoice.dueDate.toISOString().split("T")[0],
      amountInWords: amountInWords(invoice.totalAmount, invoice.currency),

      // Money must be formatted here, not left to the template. Handlebars calls
      // toString() on a Prisma Decimal, which drops the decimals and any grouping
      // entirely - a 735.00 total printed as "735" while the preview showed
      // "735.00". Formatting both from the same helper keeps them identical.
      subtotal: money(invoice.subtotal),
      taxAmount: money(invoice.taxAmount),
      totalAmount: money(invoice.totalAmount),
      taxSummary: formatTaxSummary(invoice.taxSummary, money),
      items: invoice.items?.map((item, index) => ({
        ...item,
        serialNo: index + 1,
        unitPrice: money(item.unitPrice),
        totalPrice: money(item.totalPrice),
      })),
    });

    const browser = await puppeteer.launch({
      headless: "new",
      timeout: 60000,
      args: CHROME_ARGS,
    });


    const page = await browser.newPage();

    await page.setContent(htmlWithData, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: '10mm',
        bottom: '20mm',
        // left: '15mm',
        // right: '15mm'
      }
    });
    await browser.close();

    return pdfBuffer;
  })();
}

module.exports = {
  generateInvoicePdf,
};
