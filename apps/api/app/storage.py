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


def ensure_root() -> Path:
    """Create the local upload root at boot (no-op when using R2)."""
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    return root
