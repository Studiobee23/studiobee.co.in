import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDocument } from "@/lib/pdf/template";

// Local dev: reuse the same Chrome install the marketing site's screenshot.mjs already
// uses (avoids needing the full `puppeteer` package with its own Chromium download).
const LOCAL_CHROME_PATH =
  "C:/Users/arora/.cache/puppeteer/chrome/win64-145.0.7632.77/chrome-win64/chrome.exe";

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({
    executablePath: LOCAL_CHROME_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { doc_id } = await req.json();
  if (!doc_id) return NextResponse.json({ error: "doc_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .eq("id", doc_id)
    .single();
  if (docError || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

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

    const filename = `${doc.number.replace(/[^A-Z0-9-]/gi, "_")}-${crypto.randomBytes(8).toString("hex")}.pdf`;

    // Storage writes go through the admin client (service role) — same as the existing
    // billing system — since the `documents` bucket's RLS isn't scoped to app-level
    // roles. The route itself is already gated by isBillingRole() above.
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(`pdfs/${filename}`, pdfBuffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: signed, error: signError } = await admin.storage
      .from("documents")
      .createSignedUrl(`pdfs/${filename}`, 604800);
    if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

    return NextResponse.json({ url: signed.signedUrl, filename });
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
