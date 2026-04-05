from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from typing import Any, Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from .config import Settings, load_settings
from .db import (
    connect,
    create_admin,
    delete_emergency_contact,
    delete_meal,
    create_notice,
    delete_notice,
    ensure_default_notice_seed,
    export_emergency_contacts_js,
    export_meals_js,
    export_notice_js,
    export_public_state_js,
    find_admin_by_id,
    find_admin_by_username,
    get_emergency_contacts,
    get_meals,
    get_public_site_settings,
    get_summary,
    has_any_admin,
    initialize_database,
    list_admins,
    list_notices,
    list_published_notices,
    save_emergency_contact,
    save_meal,
    update_public_site_settings,
    update_notice,
    upsert_summary,
)
from .security import hash_password, verify_password
from .services import create_notice_draft, generate_survey_summary, maybe_publish_public_site
from .services import summary_payload


class LoginPayload(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class SetupPayload(LoginPayload):
    display_name: str = Field(min_length=2, max_length=64)


class NoticePayload(BaseModel):
    id: Optional[int] = None
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=5, max_length=5000)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    isImportant: bool = False
    isPublished: bool = True


class NoticeDraftPayload(BaseModel):
    instruction: str = Field(min_length=5, max_length=4000)


class SiteSettingsPayload(BaseModel):
    enabled: bool = True
    useOperatingHours: bool = False
    startTime: str = Field(pattern=r"^\d{2}:\d{2}$")
    endTime: str = Field(pattern=r"^\d{2}:\d{2}$")
    closedMessage: str = Field(min_length=5, max_length=300)


class EmergencyContactPayload(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=2, max_length=80)
    role: str = Field(max_length=80, default="")
    phone: str = Field(min_length=5, max_length=40)
    note: str = Field(max_length=200, default="")
    sortOrder: int = Field(default=0, ge=0, le=9999)


class MealPayload(BaseModel):
    id: Optional[str] = None
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    mealType: str = Field(min_length=2, max_length=40)
    menu: list[str] = Field(default_factory=list)
    note: str = Field(max_length=200, default="")


settings = load_settings()
app = FastAPI(title="Reserve Admin Backend")
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.session_secret,
    same_site="lax",
    https_only=False,
)
app.mount("/static", StaticFiles(directory=settings.static_dir), name="static")
templates = Jinja2Templates(directory=str(settings.templates_dir))
scheduler: Optional[BackgroundScheduler] = None


@contextmanager
def db_connection() -> sqlite3.Connection:
    connection = connect(settings.database_path)
    try:
        yield connection
    finally:
        connection.close()


@app.on_event("startup")
def startup() -> None:
    global scheduler

    with db_connection() as connection:
        initialize_database(connection)
        ensure_default_notice_seed(connection)
        sync_public_files(connection)

    if settings.scheduler_enabled and scheduler is None:
        scheduler = BackgroundScheduler(timezone="Asia/Seoul")
        scheduler.add_job(
            run_summary_job,
            CronTrigger(hour=15, minute=30, timezone="Asia/Seoul"),
            id="daily_summary_job",
            replace_existing=True,
        )
        scheduler.start()


@app.on_event("shutdown")
def shutdown() -> None:
    global scheduler
    if scheduler:
        scheduler.shutdown(wait=False)
        scheduler = None


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/admin/login", status_code=302)


@app.get("/health", response_class=JSONResponse)
def health() -> dict[str, Any]:
    return {"ok": True}


@app.get("/admin/login", response_class=HTMLResponse)
def login_page(request: Request) -> HTMLResponse:
    user = get_current_user(request)
    if user:
        return RedirectResponse(url="/admin", status_code=302)

    with db_connection() as connection:
        setup_required = not has_any_admin(connection)

    return templates.TemplateResponse(
        "login.html",
        {
            "request": request,
            "setup_required": setup_required,
        },
    )


@app.get("/admin", response_class=HTMLResponse)
def dashboard_page(request: Request) -> HTMLResponse:
    user = require_user(request)
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user,
            "auto_publish_enabled": settings.auto_publish_public_site,
        },
    )


