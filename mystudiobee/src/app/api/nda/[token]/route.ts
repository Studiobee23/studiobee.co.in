import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderNdaAgreementToPdf } from "@/lib/pdf/render";

type SignBody = {
  signatoryName: string;
  signatoryTitle: string;
  signatoryEmail?: string;
  clientCompany: string;
  clientAddress?: string;
  purpose?: string;
  signatureType: "typed" | "drawn";
  signatureText?: string;
  signatureDataUrl?: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: agreement, error: fetchError } = await admin
    .from("nda_agreements")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!agreement) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  if (agreement.status === "signed") {
    // Idempotent: a double-click or resubmit lands here — hand back the
    // existing signed record instead of erroring, so it never looks like a
    // failure to the client who already successfully signed.
    return NextResponse.json({ ok: true, alreadySigned: true });
  }

  if (agreement.status === "voided") {
    return NextResponse.json({ error: "This link has been voided. Contact Studiobee for a new one." }, { status: 409 });
  }

  if (new Date(agreement.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired. Contact Studiobee for a new one." }, { status: 409 });
  }

  let body: SignBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const signatoryName = body.signatoryName?.trim();
  const signatoryTitle = body.signatoryTitle?.trim();
  const clientCompany = body.clientCompany?.trim();

  if (!signatoryName || !signatoryTitle || !clientCompany) {
    return NextResponse.json({ error: "Company name, your name, and title are required." }, { status: 400 });
  }
  if (body.signatureType === "typed" && !body.signatureText?.trim()) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }
  if (body.signatureType === "drawn" && !body.signatureDataUrl) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  let signatureStoragePath: string | null = null;
  if (body.signatureType === "drawn" && body.signatureDataUrl) {
    const base64 = body.signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    signatureStoragePath = `nda-signatures/${token}.png`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(signatureStoragePath, buffer, { contentType: "image/png", upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: "Failed to save your signature. Please try again." }, { status: 500 });
    }
  }

  const { error: updateError } = await admin
    .from("nda_agreements")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
      signatory_email: body.signatoryEmail?.trim() || null,
      client_company_snapshot: clientCompany,
      client_address_snapshot: body.clientAddress?.trim() || null,
      purpose_snapshot: body.purpose?.trim() || agreement.purpose_snapshot,
      signature_type: body.signatureType,
      signature_text: body.signatureType === "typed" ? body.signatureText!.trim() : null,
      signature_storage_path: signatureStoragePath,
    })
    .eq("id", agreement.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save your signature. Please try again." }, { status: 500 });
  }

  // The signature write above is the legally meaningful event and has already
  // succeeded — a PDF failure here must never look like the signing failed.
  let pdfAvailable = true;
  try {
    await renderNdaAgreementToPdf(agreement.id);
  } catch {
    pdfAvailable = false;
  }

  let pdfUrl: string | null = null;
  if (pdfAvailable) {
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(`pdfs/nda-${token}.pdf`, 604800);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ ok: true, pdfUrl });
}
