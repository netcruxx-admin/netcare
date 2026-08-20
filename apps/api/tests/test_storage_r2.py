"""The Cloudflare R2 backend, exercised without a network.

boto3 is stubbed rather than mocked at the HTTP layer: what is worth pinning
here is the contract between the seam and the rest of the app — that the URL
written to the database is stable and opaque, that the one handed to a browser
is signed, and that the two never get confused. Whether boto3 can talk to
Cloudflare is boto3's problem.
"""

import io

import pytest
from fastapi import HTTPException

from app import storage
from app.config import settings

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


class FakeR2:
    """Just enough S3 client for the seam."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.extra: dict[str, dict] = {}
        self.deleted: list[str] = []

    def upload_fileobj(self, fileobj, bucket, key, ExtraArgs=None):
        self.objects[key] = fileobj.read()
        self.extra[key] = ExtraArgs or {}

    def generate_presigned_url(self, op, Params, ExpiresIn):
        return f"https://signed.example/{Params['Key']}?op={op}&exp={ExpiresIn}"

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)


@pytest.fixture
def r2(monkeypatch):
    fake = FakeR2()
    monkeypatch.setattr(settings, "storage_backend", "r2")
    monkeypatch.setattr(settings, "r2_bucket", "test-bucket")
    monkeypatch.setattr(settings, "r2_public_base_url", "")
    monkeypatch.setattr(storage, "_client", lambda: fake)
    return fake


def _save(name="scan.pdf", content_type="application/pdf", folder="hosp-1"):
    return storage.save_upload(
        fileobj=io.BytesIO(PNG),
        filename=name,
        content_type=content_type,
        folder=folder,
    )


def test_stored_url_is_opaque_and_not_fetchable(r2):
    """The value that lands in the database must not be a link.

    If it were, a handler that forgot public_url() would still appear to work —
    right up until the signature expired, days after anyone was looking.
    """
    url, original, size = _save()
    assert url.startswith("r2://hosp-1/")
    assert url.endswith(".pdf")
    assert original == "scan.pdf"
    assert size == len(PNG)
    assert list(r2.objects) == [url[len("r2://"):]]


def test_public_url_signs_a_stored_url(r2):
    url, _, _ = _save()
    signed = storage.public_url(url)
    assert signed.startswith("https://signed.example/hosp-1/")
    assert f"exp={settings.r2_signed_url_ttl_seconds}" in signed


def test_public_base_url_skips_signing(r2, monkeypatch):
    """A bucket published on a custom domain is opt-in, and unsigned."""
    monkeypatch.setattr(settings, "r2_public_base_url", "https://files.example.com/")
    url, _, _ = _save()
    assert storage.public_url(url) == f"https://files.example.com/{url[len('r2://'):]}"


def test_public_url_leaves_a_local_url_alone(r2):
    """Rows written before the switch to R2 still point at /files."""
    assert storage.public_url("/files/hosp-1/file-abc-scan.pdf") == (
        "/files/hosp-1/file-abc-scan.pdf"
    )
    assert storage.public_url("") == ""


def test_a_failed_signature_costs_one_row_not_the_page(r2, monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("R2 unreachable")

    monkeypatch.setattr(r2, "generate_presigned_url", boom)
    assert storage.public_url("r2://hosp-1/file-abc-scan.pdf") == ""


def test_delete_removes_the_object(r2):
    url, _, _ = _save()
    storage.delete_file(url)
    assert r2.deleted == [url[len("r2://"):]]


def test_key_cannot_escape_its_folder(r2):
    """The stored URL comes back out of the database, so it is not trusted."""
    assert storage._r2_key("r2://../../etc/passwd") == "etc/passwd"
    assert storage._r2_key("/files/hosp-1/x.pdf") == ""


def test_size_ceiling_still_applies_and_uploads_nothing(r2, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    with pytest.raises(HTTPException) as exc:
        storage.save_upload(
            fileobj=io.BytesIO(b"0" * (2 * 1024 * 1024)),
            filename="big.pdf",
            content_type="application/pdf",
            folder="hosp-1",
        )
    assert exc.value.status_code == 413
    assert r2.objects == {}


def test_empty_file_is_refused(r2):
    with pytest.raises(HTTPException) as exc:
        storage.save_upload(
            fileobj=io.BytesIO(b""),
            filename="empty.pdf",
            content_type="application/pdf",
            folder="hosp-1",
        )
    assert exc.value.status_code == 400
    assert r2.objects == {}


def test_content_type_allowlist_is_unchanged(r2):
    with pytest.raises(HTTPException) as exc:
        _save(name="payload.html", content_type="text/html")
    assert exc.value.status_code == 415
    assert r2.objects == {}


def test_local_backend_still_returns_a_served_path(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "storage_backend", "local")
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    url, original, size = _save(name="cert.png", content_type="image/png")
    assert url.startswith(f"{settings.files_url_prefix}/hosp-1/")
    assert storage.public_url(url) == url
    assert size == len(PNG)
    stored = tmp_path / "hosp-1" / url.rsplit("/", 1)[1]
    assert stored.read_bytes() == PNG

    storage.delete_file(url)
    assert not stored.exists()
