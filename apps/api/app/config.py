from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from .identity import normalise_email


class Settings(BaseSettings):
    # Postgres for dev and prod. Local Homebrew Postgres uses trust auth, so no
    # password is needed for the default DSN.
    database_url: str = "postgresql+psycopg://localhost:5432/medicare"
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    # How long an access token is good for. Short on purpose: a JWT cannot be
    # recalled, so this is the longest a revoked sign-in can keep working in the
    # worst case. The client refreshes silently, so shortening it costs nothing
    # a user can feel.
    access_token_minutes: int = 15
    # How long a sign-in survives without re-entering a password. The refresh
    # token *is* revocable (see sessions.py), so this being long is safe in a way
    # a seven-day access token was not.
    refresh_token_days: int = 7
    # Failed sign-ins tolerated from one address for one account, and from one
    # address across all accounts, within the window below.
    #
    # Two thresholds because they stop different attacks: the per-account one
    # stops guessing at a known email, the per-address one stops spraying one
    # password across many. Both are scoped to the source address so a remote
    # attacker cannot lock a real user out of their own account by failing on
    # purpose — that would turn a defence into a denial of service.
    login_max_failures_per_account: int = 5
    login_max_failures_per_ip: int = 20
    login_failure_window_minutes: int = 15
    cors_origins: str = "http://localhost:3000"
    # The platform's own domain, with no tenant label. Tenants live one level
    # below it (hospA.netcare.co.in), so this is what distinguishes the
    # operator's front door from a hospital whose subdomain happens to be
    # "netcare". The host alone cannot say: a three-label host is either an apex
    # on a compound suffix (netcare.co.in) or a tenant on a simple one
    # (hospa.netcare.in). Empty in development, where "localhost" is unambiguous.
    root_domain: str = ""
    # "development" or "production". Governs the convenience affordances that are
    # safe on a laptop and unsafe on the internet: the X-Hospital-Id override on
    # pre-login requests, the default-tenant fallback, and the *.localhost CORS
    # regex. Set ENVIRONMENT=production before deploying.
    environment: str = "development"
    # Where uploaded registration documents are written, and the URL prefix they
    # are served back under. Local disk is a development affordance: it does not
    # survive a container restart and does not exist on a second instance, so a
    # real deployment points these at object storage. Everything above the
    # storage seam (app/storage.py) is written not to care which it is.
    upload_dir: str = "uploads"
    files_url_prefix: str = "/files"
    # The origin this API is reachable at, used only to turn the local backend's
    # `files_url_prefix`-relative path into a URL a browser can actually fetch.
    # The frontend runs on its own origin (a different port in dev, a different
    # subdomain in prod), so a bare "/files/..." resolves against *that* origin
    # and 404s — it has to be absolute. R2 already returns absolute URLs and
    # ignores this.
    api_public_url: str = "http://localhost:8000"
    # Which implementation of that seam is live: "local" or "r2".
    storage_backend: str = "local"
    # --- Cloudflare R2 (STORAGE_BACKEND=r2) ---
    # The account id is enough to derive the S3-compatible endpoint; R2_ENDPOINT
    # is the override for a jurisdiction-specific one.
    r2_account_id: str = ""
    r2_endpoint: str = ""
    r2_bucket: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    # Set ONLY for a bucket deliberately exposed on a public custom domain.
    # Leaving it empty keeps the bucket private and every outgoing link signed,
    # which is what a scan of a medical licence needs.
    r2_public_base_url: str = ""
    # How long a signed link stays good. Long enough to open a PDF, short enough
    # that a link pasted into a chat stops working before it matters.
    r2_signed_url_ttl_seconds: int = 900
    # Per-file ceiling. Registration scans are photographs of certificates; 10MB
    # is generous for one and small enough that a truncated read is cheap.
    max_upload_mb: int = 10
    # --- Razorpay payment gateway ---
    # Obtain from the Razorpay dashboard → Settings → API Keys. Test-mode keys
    # (prefix rzp_test_) work without real money and are safe in development.
    # Leave empty to disable the online-payment flow at runtime; cash payments
    # do not use these at all.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""

    # --- Email (password-reset and future notifications) ---
    # Uses Resend (https://resend.com) — free tier 3,000 emails/month.
    # Leave empty in development — the reset link is printed to the console.
    resend_api_key: str = ""
    resend_from: str = ""  # e.g. "NetCare <no-reply@yourdomain.com>"

    # Firebase service account credential for push notifications. Two ways to
    # supply it; the first one set wins:
    #   1. firebase_service_account_json — the whole JSON file as one value,
    #      either raw or base64-encoded. For hosts with no persistent,
    #      uploadable filesystem (Railway, Fly, most PaaS).
    #   2. firebase_service_account — path to the JSON file on disk, relative
    #      to the api/ directory. A local-dev convenience; the file must never
    #      be committed (.gitignore already covers it).
    # Leave both empty to disable push notifications (CI, unit tests, a fresh
    # checkout) — the API still starts normally.
    firebase_service_account_json: str = ""
    firebase_service_account: str = "firebase-service-account.json"

    # Bootstrap credentials for the platform superadmin, created on first boot.
    # The default password is a demo convenience and is refused in production —
    # set SUPERADMIN_PASSWORD (and ideally SUPERADMIN_EMAIL) before deploying.
    superadmin_email: str = "netcruxx@gmail.com"
    superadmin_password: str = "password123"
    # Cloudflare R2 object storage. When all three are set, storage.py uploads
    # to R2 instead of local disk. Leave empty in development.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "netcare-uploads"
    r2_public_url: str = ""  # Optional public bucket URL for serving files

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # .env values may have trailing whitespace (e.g. SMTP_PORT=587   ).
    # Strip every string field so int/bool coercion doesn't silently fail.
    @field_validator(
        "resend_api_key", "resend_from",
        "cors_origins", "root_domain", "environment", "api_public_url",
        mode="before",
    )
    @classmethod
    def _strip(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @field_validator("superadmin_email", mode="before")
    @classmethod
    def _normalise_superadmin_email(cls, v: object) -> object:
        return normalise_email(v) if isinstance(v, str) else v

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
