"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { getSmtpTransport, getSmtpFrom } from "@/lib/email";
import { renderNdaAgreementToPdf } from "@/lib/pdf/render";

async function requireBillingRole() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) throw new Error("Not authorized.");
  return profile;
}

/** Creates a new pending NDA for a client. Each call makes a fresh row — clients
 * keep a full history of every NDA ever sent to them, nothing is overwritten. */
export async function createNdaAgreement(clientId: string, purpose?: string) {
  const profile = await requireBillingRole();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nda_agreements")
    .insert({
      client_id: clientId,
      purpose_snapshot: purpose?.trim() || null,
      created_by: profile.id,
    })
    .select("id, token")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { id: data.id as string, url: `${baseUrl}/nda/${data.token}` };
}

/** Emails the signing link to the client's stored address. Requires the client
 * to already have an email on file — this doesn't accept an ad-hoc recipient
 * the way /api/email-document does, since there's no document to attach yet. */
export async function sendNdaAgreementEmail(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data: agreement, error: fetchError } = await supabase
    .from("nda_agreements")
    .select("id, token, client_id")
    .eq("id", agreementId)
    .single();
  if (fetchError || !agreement) throw new Error("NDA agreement not found");

  const { data: client } = await supabase
    .from("clients")
    .select("name, email")
    .eq("id", agreement.client_id)
    .single();
  if (!client?.email) throw new Error("This client has no email address on file.");

  const transport = getSmtpTransport();
  if (!transport) {
    throw new Error("Email isn't configured yet — add SMTP_HOST/SMTP_USER/SMTP_PASS to the environment.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/nda/${agreement.token}`;

  await transport.sendMail({
    from: getSmtpFrom(),
    to: client.email,
    subject: "Non-Disclosure Agreement from Studiobee",
    text: `Hi,\n\nPlease review and sign the attached Non-Disclosure Agreement at your convenience:\n\n${link}\n\nThanks,\nStudiobee`,
  });

  const { error: updateError } = await supabase
    .from("nda_agreements")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", agreementId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/clients/${agreement.client_id}`);
}

/** Kills a pending link early. Signed agreements can't be voided — that would
 * erase a real signature, which is the legally meaningful record. */
export async function voidNdaAgreement(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nda_agreements")
    .update({ status: "voided" })
    .eq("id", agreementId)
    .eq("status", "pending")
    .select("id, client_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Only a pending NDA can be voided.");

  revalidatePath(`/clients/${data[0].client_id}`);
}

/** Mints a fresh 7-day signed URL for a signed agreement's archived PDF — the
 * same createSignedUrl pattern /api/generate-pdf uses for quote/invoice PDFs.
 * Never stores the URL itself, only the storage path, since signed URLs expire. */
export async function getNdaPdfDownloadUrl(agreementId: string): Promise<string> {
  await requireBillingRole();
  const admin = createAdminClient();

  const { data: agreement, error } = await admin
    .from("nda_agreements")
    .select("pdf_storage_path")
    .eq("id", agreementId)
    .single();
  if (error || !agreement?.pdf_storage_path) throw new Error("No PDF available for this agreement yet.");

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUrl(agreement.pdf_storage_path, 604800);
  if (signError) throw new Error(signError.message);

  return signed.signedUrl;
}

/** Retries PDF generation for a signed agreement whose PDF failed to render the
 * first time (see error-handling note in the spec: a Puppeteer failure never
 * rolls back the signature itself, it just leaves pdf_storage_path null). */
export async function regenerateNdaPdf(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data: agreement } = await supabase
    .from("nda_agreements")
    .select("status, client_id")
    .eq("id", agreementId)
    .single();
  if (!agreement || agreement.status !== "signed") {
    throw new Error("Only a signed agreement has a PDF to regenerate.");
  }

  await renderNdaAgreementToPdf(agreementId);
  revalidatePath(`/clients/${agreement.client_id}`);
}
