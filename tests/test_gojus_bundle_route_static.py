from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def read(p):return (ROOT/p).read_text(encoding="utf-8")
def test_gojus_bundle_scopes_and_fail_closed():
    s=read("lib/gojus/bundle-service.ts")
    r=read("app/api/leads/[id]/gojus-pdf/route.ts")
    assert "leadId:input.leadId,channel:'whatsapp'" in s
    assert "direction:'inbound'" in s and "expiresAt:{gt:new Date()}" in s
    assert "review?.complete" in s and "review.modeApproved" in s
    assert "a.objectKey!==" in s and "redirect:'error'" in s
    assert "GOJUS_PDF_WORKER_ENABLED!=='1'" in s
    assert "current.fingerprint!==manifest.fingerprint" in s
    assert "canEditLead(session.role,lead,session.userId)" in r
    assert "tenantHasFeature(session.tenantId,'gojus_sheet')" in r
    assert "private, no-store" in r and "gojus.pdf_generated" in r
    assert "GOJUS_OUTPUT_LIMIT" in s
    assert "GOJUS_PDF_R2_LIFECYCLE_VERIFIED!=='1'" in s
    assert "downloadUrl:result.url" in r
    assert "content:bytes.toString('base64')" not in s

    assert "flip-pdf-temp/${input.tenantId}/" in s
    assert "digest.digest('hex')!==result.sha256" in s

    assert "req.headers.get('x-vercel-oidc-token')" in r
    assert "GOJUS_PDF_WORKER_HOST" in s
    assert "trustedPdfHeaders" in s
    assert "if(!headers)throw new GoJusBundleError('unavailable')" in s
    assert "x-vercel-trusted-oidc-idp-token" in read("lib/gojus/worker-transport.ts")
