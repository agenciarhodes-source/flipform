"""Offline PDF presentation copy. Never replaces signed originals. No OCR, network or AI.

Call only from a resource-limited, isolated worker with a server-authorized manifest.
The input sequence is the approved order, never paths/URLs from a customer.
"""
from contextlib import closing
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import warnings

import pypdfium2 as pdfium
from PIL import Image, ImageOps
from pypdf import PdfReader, PdfWriter

MAX_FILES = 40
MAX_INPUT_BYTES = 60 * 1024 * 1024
MAX_SINGLE_BYTES = 20 * 1024 * 1024
MAX_OUTPUT_BYTES = 24 * 1024 * 1024
MAX_PAGES = 120
MAX_IMAGE_PIXELS = 20_000_000
MAX_RENDER_PIXELS = 4_000_000
DPI = 150

class BundleError(ValueError):
    """Controlled error; never includes file contents, names or third-party exception text."""

@dataclass(frozen=True)
class Source:
    content: bytes
    mime: str
    expected_sha256: str

@dataclass(frozen=True)
class Bundle:
    pdf: bytes
    original_hashes: tuple[str, ...]
    page_count: int
    output_sha256: str

def digest(data: bytes) -> str:
    return sha256(data).hexdigest()

def image_pdf(image: Image.Image) -> bytes:
    if image.width * image.height > MAX_IMAGE_PIXELS:
        raise BundleError("Imagem excede o limite de pixels.")
    image = ImageOps.exif_transpose(image)
    image.thumbnail((2200, 2200), Image.Resampling.LANCZOS)
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba = image.convert("RGBA")
        rgb = Image.new("RGB", rgba.size, "white")
        rgb.paste(rgba, mask=rgba.getchannel("A"))
    else:
        rgb = image.convert("RGB")
    out = BytesIO()
    # Explicit dates avoid variable metadata; no original filename or EXIF copied.
    rgb.save(out, format="PDF", resolution=DPI, quality=88,
             creationDate=None, modDate=None, title="", author="", subject="")
    return out.getvalue()

def append_raster_page(writer: PdfWriter, data: bytes):
    reader = PdfReader(BytesIO(data), strict=True)
    if len(reader.pages) != 1:
        raise BundleError("Conversão de página inválida.")
    writer.add_page(reader.pages[0], excluded_keys=("/Annots", "/AA", "/A"))

def build_bundle(sources: list[Source]) -> Bundle:
    if not 1 <= len(sources) <= MAX_FILES:
        raise BundleError("Quantidade de arquivos inválida.")
    if any(not s.content or len(s.content) > MAX_SINGLE_BYTES for s in sources):
        raise BundleError("Arquivo vazio ou acima do limite.")
    if sum(len(s.content) for s in sources) > MAX_INPUT_BYTES:
        raise BundleError("Limite total de entrada excedido.")
    hashes = tuple(digest(s.content) for s in sources)
    if any(h != s.expected_sha256 for h, s in zip(hashes, sources)):
        raise BundleError("Arquivo mudou após a conferência.")
    if len(set(hashes)) != len(hashes):
        raise BundleError("Arquivos duplicados no manifesto.")
    writer = PdfWriter()
    count = 0
    estimated = 0

    def add_page(data: bytes):
        nonlocal count, estimated
        count += 1
        estimated += len(data)
        if count > MAX_PAGES or estimated > MAX_OUTPUT_BYTES:
            raise BundleError("Limite do PDF unificado excedido.")
        append_raster_page(writer, data)

    try:
        for source in sources:
            if source.mime == "application/pdf":
                if not source.content.startswith(b"%PDF-"):
                    raise BundleError("Tipo de arquivo incompatível.")
                reader = PdfReader(BytesIO(source.content), strict=True)
                if reader.is_encrypted:
                    raise BundleError("PDF protegido exige revisão humana.")
                with pdfium.PdfDocument(source.content) as document:
                    if len(document) < 1 or len(document) != len(reader.pages) or count + len(document) > MAX_PAGES:
                        raise BundleError("Quantidade de páginas inválida.")
                    document.init_forms()
                    for index in range(len(document)):
                        with closing(document[index]) as page:
                            width, height = page.get_size()
                            if not (0 < width <= 14400 and 0 < height <= 14400):
                                raise BundleError("Dimensão de página inválida.")
                            scale = min(DPI / 72, (MAX_RENDER_PIXELS / (width * height)) ** 0.5)
                            with closing(page.render(scale=scale, draw_annots=True)) as bitmap:
                                # Rasterize visible content; do not import forms, actions or embedded files.
                                add_page(image_pdf(bitmap.to_pil().copy()))
            elif source.mime in ("image/jpeg", "image/png"):
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    with Image.open(BytesIO(source.content)) as image:
                        if image.format != {"image/jpeg":"JPEG","image/png":"PNG"}[source.mime] or getattr(image, "n_frames", 1) != 1:
                            raise BundleError("Imagem incompatível ou com múltiplos quadros.")
                        if image.width * image.height > MAX_IMAGE_PIXELS:
                            raise BundleError("Imagem excede o limite de pixels.")
                        image.load()
                        add_page(image_pdf(image))
            else:
                raise BundleError("Formato não suportado.")
        result = BytesIO()
        writer.add_metadata({"/Title": "Documentacao reunida - copia de apresentacao"})
        writer.write(result)
        output = result.getvalue()
        if not count or len(output) > MAX_OUTPUT_BYTES or len(PdfReader(BytesIO(output), strict=True).pages) != count:
            raise BundleError("PDF final inválido ou acima do limite.")
        return Bundle(output, hashes, count, digest(output))
    except BundleError:
        raise
    except Exception:
        raise BundleError("Arquivo não pôde ser convertido; revisão humana necessária.") from None
