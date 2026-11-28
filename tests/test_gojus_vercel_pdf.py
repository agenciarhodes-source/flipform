import importlib.util
import sys
from pathlib import Path
from io import BytesIO
from hashlib import sha256
import pytest
from PIL import Image

root=Path(__file__).resolve().parents[1]/"workers/gojus"
sys.path.insert(0,str(root))
spec=importlib.util.spec_from_file_location("gojus_vercel_pdf",root/"api/pdf.py")
worker=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=worker
spec.loader.exec_module(worker)

ENV={"R2_ACCOUNT_ID":"a"*32,"R2_ATTACHMENTS_BUCKET":"test-bucket"}
def url(path,output=False):
    return "https://"+ENV["R2_ACCOUNT_ID"]+".r2.cloudflarestorage.com/test-bucket/"+path+"?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=synthetic&X-Amz-Date=20261126T000000Z&X-Amz-Expires=180&X-Amz-SignedHeaders="+("content-type%3Bhost" if output else "host")+"&X-Amz-Signature="+"a"*64

def test_rejects_other_tenant_host_redirect_and_wrong_prefix():
    good=url("tenants/a/whatsapp/id")
    assert worker.valid_url(good,"a",False,ENV)
    assert not worker.valid_url(good,"b",False,ENV)
    assert not worker.valid_url(good.replace(".r2.cloudflarestorage.com",".evil.example"),"a",False,ENV)
    assert not worker.valid_url(good,"a",True,ENV)
    assert not worker.valid_url(good.replace("/whatsapp/","/flip-pdf-temp/"),"a",False,ENV)
    assert not worker.valid_url(good+"&extra=1","a",False,ENV)
    assert worker.NoRedirect().redirect_request(None,None,None,None,None) is None

def test_real_pdf_conversion_with_mocked_private_r2_get_and_put():
    b=BytesIO()
    Image.new("RGB",(100,150),"white").save(b,"PNG")
    image=b.getvalue()
    source=url("tenants/a/whatsapp/id")
    target=url("flip-pdf-temp/a/12345678-1234-4234-8234-123456789abc.pdf",True)
    assert not worker.valid_url(target,"b",True,ENV)
    assert not worker.valid_url(url("tenants/a/gojus-temp/12345678-1234-4234-8234-123456789abc.pdf",True),"a",True,ENV)
    manifest={"tenantId":"a","files":[{"url":source,"mime":"image/png","size":len(image)}],"outputUrl":target}
    class Response(BytesIO):
        def __init__(self,data):
            super().__init__(data)
            self.status=200
            self.headers={"Content-Length":str(len(data))}
    class Fake:
        uploaded=None
        def open(self,request,timeout):
            assert timeout>0
            if request.get_method()=="GET":
                assert request.full_url==source
                return Response(image)
            assert request.get_method()=="PUT" and request.full_url==target
            self.uploaded=request.data
            return Response(b"")
    fake=Fake()
    result=worker.process(manifest,ENV,fake)
    assert fake.uploaded.startswith(b"%PDF-")
    assert result=={"size":len(fake.uploaded),"sha256":sha256(fake.uploaded).hexdigest(),"pages":1}
    with pytest.raises(ValueError):
        worker.validate_manifest(dict(manifest,files=manifest["files"]*2),ENV)


def test_transport_diagnostic_is_staging_only_and_rejects_real_manifests():
    env={"FLIP_PDF_TRANSPORT_TEST_ENABLED":"1","VERCEL":"1","VERCEL_ENV":"production","VERCEL_URL":"flip-pdf-staging-abc123-agenciarhodes-2076s-projects.vercel.app"}
    assert worker.diagnostic_enabled(env)
    assert not worker.diagnostic_enabled(dict(env,GOJUS_PDF_R2_LIFECYCLE_VERIFIED="1"))
    assert not worker.diagnostic_enabled(dict(env,VERCEL_URL="flip-pdf-production-abc123-agenciarhodes-2076s-projects.vercel.app"))
    assert not worker.diagnostic_enabled({})
    nonce="a"*32
    assert worker.diagnostic_response({"diagnostic":"flip-pdf-transport-v1","nonce":nonce})=={"ok":True,"synthetic":True,"nonce":nonce}
    with pytest.raises(ValueError):worker.diagnostic_response({"tenantId":"a","files":[],"outputUrl":"https://example.com"})
    with pytest.raises(ValueError):worker.diagnostic_response({"diagnostic":"flip-pdf-transport-v1","nonce":nonce,"extra":"data"})

def test_r2_qa_isolated_bucket_scope_and_fixture():
    env={"FLIP_PDF_R2_TEST_ENABLED":"1","FLIP_PDF_QA_LIFECYCLE_VERIFIED":"1","FLIP_PDF_QA_R2_BUCKET":"flip-pdf-qa","FLIP_PDF_QA_R2_ACCOUNT_ID":"a"*32,"VERCEL":"1","VERCEL_ENV":"production","VERCEL_URL":"flip-pdf-staging-abc123-agenciarhodes-2076s-projects.vercel.app"}
    assert worker.r2_qa_enabled(env)
    for change in ({"FLIP_PDF_QA_R2_BUCKET":"flipform-anexos"},{"GOJUS_PDF_R2_LIFECYCLE_VERIFIED":"1"},{"FLIP_PDF_TRANSPORT_TEST_ENABLED":"1"},{"FLIP_PDF_QA_LIFECYCLE_VERIFIED":"0"}):
        assert not worker.r2_qa_enabled(dict(env,**change))
    from base64 import b64decode
    fixture=b64decode("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKUlEQVR4nO3NMQEAAAjDMMC/52ECvlRA00nqs3m9AwAAAAAAAAAAgMMWx/EDPS4YA2MAAAAASUVORK5CYII=")
    assert len(fixture)==worker.QA_FIXTURE_SIZE and sha256(fixture).hexdigest()==worker.QA_FIXTURE_SHA256
    tenant="qa-12345678-1234-4234-8234-123456789abc"
    key="12345678-1234-4234-8234-123456789abd"
    source=url("tenants/"+tenant+"/whatsapp/"+key).replace("/test-bucket/","/flip-pdf-qa/")
    target=url("flip-pdf-temp/"+tenant+"/"+key+".pdf",True).replace("/test-bucket/","/flip-pdf-qa/")
    manifest={"tenantId":tenant,"files":[{"url":source,"mime":"image/png","size":len(fixture)}],"outputUrl":target}
    class Response(BytesIO):
        def __init__(self,data):
            super().__init__(data)
            self.status=200
            self.headers={"Content-Length":str(len(data))}
    class Fake:
        def __init__(self,data):self.data=data;self.uploaded=None
        def open(self,request,timeout):
            if request.get_method()=="GET":
                assert request.full_url==source
                return Response(self.data)
            assert request.get_method()=="PUT" and request.full_url==target
            self.uploaded=request.data
            return Response(b"")
    fake=Fake(fixture)
    assert worker.process_qa(manifest,env,fake)["pages"]==1
    assert fake.uploaded.startswith(b"%PDF-")
    with pytest.raises(ValueError):worker.process_qa(manifest,env,Fake(b"x"*len(fixture)))
    with pytest.raises(ValueError):worker.process_qa(dict(manifest,outputUrl=target.replace("/flip-pdf-qa/","/flipform-anexos/")),env,fake)
