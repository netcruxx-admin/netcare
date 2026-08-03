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
    # Tenant used before login when the request host carries no known subdomain
    # (e.g. the FE talking to the API on bare localhost). Mirrors the frontend's
    # DEFAULT_HOSPITAL_ID in lib/tenant.ts. Development only — in production an
    # unrecognised host resolves to no tenant rather than silently to this one.
    default_hospital_id: str = "hosp-1"
    # "development" or "production". Governs the convenience affordances that are
    # safe on a laptop and unsafe on the internet: the X-Hospital-Id override on
    # pre-login requests, the default-tenant fallback, and the *.localhost CORS
    # regex. Set ENVIRONMENT=production before deploying.
    environment: str = "development"
    # Bootstrap credentials for the platform superadmin, created on first boot.
    # The default password is a demo convenience and is refused in production —
    # set SUPERADMIN_PASSWORD (and ideally SUPERADMIN_EMAIL) before deploying.
    superadmin_email: str = "superadmin@platform.com"
    superadmin_password: str = "password123"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
