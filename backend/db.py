from __future__ import annotations

import json
import secrets
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

DEFAULT_PUBLIC_SITE_SETTINGS = {
    "enabled": True,
    "useOperatingHours": False,
    "startTime": "09:00",
    "endTime": "15:30",
    "timezone": "Asia/Seoul",
    "closedMessage": "가동 시간이 아니거나 관리자에 의해 일시 중지되었습니다. 교관 또는 조교에게 문의해 주세요.",
}


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
    ensure_default_app_meta(connection)


def ensure_default_app_meta(connection: sqlite3.Connection) -> None:
    ensure_meta_json(connection, "public_site_settings", DEFAULT_PUBLIC_SITE_SETTINGS)
    ensure_meta_json(connection, "emergency_contacts", [])
    ensure_meta_json(connection, "meals", [])


def ensure_meta_json(connection: sqlite3.Connection, key: str, default_value: Any) -> None:
    row = connection.execute("SELECT 1 FROM app_meta WHERE key = ?", (key,)).fetchone()
    if row:
        return
    set_json_meta(connection, key, default_value)


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
    set_json_meta(connection, "survey_summary", payload)


def get_summary(connection: sqlite3.Connection) -> dict[str, Any]:
    data = get_json_meta(connection, "survey_summary")
    if data is not None:
        return data
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


def get_public_site_settings(connection: sqlite3.Connection) -> dict[str, Any]:
    stored = get_json_meta(connection, "public_site_settings") or {}
    merged = dict(DEFAULT_PUBLIC_SITE_SETTINGS)
    merged.update(stored)
    return merged


def update_public_site_settings(connection: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, Any]:
    merged = get_public_site_settings(connection)
    merged.update(payload)
    set_json_meta(connection, "public_site_settings", merged)
    return merged


