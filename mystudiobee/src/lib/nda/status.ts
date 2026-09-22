export type NdaAgreementStatus = "pending" | "signed" | "voided" | "expired";

/** "expired" is never stored — it's this row's `status` plus whether `expires_at`
 * has passed, computed wherever it's shown or enforced. No cron job keeps a
 * stored value in sync; a signed or voided row is never "expired". */
export function deriveNdaStatus(
  row: { status: "pending" | "signed" | "voided"; expires_at: string },
  now: Date = new Date()
): NdaAgreementStatus {
  if (row.status === "pending" && new Date(row.expires_at).getTime() < now.getTime()) {
    return "expired";
  }
  return row.status;
}
