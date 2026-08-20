"""Where uploaded files go, and what comes back.

One seam, so the rest of the app never learns whether a registration certificate
landed on local disk or in a bucket. `save_upload()` returns a URL; callers store
that string and nothing else.

Two backends:
- R2 (Cloudflare): used when R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and
  R2_SECRET_ACCESS_KEY are all set. Files are served via the R2 public URL.
- Local disk: development fallback. Files vanish on a container restart.
"""

import re
import unicodedata
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import BinaryIO

from fastapi import HTTPException, status

from .config import settings
from .utils import new_id

ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/tiff": ".tiff",
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")

R2_SCHEME = "r2://"


def _backend() -> str:
    return (settings.storage_backend or "local").strip().lower()


def _use_r2() -> bool:
    return bool(
        settings.r2_account_id
        and settings.r2_access_key_id
        and settings.r2_secret_access_key
    )


def _r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto",
    )


def _root() -> Path:
    root = Path(settings.upload_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parent.parent / root
    return root


def safe_filename(name: str) -> str:
    name = Path(name or "").name.replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    name = _SAFE_NAME.sub("-", name).strip("-._")
    return name[:120] or "file"


# ----- Cloudflare R2 ---------------------------------------------------------


_r2_client = None


def _r2_endpoint() -> str:
    """The S3-compatible endpoint for the account.

    R2 publishes one per account, so the account id is enough. An explicit
    R2_ENDPOINT still wins, because jurisdiction-specific endpoints exist and
    guessing at them here would be worse than letting the operator say.
    """
    if settings.r2_endpoint:
        return settings.r2_endpoint.rstrip("/")
    return f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"


def _client():
    """A cached boto3 S3 client pointed at R2.

    boto3 is imported here rather than at module scope so a developer running
    the local backend never needs it installed.
    """
    global _r2_client
    if _r2_client is not None:
        return _r2_client

    missing = [
        name
        for name, value in (
            ("R2_BUCKET", settings.r2_bucket),
            ("R2_ACCESS_KEY_ID", settings.r2_access_key_id),
            ("R2_SECRET_ACCESS_KEY", settings.r2_secret_access_key),
            ("R2_ACCOUNT_ID or R2_ENDPOINT", settings.r2_account_id or settings.r2_endpoint),
        )
        if not value
    ]
    if missing:
        raise RuntimeError(
            "STORAGE_BACKEND=r2 needs " + ", ".join(missing) + " in the environment"
        )

    try:
        import boto3
        from botocore.config import Config
    except ImportError as exc:  # pragma: no cover - environment problem, not logic
        raise RuntimeError(
            "STORAGE_BACKEND=r2 needs boto3 — it is in requirements.txt"
        ) from exc

    _r2_client = boto3.session.Session().client(
        "s3",
        endpoint_url=_r2_endpoint(),
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        # R2 has no regions, but SigV4 will not sign without one and boto3 will
        # not fall back to a default here.
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )
    return _r2_client


def _r2_key(url: str) -> str:
    """The object key inside a stored `r2://` URL, or "" if it is not one."""
    if not url or not url.startswith(R2_SCHEME):
        return ""
    relative = url[len(R2_SCHEME):]
    parts = [safe_filename(p) for p in relative.split("/") if p not in ("", ".", "..")]
    return "/".join(parts)


# ----- The seam --------------------------------------------------------------


def _capped_copy(fileobj: BinaryIO) -> tuple[SpooledTemporaryFile, int]:
    """Read the upload into a spooled buffer, refusing it past the ceiling.

    Reads in chunks and aborts the moment the size ceiling is passed, so a
    multi-gigabyte body costs a few megabytes of memory rather than filling the
    disk before anyone checks. Small files never touch the disk at all.
    """
    limit = settings.max_upload_mb * 1024 * 1024
    buffer = SpooledTemporaryFile(max_size=1024 * 1024)
    size = 0
    try:
        while chunk := fileobj.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    f"File is larger than {settings.max_upload_mb}MB",
                )
            buffer.write(chunk)
    except Exception:
        buffer.close()
        raise

    if size == 0:
        buffer.close()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    buffer.seek(0)
    return buffer, size


def save_upload(
    *,
    fileobj: BinaryIO,
    filename: str,
    content_type: str,
    folder: str,
) -> tuple[str, str, int]:
    """Persist an upload. Returns (url, stored_name, size_bytes)."""
    ext = ALLOWED_CONTENT_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if ext is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Upload a PDF or an image (JPEG, PNG, WebP, HEIC, TIFF)",
        )

    original = safe_filename(filename)
    stem = Path(original).stem or "file"
    stored_name = f"{new_id('file')}-{stem}{ext}"
    safe_folder = safe_filename(folder)
    object_key = f"{safe_folder}/{stored_name}"

    # Read file into memory (respecting size limit)
    limit = settings.max_upload_mb * 1024 * 1024
    data = b""
    while chunk := fileobj.read(1024 * 1024):
        data += chunk
        if len(data) > limit:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"File is larger than {settings.max_upload_mb}MB",
            )

    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    if _use_r2():
        import io
        client = _r2_client()
        client.upload_fileobj(
            io.BytesIO(data),
            settings.r2_bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
        base = (settings.r2_public_url or "").rstrip("/")
        if base:
            url = f"{base}/{object_key}"
        else:
            # Fallback: use R2 S3-compatible URL (requires bucket to be public)
            url = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com/{settings.r2_bucket}/{object_key}"
    else:
        directory = _root() / safe_folder
        directory.mkdir(parents=True, exist_ok=True)
        destination = directory / stored_name
        try:
            destination.write_bytes(data)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        url = f"{settings.files_url_prefix.rstrip('/')}/{safe_folder}/{stored_name}"

    return url, original, len(data)


def delete_file(url: str) -> None:
    """Best-effort removal of a file this module wrote."""
    if _use_r2():
        try:
            # Extract object key from URL
            base = (settings.r2_public_url or "").rstrip("/")
            if base and url.startswith(base + "/"):
                object_key = url[len(base) + 1:]
            else:
                return
            _r2_client().delete_object(Bucket=settings.r2_bucket, Key=object_key)
        except Exception:
            pass
        return

    prefix = settings.files_url_prefix.rstrip("/") + "/"
    if not url or not url.startswith(prefix):
        return
    relative = url[len(prefix):]
    parts = [safe_filename(p) for p in relative.split("/") if p not in ("", ".", "..")]
    if not parts:
        return
    path = _root().joinpath(*parts)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def serves_locally() -> bool:
    """Whether this process has to serve the files itself.

    False on R2, where the bytes are fetched straight from Cloudflare and
    mounting a static directory would only advertise an empty one.
    """
    return _backend() != "r2"


def ensure_root() -> Path:
    """Create the local upload root at boot (no-op when using R2)."""
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def ensure_ready() -> None:
    """Fail at boot rather than on the first upload.

    A misconfigured bucket that only shows up when a hospital is halfway through
    onboarding is far more expensive than a container that refuses to start.
    """
    if serves_locally():
        ensure_root()
        return
    _client()  # raises on missing configuration
