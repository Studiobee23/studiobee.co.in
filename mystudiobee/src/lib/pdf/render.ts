import { renderDocument } from "@/lib/pdf/template";
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
  const html = renderDocument(doc, client, {
    bankName: process.env.BANK_NAME,
    accountNumber: process.env.BANK_ACCOUNT,
    ifsc: process.env.BANK_IFSC,
    studioGstin: process.env.STUDIO_GSTIN,
    studioAddress: process.env.STUDIO_ADDRESS,
    studioPhone: process.env.STUDIO_PHONE,
    studioEmail: process.env.STUDIO_EMAIL,
  });

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
    return { doc, client, pdfBuffer: pdfBuffer as Buffer };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}
