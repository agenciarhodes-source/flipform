from hashlib import sha256
from io import BytesIO
from pathlib import Path
import importlib.util
import sys

import pytest
from PIL import Image
from pypdf import PdfReader, PdfWriter

spec = importlib.util.spec_from_file_location("gojus_pdf_bundle", Path(__file__).resolve().parents[1] / "workers/gojus/pdf_bundle.py")
engine = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = engine
spec.loader.exec_module(engine)

def source(data, mime):
    return engine.Source(data, mime, sha256(data).hexdigest())

def png():
    out = BytesIO()
    Image.new("RGB", (150, 250), "white").save(out, "PNG")
    return out.getvalue()

def pdf(pages=2, encrypted=False):
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=300, height=400)
    if encrypted:
        writer.encrypt("synthetic-password")
    out = BytesIO()
    writer.write(out)
    return out.getvalue()

def test_real_pdf_and_image_conversion_preserves_original_bytes():
    original = pdf()
    photo = png()
    bundle = engine.build_bundle([source(original, "application/pdf"), source(photo, "image/png")])
    reader = PdfReader(BytesIO(bundle.pdf))
    assert len(reader.pages) == bundle.page_count == 3
    assert bundle.original_hashes == (sha256(original).hexdigest(), sha256(photo).hexdigest())
    assert bundle.output_sha256 == sha256(bundle.pdf).hexdigest()
    assert all("/Annots" not in page for page in reader.pages)
    assert len(PdfReader(BytesIO(original)).pages) == 2

def test_rejects_corruption_changed_hash_duplicates_and_encrypted():
    original = source(pdf(), "application/pdf")
    for files in ([], [source(b"not pdf", "application/pdf")], [engine.Source(original.content, original.mime, "0"*64)], [original, original], [source(pdf(encrypted=True), "application/pdf")], [source(png(),"image/jpeg")]):
        with pytest.raises(engine.BundleError):
            engine.build_bundle(files)

def test_limits_fail_without_partial_result(monkeypatch):
    monkeypatch.setattr(engine, "MAX_PAGES", 1)
    with pytest.raises(engine.BundleError):
        engine.build_bundle([source(pdf(), "application/pdf")])
    monkeypatch.setattr(engine, "MAX_IMAGE_PIXELS", 100)
    with pytest.raises(engine.BundleError):
        engine.build_bundle([source(png(), "image/png")])
