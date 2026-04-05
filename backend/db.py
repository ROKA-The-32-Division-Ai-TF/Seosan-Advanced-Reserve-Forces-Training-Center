from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Optional


FIXED_NOTICE_CONTENT = """1️⃣ 복장 및 군기 준수 안내

훈련 간 복장 착용 기준을 준수해 주시기 바랍니다.
단정한 복장과 기본적인 군기를 유지하는 것은 원활한 훈련 진행과 안전 확보를 위한 사항입니다.
모든 훈련은 질서 있는 분위기 속에서 진행될 수 있도록 협조 부탁드립니다.

2️⃣ 훈련 참여 태도 안내

훈련은 실제 상황을 대비한 중요한 과정입니다.
적극적인 참여와 성실한 태도는 본인의 안전과 전우의 안전을 지키는 데 큰 도움이 됩니다.
훈련 간 지시에 따라 적극적으로 임해주시기 바랍니다.

3️⃣ 가점 요소 안내 (우수 참여자)

훈련 간 적극적으로 참여하거나 모범적인 태도를 보이는 인원에 대해서는 가점이 부여될 수 있습니다.

예시:
- 군가 제창 적극 참여
- 제식 및 단체 행동 우수
- 훈련 몰입도 및 태도 우수

※ 가점 기준은 훈련 진행 간 종합적으로 판단됩니다.

4️⃣ 이동 및 대열 유지 안내

훈련 간 이동 시에는 대열을 유지하고 통제에 따라 이동해 주시기 바랍니다.
안전사고 예방과 원활한 진행을 위해 반드시 협조해 주시기 바랍니다."""


def connect(database_path: Path) -> sqlite3.Connection:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            notice_date TEXT NOT NULL,
            is_important INTEGER NOT NULL DEFAULT 0,
            is_published INTEGER NOT NULL DEFAULT 1,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """
    )
    connection.commit()


def has_any_admin(connection: sqlite3.Connection) -> bool:
    row = connection.execute("SELECT COUNT(*) AS count FROM admins").fetchone()
    return bool(row and row["count"] > 0)


def create_admin(
    connection: sqlite3.Connection,
    *,
    username: str,
    display_name: str,
    password_hash: str,
) -> None:
    now = now_iso()
    connection.execute(
        """
        INSERT INTO admins (username, display_name, password_hash, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (username, display_name, password_hash, now),
    )
    connection.commit()


def find_admin_by_username(connection: sqlite3.Connection, username: str) -> Optional[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM admins WHERE username = ?",
        (username,),
    ).fetchone()


def find_admin_by_id(connection: sqlite3.Connection, admin_id: int) -> Optional[sqlite3.Row]:
    return connection.execute(
        "SELECT * FROM admins WHERE id = ?",
        (admin_id,),
    ).fetchone()


def list_admins(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT id, username, display_name, created_at FROM admins ORDER BY username ASC"
    ).fetchall()
    return [dict(row) for row in rows]


def upsert_summary(connection: sqlite3.Connection, payload: dict[str, Any]) -> None:
    now = now_iso()
    connection.execute(
        """
        INSERT INTO app_meta (key, value, updated_at)
        VALUES ('survey_summary', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (json.dumps(payload, ensure_ascii=False), now),
    )
    connection.commit()


def get_summary(connection: sqlite3.Connection) -> dict[str, Any]:
    row = connection.execute(
        "SELECT value FROM app_meta WHERE key = 'survey_summary'"
    ).fetchone()
    if not row:
        return {
            "status": "pending",
            "title": "서산시 과학화 예비군 훈련장 설문 요약",
            "generatedAt": None,
            "message": "아직 생성된 설문 요약이 없습니다.",
            "source": {
                "totalResponses": 0,
                "analyzedResponses": 0,
                "latestResponseAt": "",
                "includedColumns": [],
                "excludedColumns": [],
            },
            "summaryMarkdown": "## 대기 중\n- 아직 생성된 설문 요약이 없습니다.",
        }
    return json.loads(row["value"])


def create_notice(
    connection: sqlite3.Connection,
    *,
    title: str,
    content: str,
    notice_date: str,
    is_important: bool,
    is_published: bool,
    created_by: str,
) -> int:
    now = now_iso()
    cursor = connection.execute(
        """
        INSERT INTO notices (
            title, content, notice_date, is_important, is_published, created_by, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            title,
            content,
            notice_date,
            int(is_important),
            int(is_published),
            created_by,
            now,
            now,
        ),
    )
    connection.commit()
    return int(cursor.lastrowid)


def update_notice(
    connection: sqlite3.Connection,
    *,
    notice_id: int,
    title: str,
    content: str,
    notice_date: str,
    is_important: bool,
    is_published: bool,
) -> None:
    connection.execute(
        """
        UPDATE notices
        SET title = ?, content = ?, notice_date = ?, is_important = ?, is_published = ?, updated_at = ?
        WHERE id = ?
        """,
        (title, content, notice_date, int(is_important), int(is_published), now_iso(), notice_id),
    )
    connection.commit()


def delete_notice(connection: sqlite3.Connection, notice_id: int) -> None:
    connection.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
    connection.commit()


def list_notices(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT id, title, content, notice_date, is_important, is_published, created_by, created_at, updated_at
        FROM notices
        ORDER BY notice_date DESC, updated_at DESC, id DESC
        """
    ).fetchall()
    return [serialize_notice_row(row) for row in rows]


def list_published_notices(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        """
        SELECT id, title, content, notice_date, is_important, is_published, created_by, created_at, updated_at
        FROM notices
        WHERE is_published = 1
        ORDER BY notice_date DESC, updated_at DESC, id DESC
        """
    ).fetchall()
    return [serialize_notice_row(row) for row in rows]


def ensure_default_notice_seed(connection: sqlite3.Connection) -> None:
    row = connection.execute("SELECT COUNT(*) AS count FROM notices").fetchone()
    if row and row["count"] > 0:
        return

    create_notice(
        connection,
        title="📢 예비군 훈련 고정 공지사항",
        content=FIXED_NOTICE_CONTENT,
        notice_date="2026-03-27",
        is_important=True,
        is_published=True,
        created_by="system",
    )


def serialize_notice_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "title": row["title"],
        "content": row["content"],
        "date": row["notice_date"],
        "isImportant": bool(row["is_important"]),
        "isPublished": bool(row["is_published"]),
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def export_notice_js(notices: list[dict[str, Any]], target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "/* 관리자 백엔드에서 자동 생성됩니다. 직접 수정하지 마세요. */",
        "window.noticesData = [",
    ]

    for notice in notices:
        content = escape_template_string(notice["content"])
        title = json.dumps(notice["title"], ensure_ascii=False)
        date = json.dumps(notice["date"], ensure_ascii=False)
        important = "true" if notice["isImportant"] else "false"
        lines.extend(
            [
                "  {",
                f"    date: {date},",
                f"    title: {title},",
                f"    content: `{content}`,",
                f"    isImportant: {important},",
                "  },",
            ]
        )

    lines.append("];")
    lines.append("")
    target_path.write_text("\n".join(lines), encoding="utf-8")


def escape_template_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("`", "\\`")
    return escaped.replace("${", "\\${")


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
