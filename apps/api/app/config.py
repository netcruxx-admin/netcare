from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Per-file ceiling. Registration scans are photographs of certificates; 10MB
    # is generous for one and small enough that a truncated read is cheap.
    max_upload_mb: int = 10
    # Bootstrap credentials for the platform superadmin, created on first boot.
    # The default password is a demo convenience and is refused in production —
    # set SUPERADMIN_PASSWORD (and ideally SUPERADMIN_EMAIL) before deploying.
    superadmin_email: str = "netcruxx@gmail.com"
    superadmin_password: str = "password123"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
