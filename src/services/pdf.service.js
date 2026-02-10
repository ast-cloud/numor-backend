const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");

// In CommonJS, __dirname already exists
function generateInvoicePdf(invoice) {
  return (async () => {
    // src/services -> src/templates
    const templatePath = path.join(__dirname, "../templates/invoice.html");

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Invoice template not found at ${templatePath}`);
    }

    const html = fs.readFileSync(templatePath, "utf-8");
    const template = Handlebars.compile(html);

    const htmlWithData = template({
      ...invoice,
      issueDate: invoice.issueDate.toISOString().split("T")[0],
      dueDate: invoice.dueDate.toISOString().split("T")[0],
    });

    // const browser = await puppeteer.launch({ headless: "new" });
    const browser = await puppeteer.launch({
      headless: "new",
      timeout: 60000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--single-process",
      ],
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