def get_emergency_contacts(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return normalize_contacts(get_json_meta(connection, "emergency_contacts") or [])


def save_emergency_contact(connection: sqlite3.Connection, payload: dict[str, Any]) -> list[dict[str, Any]]:
    contacts = get_emergency_contacts(connection)
    contact_id = payload.get("id") or generate_item_id("contact")
    updated = False

    for index, item in enumerate(contacts):
        if item["id"] == contact_id:
            contacts[index] = build_contact(payload, contact_id)
            updated = True
            break

    if not updated:
        contacts.append(build_contact(payload, contact_id))

    contacts = sorted(contacts, key=lambda item: (item.get("sortOrder", 9999), item.get("name", "")))
    set_json_meta(connection, "emergency_contacts", contacts)
    return contacts


def delete_emergency_contact(connection: sqlite3.Connection, contact_id: str) -> list[dict[str, Any]]:
    contacts = [item for item in get_emergency_contacts(connection) if item["id"] != contact_id]
    set_json_meta(connection, "emergency_contacts", contacts)
    return contacts


def get_meals(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    return normalize_meals(get_json_meta(connection, "meals") or [])


def save_meal(connection: sqlite3.Connection, payload: dict[str, Any]) -> list[dict[str, Any]]:
    meals = get_meals(connection)
    meal_id = payload.get("id") or generate_item_id("meal")
    updated = False

    for index, item in enumerate(meals):
        if item["id"] == meal_id:
            meals[index] = build_meal(payload, meal_id)
            updated = True
            break

    if not updated:
        meals.append(build_meal(payload, meal_id))

    meals = sorted(meals, key=lambda item: (item.get("date", ""), item.get("mealType", "")), reverse=True)
    set_json_meta(connection, "meals", meals)
    return meals


def delete_meal(connection: sqlite3.Connection, meal_id: str) -> list[dict[str, Any]]:
    meals = [item for item in get_meals(connection) if item["id"] != meal_id]
    set_json_meta(connection, "meals", meals)
    return meals


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
    lines = [
        "/* 관리자 백엔드에서 자동 생성됩니다. 직접 수정하지 마세요. */",
        "window.noticesData = [",
    ]

    for notice in notices:
        content = escape_template_string(notice["content"])
        lines.extend(
            [
                "  {",
                f"    date: {json.dumps(notice['date'], ensure_ascii=False)},",
                f"    title: {json.dumps(notice['title'], ensure_ascii=False)},",
                f"    content: `{content}`,",
                f"    isImportant: {'true' if notice['isImportant'] else 'false'},",
                "  },",
            ]
        )

    lines.append("];")
    write_js_file(target_path, lines)


def export_meals_js(meals: list[dict[str, Any]], target_path: Path) -> None:
    lines = [
        "/* 관리자 백엔드에서 자동 생성됩니다. 직접 수정하지 마세요. */",
        "window.mealsData = [",
    ]

    for meal in meals:
        menu_json = json.dumps(meal.get("menu", []), ensure_ascii=False)
        lines.extend(
            [
                "  {",
                f"    date: {json.dumps(meal['date'], ensure_ascii=False)},",
                f"    mealType: {json.dumps(meal['mealType'], ensure_ascii=False)},",
                f"    menu: {menu_json},",
                f"    note: {json.dumps(meal.get('note', ''), ensure_ascii=False)},",
                "  },",
            ]
        )

    lines.append("];")
    write_js_file(target_path, lines)


def export_emergency_contacts_js(contacts: list[dict[str, Any]], target_path: Path) -> None:
    lines = [
        "/* 관리자 백엔드에서 자동 생성됩니다. 직접 수정하지 마세요. */",
        "window.emergencyContactsData = [",
    ]

    for contact in contacts:
        lines.extend(
            [
                "  {",
                f"    name: {json.dumps(contact['name'], ensure_ascii=False)},",
                f"    role: {json.dumps(contact.get('role', ''), ensure_ascii=False)},",
                f"    phone: {json.dumps(contact.get('phone', ''), ensure_ascii=False)},",
                f"    note: {json.dumps(contact.get('note', ''), ensure_ascii=False)},",
                "  },",
            ]
        )

    lines.append("];")
    write_js_file(target_path, lines)


def export_public_state_js(site_settings: dict[str, Any], target_path: Path) -> None:
    lines = [
        "/* 관리자 백엔드에서 자동 생성됩니다. 직접 수정하지 마세요. */",
        f"window.publicSiteState = {json.dumps(site_settings, ensure_ascii=False, indent=2)};",
    ]
    write_js_file(target_path, lines)


def get_json_meta(connection: sqlite3.Connection, key: str) -> Any:
    row = connection.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    return json.loads(row["value"])


def set_json_meta(connection: sqlite3.Connection, key: str, value: Any) -> None:
    now = now_iso()
    connection.execute(
        """
        INSERT INTO app_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, json.dumps(value, ensure_ascii=False), now),
    )
    connection.commit()


def normalize_contacts(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        normalized.append(
            {
                "id": str(item.get("id") or generate_item_id("contact")),
                "name": str(item.get("name") or "").strip(),
                "role": str(item.get("role") or "").strip(),
                "phone": str(item.get("phone") or "").strip(),
                "note": str(item.get("note") or "").strip(),
                "sortOrder": int(item.get("sortOrder") or 0),
            }
        )
    return normalized


def normalize_meals(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized = []
    for item in items:
        menu = item.get("menu") or []
        normalized.append(
            {
                "id": str(item.get("id") or generate_item_id("meal")),
                "date": str(item.get("date") or "").strip(),
                "mealType": str(item.get("mealType") or "").strip(),
                "menu": [str(value).strip() for value in menu if str(value).strip()],
                "note": str(item.get("note") or "").strip(),
            }
        )
    return normalized


def build_contact(payload: dict[str, Any], contact_id: str) -> dict[str, Any]:
    return {
        "id": contact_id,
        "name": str(payload.get("name") or "").strip(),
        "role": str(payload.get("role") or "").strip(),
        "phone": str(payload.get("phone") or "").strip(),
        "note": str(payload.get("note") or "").strip(),
        "sortOrder": int(payload.get("sortOrder") or 0),
    }


def build_meal(payload: dict[str, Any], meal_id: str) -> dict[str, Any]:
    return {
        "id": meal_id,
        "date": str(payload.get("date") or "").strip(),
        "mealType": str(payload.get("mealType") or "").strip(),
        "menu": [str(value).strip() for value in (payload.get("menu") or []) if str(value).strip()],
        "note": str(payload.get("note") or "").strip(),
    }


def generate_item_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


def write_js_file(target_path: Path, lines: list[str]) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def escape_template_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("`", "\\`")
    return escaped.replace("${", "\\${")


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")
