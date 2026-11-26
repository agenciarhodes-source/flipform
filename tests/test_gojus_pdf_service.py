from pathlib import Path
import sys
import base64
import hashlib
from io import BytesIO
import pytest
from PIL import Image

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"workers/gojus"))
import pdf_service

def test_worker_adapter_real_pdf_and_limits(monkeypatch):
    out=BytesIO()
    Image.new("RGB",(100,150),"white").save(out,"PNG")
    raw=out.getvalue()
    f={"mime":"image/png","sha256":hashlib.sha256(raw).hexdigest(),"content":base64.b64encode(raw).decode()}
    result=pdf_service.convert({"files":[f]})
    assert result.pdf.startswith(b"%PDF-")
    with pytest.raises(ValueError):
        pdf_service.convert({"files":[dict(f,sha256="0"*64)]})
    with pytest.raises(ValueError):
        pdf_service.convert({"files":[dict(f,url="https://example.invalid")]})
    monkeypatch.setattr(pdf_service,"MAX_DOWNLOAD",5)
    with pytest.raises(OverflowError):
        pdf_service.convert({"files":[f]})
