from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Postgres for dev and prod. Local Homebrew Postgres uses trust auth, so no
    # password is needed for the default DSN.
    database_url: str = "postgresql+psycopg://localhost:5432/medicare"
    jwt_secret: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    cors_origins: str = "http://localhost:3000"
    # Tenant used before login when the request host carries no known subdomain
    # (e.g. the FE talking to the API on bare localhost). Mirrors the frontend's
    # DEFAULT_HOSPITAL_ID in lib/tenant.ts.
    default_hospital_id: str = "hosp-1"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
