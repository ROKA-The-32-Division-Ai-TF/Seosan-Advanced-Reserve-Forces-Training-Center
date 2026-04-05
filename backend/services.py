from __future__ import annotations

import csv
import json
import re
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional
from urllib import error, parse, request

from .config import Settings


KST = timezone(timedelta(hours=9))
MAX_ANALYSIS_ROWS = 120
MAX_FIELD_LENGTH = 240
MAX_PROMPT_LENGTH = 20000

SENSITIVE_KEYWORDS = (
    "name",
    "email",
    "phone",
    "mobile",
    "contact",
    "address",
    "birth",
    "resident",
    "id",
    "이름",
    "성명",
    "연락처",
    "전화",
    "휴대폰",
    "이메일",
    "주소",
    "생년",
    "주민",
    "소속",
    "군번",
)

TIMESTAMP_KEYWORDS = (
    "timestamp",
    "time",
    "date",
    "일시",
    "날짜",
    "응답 시간",
    "제출 시간",
)

SUMMARY_SYSTEM_PROMPT = """너는 대한민국 예비군 훈련 설문 결과를 요약하는 분석 보조관이다.
주어진 응답만 근거로 간결하게 정리한다.
개인정보를 추정하거나 새 사실을 지어내지 않는다.
출력은 반드시 한국어 Markdown으로 작성한다.

형식:
## 핵심 요약
- 2~4개

## 자주 언급된 내용
- 반복 의견

## 우려 사항
- 혼선, 불만, 개선 필요 요소

## 조치 제안
- 운영자가 바로 참고할 수 있는 짧은 제안

## 대표 의견
- 익명화된 표현으로 2~4개
"""

NOTICE_SYSTEM_PROMPT = """너는 대한민국 예비군 훈련장 관리자 공지 작성 보조관이다.
입력된 지시를 바탕으로 군 조직에 맞는 단정한 공지 초안을 작성한다.
과장하지 말고, 정확하고 간결하게 쓴다.
반드시 JSON 객체만 출력한다.
형식:
{
  "title": "공지 제목",
  "content": "공지 본문",
  "isImportant": true
}
"""


def normalize_sheet_url(raw_url: str) -> str:
    if not raw_url:
        return ""

    if "export?format=csv" in raw_url or "output=csv" in raw_url:
        return raw_url

    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", raw_url)
    if not match:
        return raw_url

    parsed = parse.urlparse(raw_url)
    query = parse.parse_qs(parsed.query)
    gid = query.get("gid", ["0"])[0]
    sheet_id = match.group(1)
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"


def generate_survey_summary(settings: Settings) -> dict[str, Any]:
    sheet_url = normalize_sheet_url(settings.summary_sheet_csv_url)

    if not sheet_url:
        return summary_payload(
            status="pending",
            message="GOOGLE_SHEETS_CSV_URL이 설정되지 않았습니다.",
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=[],
            excluded_columns=[],
            summary_markdown=(
                "## 설정 필요\n"
                "- 백엔드 환경 변수 `GOOGLE_SHEETS_CSV_URL`을 설정해 주세요."
            ),
        )

    headers, rows = fetch_csv_rows(sheet_url)
    included_columns = [header for header in headers if should_include_header(header)]
    excluded_columns = [header for header in headers if header not in included_columns]
    total_responses = len(rows)
    latest_response_at = extract_latest_response_at(rows, headers)

    if total_responses == 0:
        return summary_payload(
            status="pending",
            message="아직 수집된 설문 응답이 없습니다.",
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=included_columns,
            excluded_columns=excluded_columns,
            summary_markdown="## 대기 중\n- 아직 수집된 설문 응답이 없습니다.",
        )

    if not settings.ollama_model:
        return summary_payload(
            status="error",
            message="OLLAMA_MODEL이 설정되지 않았습니다.",
            total_responses=total_responses,
            analyzed_responses=min(total_responses, MAX_ANALYSIS_ROWS),
            latest_response_at=latest_response_at,
            included_columns=included_columns,
            excluded_columns=excluded_columns,
            summary_markdown=(
                "## 설정 필요\n"
                "- 백엔드 환경 변수 `OLLAMA_MODEL`을 설정해 주세요."
            ),
        )

    rows_for_analysis = rows[-MAX_ANALYSIS_ROWS:]
    prompt = build_summary_prompt(rows_for_analysis, included_columns, total_responses)
    summary_markdown = request_ollama_markdown(
        api_url=settings.ollama_api_url,
        model=settings.ollama_model,
        system_prompt=SUMMARY_SYSTEM_PROMPT,
        user_prompt=prompt,
    )

    return summary_payload(
        status="ok",
        message="자동 설문 요약이 최신 상태로 갱신되었습니다.",
        total_responses=total_responses,
        analyzed_responses=min(total_responses, MAX_ANALYSIS_ROWS),
        latest_response_at=latest_response_at,
        included_columns=included_columns,
        excluded_columns=excluded_columns,
        summary_markdown=summary_markdown,
    )


