from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')


def test_verify_dns_button_calls_real_domain_verification_route():
    page = read('app/(app)/domains/domains-client.tsx')
    route = read('app/api/domains/[id]/verify/route.ts')

    assert '`/api/domains/${d.id}/verify`' in page
    assert 'Verificação atualizada.' in page
    assert 'toast.success(data.message || success)' in page
    assert 'if (shouldShowDns) return toast.info("Domínio aguardando configuração DNS.");' not in page

    assert 'syncDomainWithVercel(domain.domain)' in route
    assert 'activateCustomFormDomain' in route
    assert 'lastCheckedAt: new Date()' in route


def test_vercel_verified_domain_activates_without_undocumented_ssl_fields():
    route = read('app/api/domains/[id]/verify/route.ts')

    assert 'result.existsOnVercel && result.verified && result.verificationStatus === "verified"' in route
    assert 'const shouldActivate = result.status === "active" || verifiedByVercel;' in route
    assert 'status: shouldActivate ? "active" : result.status' in route
    assert 'verificationStatus: shouldActivate ? "verified" : result.verificationStatus' in route
    assert 'sslStatus: shouldActivate ? "active" : result.sslStatus' in route
    assert 'dnsTarget: shouldActivate ? null : dnsTarget' in route
    assert 'verificationValue: shouldActivate ? null : verificationValue' in route
    assert 'verifiedAt: shouldActivate ? new Date() : domain.verifiedAt' in route
    assert 'if (!shouldActivate)' in route
    assert 'connection: isActive ? buildConnection("active") : result.connection' in route
