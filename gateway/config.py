from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    influxdb_url: str = "http://localhost:8086"
    influxdb_token: str = ""
    influxdb_org: str = "home_lab"
    influxdb_bucket: str = "fm_simulation"

    ble_device_name: str = "Thunder Sense"  # substring match, case-insensitive
    ble_device_address: str = ""             # optional, e.g. "XX:XX:XX:XX:XX:XX"; takes priority over name
    ble_scan_timeout: int = 10
    ble_retry_interval: int = 5
    ble_sample_interval: float = 2.0         # seconds between sensor reads

    node_id: str = "TBS2_001"
    asset_id: str = "PC_CASE_001"

    llm_provider: str = "claude"
    anthropic_api_key: str = ""
    gemma_api_url: str = "http://localhost:11434/api/generate"

    # Ollama (Stage 3 conversational diagnostics agent)
    ollama_base_url: str = "http://desktop-3dvru40:11434/v1"
    ollama_model: str = "llama3.1:8b"

    # IANA tz name for converting Influx UTC timestamps to wall-clock time
    # in chat tool results, so the LLM and frontend charts agree.
    local_tz: str = "Asia/Ho_Chi_Minh"

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
