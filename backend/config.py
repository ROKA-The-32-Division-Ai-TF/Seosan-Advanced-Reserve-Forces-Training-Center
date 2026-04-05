from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Settings:
    base_dir: Path
    repo_root: Path
    storage_dir: Path
    database_path: Path
    templates_dir: Path
    static_dir: Path
    session_secret: str
    ollama_api_url: str
    ollama_model: str
    notice_draft_model: str
    summary_sheet_csv_url: str
    public_notices_path: Path
    public_git_remote: str
    public_git_branch: str
    auto_publish_public_site: bool
    scheduler_enabled: bool


def load_settings() -> Settings:
    base_dir = Path(__file__).resolve().parent
    repo_root = base_dir.parent
    storage_dir = Path(os.getenv("ADMIN_STORAGE_DIR", base_dir / "storage")).resolve()

    return Settings(
        base_dir=base_dir,
        repo_root=repo_root,
        storage_dir=storage_dir,
        database_path=Path(os.getenv("ADMIN_DATABASE_PATH", storage_dir / "admin.sqlite3")).resolve(),
        templates_dir=base_dir / "templates",
        static_dir=base_dir / "static",
        session_secret=os.getenv("ADMIN_SESSION_SECRET", "change-this-session-secret"),
        ollama_api_url=os.getenv("OLLAMA_API_URL", "http://127.0.0.1:11434/api/chat").strip(),
        ollama_model=os.getenv("OLLAMA_MODEL", "").strip(),
        notice_draft_model=os.getenv("NOTICE_DRAFT_MODEL", "").strip(),
        summary_sheet_csv_url=os.getenv("GOOGLE_SHEETS_CSV_URL", "").strip(),
        public_notices_path=Path(
            os.getenv("PUBLIC_NOTICES_PATH", repo_root / "data" / "notices.js")
        ).resolve(),
        public_git_remote=os.getenv("PUBLIC_GIT_REMOTE", "origin").strip() or "origin",
        public_git_branch=os.getenv("PUBLIC_GIT_BRANCH", "main").strip() or "main",
        auto_publish_public_site=os.getenv("AUTO_PUBLISH_PUBLIC_SITE", "0").strip() == "1",
        scheduler_enabled=os.getenv("ENABLE_SUMMARY_SCHEDULER", "1").strip() != "0",
    )
