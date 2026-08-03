"""Where uploaded files go, and what comes back.

One seam, so the rest of the app never learns whether a registration certificate
landed on local disk or in a bucket. `save_upload()` returns a URL; callers store
that string and nothing else. Swapping to S3 means reimplementing this module,
not touching the routers.

Local disk is the development implementation. It is deliberately not a
production one: files vanish on a container restart and a second instance cannot
see the first one's uploads.
"""

import re
import unicodedata
from pathlib import Path
from typing import BinaryIO

from fastapi import HTTPException, status

from .config import settings
from .utils import new_id

# What a scan of a certificate can plausibly be. An allowlist rather than a
# blocklist: this directory is served back over HTTP, so anything the browser
# might execute — .html, .svg with script, .js — must never reach it, and
# enumerating the safe types is the only way to be sure of that.
ALLOWED_CONTENT_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/tiff": ".tiff",
}

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def _root() -> Path:
    root = Path(settings.upload_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parent.parent / root
    return root


def safe_filename(name: str) -> str:
    """A filename that cannot escape its directory or carry a surprise.

    Strips accents, collapses everything outside `[A-Za-z0-9._-]`, and drops any
    path component — a browser on Windows sends `C:\\Users\\...\\scan.pdf` as the
    filename, and `..` is a directory traversal wearing a hat.
    """
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
    """Persist an upload under `folder`. Returns (url, stored_name, size_bytes).

    Reads in chunks and aborts the moment the size ceiling is passed, so a
    multi-gigabyte body costs a few kilobytes of memory and one deleted file
    rather than filling the disk before anyone checks.
    """
    ext = ALLOWED_CONTENT_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if ext is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Upload a PDF or an image (JPEG, PNG, WebP, HEIC, TIFF)",
        )

    original = safe_filename(filename)
    stem = Path(original).stem or "file"
    # The stored name is prefixed with a fresh id so two hospitals uploading
    # "pan.pdf" cannot collide, and so a guessed URL is not a readable one.
    stored_name = f"{new_id('file')}-{stem}{ext}"

    directory = _root() / safe_filename(folder)
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / stored_name

    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    try:
        with destination.open("wb") as out:
            while chunk := fileobj.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"File is larger than {settings.max_upload_mb}MB",
                    )
                out.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise

    if size == 0:
        destination.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File is empty")

    url = f"{settings.files_url_prefix.rstrip('/')}/{safe_filename(folder)}/{stored_name}"
    return url, original, size


def delete_file(url: str) -> None:
    """Best-effort removal of a file this module wrote.

    Failure is deliberately silent. The document row is the record that matters;
    a deleted row whose blob outlived it is litter, but a 500 that leaves the
    row behind because the blob was already gone is a bug the user has to work
    around.
    """
    prefix = settings.files_url_prefix.rstrip("/") + "/"
    if not url or not url.startswith(prefix):
        return
    relative = url[len(prefix):]
    # Re-sanitise every component: the URL came out of the database, and a row
    # written by something other than save_upload() must not be able to point
    # this at an arbitrary path.
    parts = [safe_filename(p) for p in relative.split("/") if p not in ("", ".", "..")]
    if not parts:
        return
    path = _root().joinpath(*parts)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def ensure_root() -> Path:
    """Create the upload root at boot so the first upload is not the first time
    a permissions problem is discovered."""
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    return root
