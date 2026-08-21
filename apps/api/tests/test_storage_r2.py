"""The storage seam, exercised without a network.

boto3 is stubbed rather than mocked at the HTTP layer: what is worth pinning is
the contract between the seam and the rest of the app — what string gets written
to the database, and what a browser is handed for it. Whether boto3 can reach
Cloudflare is boto3's problem.

These assert what the code *does*. Two behaviours documented here are worth a
second look rather than a second test — see the notes on the private-bucket
fallback and on delete_file.
"""

import io

import pytest
from fastapi import HTTPException

from app import storage
from app.config import settings

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
ACCOUNT = "acct123"


class FakeR2:
    """Just enough S3 client for the seam."""

    def __init__(self):
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []

    def upload_fileobj(self, fileobj, bucket, key, ExtraArgs=None):
        self.objects[key] = fileobj.read()

    def generate_presigned_url(self, op, Params, ExpiresIn):
        return f"https://signed.example/{Params['Key']}?exp={ExpiresIn}"

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)


@pytest.fixture
def r2(monkeypatch):
    """Credentials present, so `_use_r2()` is true.

    Note it keys off the credentials alone, not STORAGE_BACKEND — setting the
    three secrets is what switches uploads to R2.
    """
    fake = FakeR2()
    monkeypatch.setattr(settings, "r2_account_id", ACCOUNT)
    monkeypatch.setattr(settings, "r2_access_key_id", "key")
    monkeypatch.setattr(settings, "r2_secret_access_key", "secret")
    monkeypatch.setattr(settings, "r2_bucket", "test-bucket")
    monkeypatch.setattr(settings, "r2_public_url", "")
    # save_upload/delete_file use _r2_client; public_url's presign path uses _client.
    monkeypatch.setattr(storage, "_r2_client", lambda: fake)
    monkeypatch.setattr(storage, "_client", lambda: fake)
    return fake


@pytest.fixture
def local(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "r2_account_id", "")
    monkeypatch.setattr(settings, "r2_access_key_id", "")
    monkeypatch.setattr(settings, "r2_secret_access_key", "")
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path))
    return tmp_path


def _save(name="scan.pdf", content_type="application/pdf", folder="hosp-1"):
    return storage.save_upload(
        fileobj=io.BytesIO(PNG), filename=name, content_type=content_type, folder=folder
    )


def test_a_public_bucket_stores_the_public_url(r2, monkeypatch):
    monkeypatch.setattr(settings, "r2_public_url", "https://files.example.com/")
    url, original, size = _save()
    assert url.startswith("https://files.example.com/hosp-1/")
    assert url.endswith(".pdf")
    assert original == "scan.pdf"
    assert size == len(PNG)
    # The object really went up, under the key inside that URL.
    assert list(r2.objects) == [url[len("https://files.example.com/"):]]


def test_public_url_leaves_an_already_fetchable_url_alone(r2, monkeypatch):
    """Local paths and public R2 URLs are served as stored."""
    monkeypatch.setattr(settings, "r2_public_url", "https://files.example.com")
    url, _, _ = _save()
    assert storage.public_url(url) == url
    assert storage.public_url("/files/hosp-1/file-abc-scan.pdf") == (
        "/files/hosp-1/file-abc-scan.pdf"
    )
    assert storage.public_url("") == ""


def test_a_legacy_opaque_uri_is_signed_on_the_way_out(r2):
    """Rows written under the older `r2://` scheme still open.

    With no public base configured this is the only path that signs anything.
    """
    signed = storage.public_url("r2://hosp-1/file-abc-scan.pdf")
    assert signed.startswith("https://signed.example/hosp-1/")


def test_a_legacy_uri_resolves_against_a_public_base_when_there_is_one(r2, monkeypatch):
    monkeypatch.setattr(settings, "r2_public_url", "https://files.example.com")
    assert storage.public_url("r2://hosp-1/x.pdf") == "https://files.example.com/hosp-1/x.pdf"


def test_a_failed_signature_costs_one_row_not_the_page(r2, monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("R2 unreachable")

    monkeypatch.setattr(r2, "generate_presigned_url", boom)
    # Falls back to the stored value rather than raising through the handler.
    assert storage.public_url("r2://hosp-1/x.pdf") == "r2://hosp-1/x.pdf"


def test_a_key_from_the_database_cannot_escape_its_folder(r2):
    assert storage._r2_key("r2://../../etc/passwd") == "etc/passwd"
    assert storage._r2_key("/files/hosp-1/x.pdf") == ""


def test_delete_removes_the_object_from_a_public_bucket(r2, monkeypatch):
    monkeypatch.setattr(settings, "r2_public_url", "https://files.example.com")
    url, _, _ = _save()
    storage.delete_file(url)
    assert r2.deleted == [url[len("https://files.example.com/"):]]


def test_the_size_ceiling_uploads_nothing_when_it_trips(r2, monkeypatch):
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


def test_an_empty_file_is_refused(r2):
    with pytest.raises(HTTPException) as exc:
        storage.save_upload(
            fileobj=io.BytesIO(b""), filename="empty.pdf",
            content_type="application/pdf", folder="hosp-1",
        )
    assert exc.value.status_code == 400
    assert r2.objects == {}


def test_the_content_type_allowlist_holds(r2):
    """This directory is served back over HTTP, so nothing executable lands."""
    with pytest.raises(HTTPException) as exc:
        _save(name="payload.html", content_type="text/html")
    assert exc.value.status_code == 415
    assert r2.objects == {}


def test_local_disk_stores_and_serves_the_same_path(local):
    url, original, size = _save(name="cert.png", content_type="image/png")
    assert url.startswith(f"{settings.files_url_prefix}/hosp-1/")
    assert storage.public_url(url) == url
    assert size == len(PNG)

    stored = local / "hosp-1" / url.rsplit("/", 1)[1]
    assert stored.read_bytes() == PNG

    storage.delete_file(url)
    assert not stored.exists()