@app.post("/api/auth/setup", response_class=JSONResponse)
def setup_admin(payload: SetupPayload, request: Request) -> dict[str, Any]:
    with db_connection() as connection:
        if has_any_admin(connection):
            raise HTTPException(status_code=400, detail="초기 관리자 설정은 이미 완료되었습니다.")

        create_admin(
            connection,
            username=payload.username.strip(),
            display_name=payload.display_name.strip(),
            password_hash=hash_password(payload.password),
        )
        admin = find_admin_by_username(connection, payload.username.strip())

    request.session["admin_id"] = int(admin["id"])
    return {"ok": True}


@app.post("/api/auth/login", response_class=JSONResponse)
def login(payload: LoginPayload, request: Request) -> dict[str, Any]:
    with db_connection() as connection:
        admin = find_admin_by_username(connection, payload.username.strip())
        if not admin or not verify_password(payload.password, admin["password_hash"]):
            raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

        request.session["admin_id"] = int(admin["id"])
        return {"ok": True, "displayName": admin["display_name"]}


@app.post("/api/auth/logout", response_class=JSONResponse)
def logout(request: Request) -> dict[str, Any]:
    request.session.clear()
    return {"ok": True}


@app.get("/api/admin/bootstrap", response_class=JSONResponse)
def bootstrap(request: Request) -> dict[str, Any]:
    user = require_user(request)
    with db_connection() as connection:
        return {
            "user": user,
            "summary": get_summary(connection),
            "notices": list_notices(connection),
            "meals": get_meals(connection),
            "emergencyContacts": get_emergency_contacts(connection),
            "publicSettings": get_public_site_settings(connection),
            "admins": list_admins(connection),
            "settings": {
                "autoPublishPublicSite": settings.auto_publish_public_site,
            },
        }


