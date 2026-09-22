import { createAdminClient } from "@/lib/supabase/admin";
import { deriveNdaStatus } from "@/lib/nda/status";
import { NdaSignClient } from "./nda-sign-client";

export default async function NdaSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: agreement } = await admin
    .from("nda_agreements")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!agreement) {
    return (
      <NdaShell>
        <p>This link isn&rsquo;t valid. Double-check the URL, or contact Studiobee for a fresh one.</p>
      </NdaShell>
    );
  }

  const { data: client } = await admin.from("clients").select("name").eq("id", agreement.client_id).single();

  const status = deriveNdaStatus(agreement);

  if (status === "expired") {
    return (
      <NdaShell>
        <p>This link has expired. Contact Studiobee for a new one.</p>
      </NdaShell>
    );
  }

  if (status === "voided") {
    return (
      <NdaShell>
        <p>This link is no longer active. Contact Studiobee for a new one.</p>
      </NdaShell>
    );
  }

  let signedPdfUrl: string | null = null;
  if (status === "signed" && agreement.pdf_storage_path) {
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(agreement.pdf_storage_path, 604800);
    signedPdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <NdaSignClient
      token={token}
      clientName={client?.name ?? ""}
      purposeDefault={agreement.purpose_snapshot ?? ""}
      signedSummary={
        status === "signed"
          ? {
              name: agreement.signatory_name ?? "",
              company: agreement.client_company_snapshot ?? client?.name ?? "",
              dateStr: agreement.signed_at
                ? new Date(agreement.signed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                : "",
              pdfUrl: signedPdfUrl,
            }
          : null
      }
    />
  );
}

function NdaShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", fontFamily: "DM Sans, sans-serif", textAlign: "center", color: "#333" }}>
      {children}
    </div>
  );
}