def create_notice_draft(settings: Settings, instruction: str) -> dict[str, Any]:
    model = settings.notice_draft_model or settings.ollama_model
    if not model:
        raise RuntimeError("NOTICE_DRAFT_MODEL 또는 OLLAMA_MODEL 설정이 필요합니다.")

    payload = {
        "model": model,
        "stream": False,
        "format": "json",
        "messages": [
            {"role": "system", "content": NOTICE_SYSTEM_PROMPT},
            {"role": "user", "content": instruction.strip()},
        ],
        "options": {"temperature": 0.2},
    }
    response_json = post_json(settings.ollama_api_url, payload)
    content = ((response_json.get("message") or {}).get("content") or "").strip()
    if not content:
        raise RuntimeError("AI 초안 응답이 비어 있습니다.")

    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise RuntimeError("AI 초안 결과를 JSON으로 해석하지 못했습니다.") from exc

    title = str(parsed.get("title") or "공지 초안").strip()
    body = str(parsed.get("content") or "").strip()
    is_important = bool(parsed.get("isImportant"))
    if not body:
        raise RuntimeError("AI 초안 본문이 비어 있습니다.")

    return {
        "title": title,
        "content": body,
        "isImportant": is_important,
        "date": datetime.now(tz=KST).strftime("%Y-%m-%d"),
    }


