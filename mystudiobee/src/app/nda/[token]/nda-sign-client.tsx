"use client";

import { useEffect, useRef, useState } from "react";
import { CLAUSES } from "@/lib/pdf/nda-template";

type SignedSummary = {
  name: string;
  company: string;
  dateStr: string;
  pdfUrl: string | null;
};

export function NdaSignClient({
  token,
  clientName,
  purposeDefault,
  signedSummary,
}: {
  token: string;
  clientName: string;
  purposeDefault: string;
  signedSummary: SignedSummary | null;
}) {
  const [signed, setSigned] = useState<SignedSummary | null>(signedSummary);
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [company, setCompany] = useState(clientName);
  const [address, setAddress] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState(purposeDefault);
  const [signatureText, setSignatureText] = useState("");
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    // The canvas only exists in the DOM while mode === "draw" (it's swapped
    // out for the typed-signature input otherwise), so this must re-run when
    // mode changes — an empty dep array would attach to a still-null ref on
    // first mount (mode starts as "type") and never re-attach after the
    // canvas actually mounts.
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function pos(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas!.width / r.width), (e.clientY - r.top) * (canvas!.height / r.height)];
    }
    function down(e: PointerEvent) {
      drawingRef.current = true;
      hasDrawnRef.current = true;
      const [x, y] = pos(e);
      ctx!.beginPath();
      ctx!.moveTo(x, y);
    }
    function move(e: PointerEvent) {
      if (!drawingRef.current) return;
      const [x, y] = pos(e);
      ctx!.lineWidth = 2.4;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.strokeStyle = "#0A0A0A";
      ctx!.lineTo(x, y);
      ctx!.stroke();
    }
    function up() {
      drawingRef.current = false;
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [mode]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!company.trim()) errs.push("Company name is required.");
    if (!signatoryName.trim()) errs.push("Your full name is required.");
    if (!signatoryTitle.trim()) errs.push("Your title is required.");
    if (!agree) errs.push("Please confirm you agree to the terms.");
    const signatureDataUrl = mode === "draw" && hasDrawnRef.current ? canvasRef.current?.toDataURL("image/png") : undefined;
    if (mode === "type" && !signatureText.trim()) errs.push("Please type your signature.");
    if (mode === "draw" && !signatureDataUrl) errs.push("Please draw your signature.");

    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/nda/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName: signatoryName.trim(),
          signatoryTitle: signatoryTitle.trim(),
          signatoryEmail: email.trim() || undefined,
          clientCompany: company.trim(),
          clientAddress: address.trim() || undefined,
          purpose: purpose.trim() || undefined,
          signatureType: mode === "type" ? "typed" : "drawn",
          signatureText: mode === "type" ? signatureText.trim() : undefined,
          signatureDataUrl: mode === "draw" ? signatureDataUrl : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors([json.error || "Something went wrong. Please try again."]);
        return;
      }
      setSigned({
        name: signatoryName.trim(),
        company: company.trim(),
        dateStr: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
        pdfUrl: json.pdfUrl ?? null,
      });
    } catch {
      setErrors(["Network error — please check your connection and try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="nda-root">
      <style>{`
        /* 794px = 210mm at 96dpi — same A4 width the generated PDF renders at (see nda-template.ts) */
        .nda-root { max-width: 794px; margin: 0 auto; padding: 24px 16px 60px; font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; color: #333; background: #EFEFF4; }
        .nda-sheet { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(20,20,40,0.07), 0 10px 30px -14px rgba(20,20,40,0.22); margin-bottom: 10px; }
        .nda-page-label { text-align: center; font-size: 10.5px; color: #999; margin: -2px 0 22px; }
        .nda-header { background: #2F48DF; padding: 22px 32px; color: #fff; font-size: 17px; }
        .nda-body { padding: 28px 32px; }
        .nda-clause { margin-bottom: 16px; break-inside: avoid; page-break-inside: avoid; }
        @media print {
          .nda-root { background: #fff; padding: 0; max-width: none; }
          .nda-sheet { box-shadow: none; border-radius: 0; margin-bottom: 0; }
          .nda-sheet + .nda-page-label + .nda-sheet { break-before: page; page-break-before: always; }
          .nda-page-label { display: none; }
        }
        .nda-field { margin-bottom: 14px; }
        .nda-field label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 5px; }
        .nda-field input[type="text"], .nda-field input[type="email"] { width: 100%; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #d5d5dd; border-radius: 6px; }
        .nda-tabs { display: flex; gap: 5px; background: rgba(47,72,223,0.06); padding: 3px; border-radius: 8px; width: fit-content; margin-bottom: 9px; }
        .nda-tab { font: inherit; font-size: 0.8rem; font-weight: 600; border: none; background: transparent; color: #666; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
        .nda-tab[data-active="true"] { background: #fff; color: #0A0A0A; }
        .nda-sig-box { border: 1px solid #e5e5ea; border-radius: 8px; padding: 12px; }
        .nda-canvas { width: 100%; height: 120px; border: 1px dashed #d5d5dd; border-radius: 8px; touch-action: none; }
        .nda-errors { background: rgba(179,38,30,0.08); color: #B3261E; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 12px; }
        .nda-agree { display: flex; gap: 9px; align-items: flex-start; margin: 14px 0; font-size: 11.5px; }
        .nda-btn { font: inherit; font-weight: 700; font-size: 0.9rem; color: #fff; background: #2F48DF; border: none; border-radius: 9px; padding: 11px 22px; cursor: pointer; }
        .nda-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      {signed ? (
        <div className="nda-sheet">
          <div className="nda-header">Studiobee &middot; Non-Disclosure Agreement</div>
          <div className="nda-body">
            <p style={{ marginBottom: 12 }}>
              <strong>Signed</strong> by {signed.name} on behalf of {signed.company} on {signed.dateStr}.
            </p>
            {signed.pdfUrl && (
              <a className="nda-btn" href={signed.pdfUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-block" }}>
                Download your copy
              </a>
            )}
            {!signed.pdfUrl && <p style={{ fontSize: 12, color: "#666" }}>Your PDF copy is being prepared — check back shortly or contact Studiobee.</p>}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* Page 1 of 2 — mirrors where the generated PDF's own page break naturally
              falls (see nda-template.ts): intro + the first 7 clauses. */}
          <div className="nda-sheet">
            <div className="nda-header">Studiobee &middot; Non-Disclosure Agreement</div>
            <div className="nda-body">
              <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
                This Non-Disclosure Agreement is made between <strong>Studiobee Private Limited</strong> and{" "}
                <strong>{company || "[Client Company Name]"}</strong>. By signing below, both parties agree to the
                following terms:
              </p>
              {CLAUSES.slice(0, 7).map((c) => (
                <div key={c.title} className="nda-clause">
                  <strong style={{ display: "block", marginBottom: 4, color: "#2F48DF", fontSize: 13 }}>{c.title}</strong>
                  <p style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>{c.body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="nda-page-label">Page 1 of 2</div>

          {/* Page 2 of 2 — remaining clauses, then the signature form. */}
          <div className="nda-sheet">
            <div className="nda-body">
              {CLAUSES.slice(7).map((c) => (
                <div key={c.title} className="nda-clause">
                  <strong style={{ display: "block", marginBottom: 4, color: "#2F48DF", fontSize: 13 }}>{c.title}</strong>
                  <p style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>{c.body}</p>
                </div>
              ))}

              {errors.length > 0 && (
                <div className="nda-errors">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="nda-field">
                <label htmlFor="company">Company name</label>
                <input id="company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="signatoryName">Your full name</label>
                <input id="signatoryName" type="text" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="signatoryTitle">Your title</label>
                <input id="signatoryTitle" type="text" value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="address">Company address</label>
                <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="email">Email (to send you a copy)</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="purpose">What&rsquo;s the engagement? (optional)</label>
                <input id="purpose" type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>

              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Signature</label>
              <div className="nda-tabs" role="tablist">
                <button type="button" className="nda-tab" data-active={mode === "type"} onClick={() => setMode("type")}>
                  Type
                </button>
                <button type="button" className="nda-tab" data-active={mode === "draw"} onClick={() => setMode("draw")}>
                  Draw
                </button>
              </div>

              {mode === "type" ? (
                <div className="nda-sig-box">
                  <input
                    type="text"
                    placeholder="Type your full name"
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    style={{ border: "none", width: "100%", fontFamily: "'Caveat', cursive", fontSize: "1.6rem" }}
                  />
                </div>
              ) : (
                <div className="nda-sig-box">
                  <canvas ref={canvasRef} className="nda-canvas" width={500} height={140} />
                  <div style={{ textAlign: "right", marginTop: 6 }}>
                    <button type="button" onClick={clearCanvas} style={{ fontSize: 12, background: "none", border: "none", color: "#2F48DF", cursor: "pointer" }}>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <div className="nda-agree">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                <label style={{ margin: 0 }}>
                  I confirm I am authorised to sign on behalf of {company || "[Client Company Name]"} and I have read and agree to the terms of this
                  Non-Disclosure Agreement.
                </label>
              </div>

              <button type="submit" className="nda-btn" disabled={submitting}>
                {submitting ? "Signing…" : "Sign agreement"}
              </button>
            </div>
          </div>
          <div className="nda-page-label">Page 2 of 2</div>
        </form>
      )}
    </div>
  );
}
