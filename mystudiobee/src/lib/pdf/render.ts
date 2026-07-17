import { PDFDocument } from "pdf-lib";
import { renderDocument, renderCoverDocument, renderFooterTemplate, FOOTER_HEIGHT_PX } from "@/lib/pdf/template";
import { createClient } from "@/lib/supabase/server";

// Local dev: reuse the same Chrome install the marketing site's screenshot.mjs already
// uses (avoids needing the full `puppeteer` package with its own Chromium download).
const LOCAL_CHROME_PATH =
  "C:/Users/arora/.cache/puppeteer/chrome/win64-145.0.7632.77/chrome-win64/chrome.exe";

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }
  return puppeteer.launch({
    executablePath: LOCAL_CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/** Concatenates whole PDFs page-by-page into one file, in order. Used to stitch the
 * footer-less cover page onto the front of the footered content pages — Puppeteer's
 * displayHeaderFooter/margin options apply to an entire page.pdf() call, so a page
 * without a footer has to come from a separate render pass, not a CSS trick. */
async function mergePdfs(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  return Buffer.from(await merged.save());
}

/** Fetches a document + its client and renders it to a PDF buffer. Shared by
 * the "Generate PDF" route and the "Email to client" route so there's one
 * puppeteer/render code path, not two. */
export async function renderDocumentToPdf(docId: string) {
  const supabase = await createClient();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", docId)
    .single();
  if (docError || !doc) throw new Error("Document not found");

  let client = null;
  if (doc.client_id) {
    const { data } = await supabase.from("clients").select("*").eq("id", doc.client_id).single();
    client = data;
  }

  // The PDF template never reads cost_breakdown — only description/qty/rate/amount —
  // so it's safe to render regardless of who (owner/admin/manager) requested it.
  const settings = {
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT,
    ifsc: process.env.BANK_IFSC,
    studioGstin: process.env.STUDIO_GSTIN,
    studioAddress: process.env.STUDIO_ADDRESS,
    studioPhone: process.env.STUDIO_PHONE,
    studioEmail: process.env.STUDIO_EMAIL,
  };
  const coverHtml = renderCoverDocument(doc, client);
  const contentHtml = renderDocument(doc, client, settings, { includeCover: false });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Cover gets its own footer-less pass — no margin.bottom reserved, no footer
    // template — since Puppeteer's header/footer + margin options apply to every
    // page of a single page.pdf() call, not per-page.
    await page.setContent(coverHtml, { waitUntil: "load" });
    const coverBuffer = (await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    })) as Buffer;

    await page.setContent(contentHtml, { waitUntil: "load" });
    const contentBuffer = (await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: renderFooterTemplate(doc),
      margin: { top: "0px", right: "0px", bottom: `${FOOTER_HEIGHT_PX}px`, left: "0px" },
    })) as Buffer;

    await browser.close();
    const pdfBuffer = await mergePdfs([coverBuffer, contentBuffer]);
    return { doc, client, pdfBuffer };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}
