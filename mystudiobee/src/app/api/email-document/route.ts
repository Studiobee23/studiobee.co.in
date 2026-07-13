import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { renderDocumentToPdf } from "@/lib/pdf/render";
import { getSmtpTransport, getSmtpFrom } from "@/lib/email";

const TYPE_LABEL: Record<string, string> = { quote: "Quote", proforma: "Proforma Invoice", invoice: "Invoice", receipt: "Receipt" };

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { doc_id, to, subject, message } = await req.json();
  if (!doc_id) return NextResponse.json({ error: "doc_id required" }, { status: 400 });
  if (!to) return NextResponse.json({ error: "Recipient email required" }, { status: 400 });

  const transport = getSmtpTransport();
  if (!transport) {
    return NextResponse.json(
      { error: "Email isn't configured yet — add SMTP_HOST/SMTP_USER/SMTP_PASS to the environment." },
      { status: 503 }
    );
  }

  try {
    const { doc, pdfBuffer } = await renderDocumentToPdf(doc_id);
    const label = TYPE_LABEL[doc.type] ?? "Document";
    const filename = `${doc.number.replace(/[^A-Z0-9-]/gi, "_")}.pdf`;

    await transport.sendMail({
      from: getSmtpFrom(),
      to,
      subject: subject || `${label} ${doc.number} from StudioBee`,
      text: message || `Hi,\n\nPlease find attached ${label.toLowerCase()} ${doc.number}.\n\nThanks,\nStudioBee`,
      attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
    });

    // Sending it to the client is the "sent" transition, same as generating the PDF.
    if (doc.type === "quote" && doc.status === "draft") {
      const supabase = await createClient();
      await supabase.from("documents").update({ status: "sent" }).eq("id", doc.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