def maybe_publish_public_site(settings: Settings, changed_files: list[Path]) -> dict[str, Any]:
    if not settings.auto_publish_public_site:
        return {"enabled": False, "published": False, "message": "자동 Git 푸시는 비활성화 상태입니다."}

    relative_files = [str(path.relative_to(settings.repo_root)) for path in changed_files]
    try:
        subprocess.run(
            ["git", "add", *relative_files],
            cwd=settings.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )

        status = subprocess.run(
            ["git", "diff", "--cached", "--quiet", "--", *relative_files],
            cwd=settings.repo_root,
            check=False,
            capture_output=True,
            text=True,
        )
        if status.returncode == 0:
            return {"enabled": True, "published": False, "message": "게시할 변경 사항이 없습니다."}

        subprocess.run(
            ["git", "commit", "-m", "Update notices from admin backend"],
            cwd=settings.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        subprocess.run(
            ["git", "push", settings.public_git_remote, settings.public_git_branch],
            cwd=settings.repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
        return {"enabled": True, "published": True, "message": "공개 사이트 변경 사항을 GitHub로 푸시했습니다."}
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else "Git publish failed."
        return {"enabled": True, "published": False, "message": stderr}


def summary_payload(
    *,
    status: str,
    message: str,
    total_responses: int,
    analyzed_responses: int,
    latest_response_at: str,
    included_columns: list[str],
    excluded_columns: list[str],
    summary_markdown: str,
) -> dict[str, Any]:
    return {
        "status": status,
        "title": "서산시 과학화 예비군 훈련장 설문 요약",
        "generatedAt": datetime.now(tz=KST).isoformat(timespec="seconds"),
        "message": message,
        "source": {
            "totalResponses": total_responses,
            "analyzedResponses": analyzed_responses,
            "latestResponseAt": latest_response_at,
            "includedColumns": included_columns,
            "excludedColumns": excluded_columns,
        },
        "summaryMarkdown": summary_markdown,
    }


def fetch_csv_rows(url: str) -> tuple[list[str], list[dict[str, str]]]:
    req = request.Request(url, headers={"User-Agent": "reserve-admin/1.0"})

    try:
        with request.urlopen(req, timeout=30) as response:
            charset = response.headers.get_content_charset("utf-8")
            text = response.read().decode(charset, errors="replace")
    except error.URLError as exc:
        raise RuntimeError(f"설문 CSV를 불러오지 못했습니다: {exc}") from exc

    reader = csv.DictReader(text.splitlines())
    headers = [normalize_header(name) for name in (reader.fieldnames or []) if normalize_header(name)]
    rows: list[dict[str, str]] = []

    for row in reader:
        cleaned = {}
        for key, value in row.items():
            normalized_key = normalize_header(key)
            if not normalized_key:
                continue
            cleaned[normalized_key] = normalize_value(value)
        if any(cleaned.values()):
            rows.append(cleaned)

    return headers, rows


def normalize_header(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_value(value: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def should_include_header(header: str) -> bool:
    lowered = header.lower()
    if any(keyword in lowered for keyword in SENSITIVE_KEYWORDS):
        return False
    if any(keyword in lowered for keyword in TIMESTAMP_KEYWORDS):
        return False
    return True


def extract_latest_response_at(rows: list[dict[str, str]], headers: list[str]) -> str:
    timestamp_headers = [
        header for header in headers if any(keyword in header.lower() for keyword in TIMESTAMP_KEYWORDS)
    ]
    if not rows or not timestamp_headers:
        return ""

    latest_row = rows[-1]
    for header in timestamp_headers:
        value = latest_row.get(header, "").strip()
        if value:
            return value
    return ""


def build_summary_prompt(rows: list[dict[str, str]], included_columns: list[str], total_responses: int) -> str:
    blocks: list[str] = []
    current_length = 0

    for index, row in enumerate(reversed(rows), start=1):
        lines = [f"[최근 응답 {index}]"]
        for header in included_columns:
            value = row.get(header, "")
            if not value:
                continue
            if len(value) > MAX_FIELD_LENGTH:
                value = f"{value[:MAX_FIELD_LENGTH]}..."
            lines.append(f"- {header}: {value}")

        if len(lines) == 1:
            continue

        block = "\n".join(lines)
        if current_length + len(block) > MAX_PROMPT_LENGTH:
            break
        blocks.append(block)
        current_length += len(block)

    included_text = ", ".join(included_columns) if included_columns else "분석 가능한 질문 없음"
    rows_text = "\n\n".join(blocks) if blocks else "[응답 데이터 없음]"
    return (
        f"전체 응답 수: {total_responses}\n"
        f"이번 요약에 반영된 질문: {included_text}\n"
        f"아래는 최근 응답 일부입니다.\n\n"
        f"{rows_text}"
    )


def request_ollama_markdown(*, api_url: str, model: str, system_prompt: str, user_prompt: str) -> str:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "options": {"temperature": 0.2},
    }
    data = post_json(api_url, payload)
    content = ((data.get("message") or {}).get("content") or "").strip()
    if not content:
        raise RuntimeError("Ollama 응답에 본문이 없습니다.")
    return content


def post_json(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    req = request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.URLError as exc:
        raise RuntimeError(f"Ollama 요청에 실패했습니다: {exc}") from exc