@app.post("/api/admin/users", response_class=JSONResponse)
def create_admin_account(payload: SetupPayload, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        if find_admin_by_username(connection, payload.username.strip()):
            raise HTTPException(status_code=400, detail="이미 사용 중인 관리자 아이디입니다.")
        create_admin(
            connection,
            username=payload.username.strip(),
            display_name=payload.display_name.strip(),
            password_hash=hash_password(payload.password),
        )
        return {"ok": True, "admins": list_admins(connection)}


@app.post("/api/admin/notices/draft", response_class=JSONResponse)
def draft_notice(payload: NoticeDraftPayload, request: Request) -> dict[str, Any]:
    require_user(request)
    draft = create_notice_draft(settings, payload.instruction)
    return {"ok": True, "draft": draft}


@app.post("/api/admin/notices", response_class=JSONResponse)
def save_notice(payload: NoticePayload, request: Request) -> dict[str, Any]:
    user = require_user(request)
    with db_connection() as connection:
        if payload.id:
            update_notice(
                connection,
                notice_id=payload.id,
                title=payload.title.strip(),
                content=payload.content.strip(),
                notice_date=payload.date,
                is_important=payload.isImportant,
                is_published=payload.isPublished,
            )
        else:
            create_notice(
                connection,
                title=payload.title.strip(),
                content=payload.content.strip(),
                notice_date=payload.date,
                is_important=payload.isImportant,
                is_published=payload.isPublished,
                created_by=user["username"],
            )

        changed_paths = sync_public_files(connection, ["notices"])
        publish_result = maybe_publish_public_site(settings, changed_paths)
        notices = list_notices(connection)

    return {
        "ok": True,
        "message": "공지사항이 저장되었습니다.",
        "notices": notices,
        "publish": publish_result,
    }


@app.delete("/api/admin/notices/{notice_id}", response_class=JSONResponse)
def remove_notice(notice_id: int, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        delete_notice(connection, notice_id)
        changed_paths = sync_public_files(connection, ["notices"])
        publish_result = maybe_publish_public_site(settings, changed_paths)
        notices = list_notices(connection)

    return {"ok": True, "notices": notices, "publish": publish_result}


@app.post("/api/admin/public-settings", response_class=JSONResponse)
def save_public_settings(payload: SiteSettingsPayload, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        public_settings = update_public_site_settings(connection, payload.model_dump())
        changed_paths = sync_public_files(connection, ["public_settings"])
        publish_result = maybe_publish_public_site(settings, changed_paths)

    return {
        "ok": True,
        "message": "공개 사이트 운영 설정을 저장했습니다.",
        "publicSettings": public_settings,
        "publish": publish_result,
    }


@app.post("/api/admin/contacts", response_class=JSONResponse)
def save_contact(payload: EmergencyContactPayload, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        contacts = save_emergency_contact(connection, payload.model_dump())
        changed_paths = sync_public_files(connection, ["contacts"])
        publish_result = maybe_publish_public_site(settings, changed_paths)

    return {
        "ok": True,
        "message": "비상연락망을 저장했습니다.",
        "emergencyContacts": contacts,
        "publish": publish_result,
    }


@app.delete("/api/admin/contacts/{contact_id}", response_class=JSONResponse)
def remove_contact(contact_id: str, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        contacts = delete_emergency_contact(connection, contact_id)
        changed_paths = sync_public_files(connection, ["contacts"])
        publish_result = maybe_publish_public_site(settings, changed_paths)

    return {"ok": True, "emergencyContacts": contacts, "publish": publish_result}


@app.post("/api/admin/meals", response_class=JSONResponse)
def save_public_meal(payload: MealPayload, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        meals = save_meal(connection, payload.model_dump())
        changed_paths = sync_public_files(connection, ["meals"])
        publish_result = maybe_publish_public_site(settings, changed_paths)

    return {
        "ok": True,
        "message": "식사표를 저장했습니다.",
        "meals": meals,
        "publish": publish_result,
    }


@app.delete("/api/admin/meals/{meal_id}", response_class=JSONResponse)
def remove_meal(meal_id: str, request: Request) -> dict[str, Any]:
    require_user(request)
    with db_connection() as connection:
        meals = delete_meal(connection, meal_id)
        changed_paths = sync_public_files(connection, ["meals"])
        publish_result = maybe_publish_public_site(settings, changed_paths)

    return {"ok": True, "meals": meals, "publish": publish_result}


@app.post("/api/admin/summary/run", response_class=JSONResponse)
def run_summary(request: Request) -> dict[str, Any]:
    require_user(request)
    return run_summary_job()


def run_summary_job() -> dict[str, Any]:
    try:
        payload = generate_survey_summary(settings)
    except Exception as exc:
        payload = summary_payload(
            status="error",
            message=str(exc),
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=[],
            excluded_columns=[],
            summary_markdown=f"## 오류\n- {exc}",
        )
    with db_connection() as connection:
        upsert_summary(connection, payload)
    return {"ok": True, "summary": payload}


def sync_public_files(connection: sqlite3.Connection, changed_keys: Optional[list[str]] = None) -> list[Any]:
    changed = set(changed_keys or ["notices", "meals", "contacts", "public_settings"])
    touched_paths = []

    if "notices" in changed:
        export_notice_js(list_published_notices(connection), settings.public_notices_path)
        touched_paths.append(settings.public_notices_path)

    if "meals" in changed:
        export_meals_js(get_meals(connection), settings.public_meals_path)
        touched_paths.append(settings.public_meals_path)

    if "contacts" in changed:
        export_emergency_contacts_js(get_emergency_contacts(connection), settings.public_contacts_path)
        touched_paths.append(settings.public_contacts_path)

    if "public_settings" in changed:
        export_public_state_js(get_public_site_settings(connection), settings.public_state_path)
        touched_paths.append(settings.public_state_path)

    return touched_paths


def get_current_user(request: Request) -> Optional[dict[str, Any]]:
    admin_id = request.session.get("admin_id")
    if not admin_id:
        return None

    with db_connection() as connection:
        admin = find_admin_by_id(connection, int(admin_id))
        if not admin:
            request.session.clear()
            return None
        return {
            "id": int(admin["id"]),
            "username": admin["username"],
            "displayName": admin["display_name"],
        }


def require_user(request: Request) -> dict[str, Any]:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user
