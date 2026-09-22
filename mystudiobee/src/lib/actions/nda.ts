"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { getSmtpTransport, getSmtpFrom } from "@/lib/email";
import { renderNdaAgreementToPdf } from "@/lib/pdf/render";

// This Next.js version's own guidance (node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md):
// "For [expected] errors, avoid using try/catch blocks and throw errors. Instead,
// model expected errors as return values." Throwing from a Server Action here
// surfaces to the client as a generic, message-redacted crash screen — not a
// caught rejection — regardless of a try/catch around the call site. So every
// action below returns { ok: true, ... } | { ok: false; error } instead.
type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function currentBillingProfile() {
  const profile = await getCurrentProfile();
  return profile && isBillingRole(profile.role) ? profile : null;
}

/** Creates a new pending NDA for a client. Each call makes a fresh row — clients
 * keep a full history of every NDA ever sent to them, nothing is overwritten. */
export async function createNdaAgreement(clientId: string, purpose?: string): Promise<Result<{ id: string; url: string }>> {
  const profile = await currentBillingProfile();
  if (!profile) return { ok: false, error: "Not authorized." };
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

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/clients/${clientId}`);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { ok: true, id: data.id as string, url: `${baseUrl}/nda/${data.token}` };
}

/** Emails the signing link to the client's stored address. Requires the client
 * to already have an email on file — this doesn't accept an ad-hoc recipient
 * the way /api/email-document does, since there's no document to attach yet. */
export async function sendNdaAgreementEmail(agreementId: string): Promise<Result> {
  const profile = await currentBillingProfile();
  if (!profile) return { ok: false, error: "Not authorized." };
  const supabase = await createClient();

  const { data: agreement, error: fetchError } = await supabase
    .from("nda_agreements")
    .select("id, token, client_id")
    .eq("id", agreementId)
    .single();
  if (fetchError || !agreement) return { ok: false, error: "NDA agreement not found." };

  const { data: client } = await supabase
    .from("clients")
    .select("name, email")
    .eq("id", agreement.client_id)
    .single();
  if (!client?.email) return { ok: false, error: "This client has no email address on file." };

  const transport = getSmtpTransport();
  if (!transport) {
    return { ok: false, error: "Email isn't configured yet — add SMTP_HOST/SMTP_USER/SMTP_PASS to the environment." };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/nda/${agreement.token}`;

  try {
    await transport.sendMail({
      from: getSmtpFrom(),
      to: client.email,
      subject: "Non-Disclosure Agreement from Studiobee",
      text: `Hi,\n\nPlease review and sign the attached Non-Disclosure Agreement at your convenience:\n\n${link}\n\nThanks,\nStudiobee`,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }

  const { error: updateError } = await supabase
    .from("nda_agreements")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", agreementId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/clients/${agreement.client_id}`);
  return { ok: true };
}

/** Kills a pending link early. Signed agreements can't be voided — that would
 * erase a real signature, which is the legally meaningful record. */
export async function voidNdaAgreement(agreementId: string): Promise<Result> {
  const profile = await currentBillingProfile();
  if (!profile) return { ok: false, error: "Not authorized." };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nda_agreements")
    .update({ status: "voided" })
    .eq("id", agreementId)
    .eq("status", "pending")
    .select("id, client_id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Only a pending NDA can be voided." };

  revalidatePath(`/clients/${data[0].client_id}`);
  return { ok: true };
}

/** Mints a fresh 7-day signed URL for a signed agreement's archived PDF — the
 * same createSignedUrl pattern /api/generate-pdf uses for quote/invoice PDFs.
 * Never stores the URL itself, only the storage path, since signed URLs expire. */
export async function getNdaPdfDownloadUrl(agreementId: string): Promise<Result<{ url: string }>> {
  const profile = await currentBillingProfile();
  if (!profile) return { ok: false, error: "Not authorized." };
  const admin = createAdminClient();

  const { data: agreement, error } = await admin
    .from("nda_agreements")
    .select("pdf_storage_path")
    .eq("id", agreementId)
    .single();
  if (error || !agreement?.pdf_storage_path) return { ok: false, error: "No PDF available for this agreement yet." };

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUrl(agreement.pdf_storage_path, 604800);
  if (signError) return { ok: false, error: signError.message };

  return { ok: true, url: signed.signedUrl };
}

/** Retries PDF generation for a signed agreement whose PDF failed to render the
 * first time (see error-handling note in the spec: a Puppeteer failure never
 * rolls back the signature itself, it just leaves pdf_storage_path null). */
export async function regenerateNdaPdf(agreementId: string): Promise<Result> {
  const profile = await currentBillingProfile();
  if (!profile) return { ok: false, error: "Not authorized." };
  const supabase = await createClient();

  const { data: agreement } = await supabase
    .from("nda_agreements")
    .select("status, client_id")
    .eq("id", agreementId)
    .single();
  if (!agreement || agreement.status !== "signed") {
    return { ok: false, error: "Only a signed agreement has a PDF to regenerate." };
  }

  try {
    await renderNdaAgreementToPdf(agreementId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to regenerate PDF." };
  }
  revalidatePath(`/clients/${agreement.client_id}`);
  return { ok: true };
}
