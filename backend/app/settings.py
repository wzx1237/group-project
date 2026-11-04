"""Settings, read from environment variables or backend/.env (see .env.example)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    app_base_url: str = "http://gradeflow.test:3000"
    cas_server_url: str = "https://shib.idm.umd.edu/shibboleth-idp/profile/cas"
    session_secret: str
    database_url: str = "postgresql://gradeflow:gradeflow@127.0.0.1:5432/gradeflow"
    session_idle_hours: int = 12
    session_max_days: int = 7

    @property
    def cas_service_url(self) -> str:
        return self.app_base_url.rstrip("/") + "/api/auth/callback"
