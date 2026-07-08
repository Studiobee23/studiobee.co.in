import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderDocumentToPdf } from "@/lib/pdf/render";

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { doc_id } = await req.json();
  if (!doc_id) return NextResponse.json({ error: "doc_id required" }, { status: 400 });

  try {
    const { doc, pdfBuffer } = await renderDocumentToPdf(doc_id);
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

    // Generating the PDF means it's going out to the client — bump a draft quote to
    // "sent" so it doesn't sit in "draft" forever with no status transition ever firing.
    if (doc.type === "quote" && doc.status === "draft") {
      const supabase = await createClient();
      await supabase.from("documents").update({ status: "sent" }).eq("id", doc.id);
    }

    return NextResponse.json({ url: signed.signedUrl, filename });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
