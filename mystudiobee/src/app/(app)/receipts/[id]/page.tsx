import { notFound, redirect } from "next/navigation";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { DocumentView } from "@/components/documents/document-view";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { getDocumentForViewer } from "@/lib/actions/documents";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) redirect("/");

  const { id } = await params;
  const doc = await getDocumentForViewer(id);
  if (!doc || doc.type !== "receipt") notFound();

  return (
    <>
      <DashboardHeader title={doc.number} backHref="/receipts" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-3xl">
          <DocumentView doc={doc} />
        </div>
      </div>
    </>
  );
}
