#!/usr/bin/env python3
"""Google Sheets responses -> Ollama summary generator."""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import error, parse, request


KST = timezone(timedelta(hours=9))
DEFAULT_OUTPUT_PATH = "data/survey-summary.json"
DEFAULT_API_URL = "http://127.0.0.1:11434/api/chat"
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

SYSTEM_PROMPT = """너는 대한민국 예비군 훈련 설문 결과를 요약하는 분석 보조관이다.
주어진 응답만 근거로 간결하게 정리한다.
개인정보를 추정하거나 새 사실을 지어내지 않는다.
출력은 반드시 한국어 Markdown으로 작성한다.
형식은 아래를 따른다.

## 핵심 요약
- 핵심 2~4개

## 자주 언급된 내용
- 반복적으로 나온 의견

## 우려 사항
- 불만, 혼선, 개선 필요 요소

## 조치 제안
- 운영자가 바로 참고할 수 있는 짧은 제안

## 대표 의견
- 응답 내용을 바탕으로 익명화된 표현으로 2~4개
"""


def main() -> int:
    output_path = Path(os.getenv("SUMMARY_OUTPUT_PATH", DEFAULT_OUTPUT_PATH))
    sheet_url = normalize_sheet_url(os.getenv("GOOGLE_SHEETS_CSV_URL", "").strip())
    ollama_api_url = os.getenv("OLLAMA_API_URL", DEFAULT_API_URL).strip() or DEFAULT_API_URL
    ollama_model = os.getenv("OLLAMA_MODEL", "").strip()
    title = os.getenv("SUMMARY_TITLE", "서산시 과학화 예비군 훈련장 설문 요약").strip()

    if not sheet_url:
        payload = build_output(
            status="pending",
            title=title,
            message="GOOGLE_SHEETS_CSV_URL 설정이 없어 자동 요약을 생성하지 못했습니다.",
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=[],
            excluded_columns=[],
            summary_markdown=(
                "## 설정 필요\n"
                "- 저장소 Secret 또는 self-hosted runner 환경 변수 `GOOGLE_SHEETS_CSV_URL`을 설정해 주세요.\n"
                "- Google Sheets 응답 시트는 CSV로 읽을 수 있는 주소여야 합니다."
            ),
        )
        write_output(output_path, payload)
        return 0

    headers, rows = fetch_csv_rows(sheet_url)
    included_columns = [header for header in headers if should_include_header(header)]
    excluded_columns = [header for header in headers if header and header not in included_columns]
    latest_response_at = extract_latest_response_at(rows, headers)
    total_responses = len(rows)
    rows_for_analysis = rows[-MAX_ANALYSIS_ROWS:]

    if total_responses == 0:
        payload = build_output(
            status="pending",
            title=title,
            message="설문 응답이 아직 없어 요약을 생성하지 않았습니다.",
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=included_columns,
            excluded_columns=excluded_columns,
            summary_markdown="## 대기 중\n- 아직 수집된 설문 응답이 없습니다.",
        )
        write_output(output_path, payload)
        return 0

    if not ollama_model:
        payload = build_output(
            status="error",
            title=title,
            message="OLLAMA_MODEL 설정이 없어 자동 요약을 생성하지 못했습니다.",
            total_responses=total_responses,
            analyzed_responses=min(total_responses, MAX_ANALYSIS_ROWS),
            latest_response_at=latest_response_at,
            included_columns=included_columns,
            excluded_columns=excluded_columns,
            summary_markdown=(
                "## 설정 필요\n"
                "- self-hosted runner 환경 변수 또는 저장소 Variable `OLLAMA_MODEL`을 설정해 주세요.\n"
                "- 예: `exaone3.5`처럼 Ollama에 실제로 로드된 모델명을 입력해야 합니다."
            ),
        )
        write_output(output_path, payload)
        return 0

    prompt = build_user_prompt(rows_for_analysis, included_columns, total_responses)
    summary_markdown = request_ollama_summary(
        api_url=ollama_api_url,
        model=ollama_model,
        user_prompt=prompt,
    )

    payload = build_output(
        status="ok",
        title=title,
        message="자동 요약이 정상적으로 생성되었습니다.",
        total_responses=total_responses,
        analyzed_responses=min(total_responses, MAX_ANALYSIS_ROWS),
        latest_response_at=latest_response_at,
        included_columns=included_columns,
        excluded_columns=excluded_columns,
        summary_markdown=summary_markdown,
    )
    write_output(output_path, payload)
    return 0


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


def fetch_csv_rows(url: str) -> tuple[list[str], list[dict[str, str]]]:
    req = request.Request(url, headers={"User-Agent": "survey-summary-bot/1.0"})

    try:
        with request.urlopen(req, timeout=30) as response:
            charset = response.headers.get_content_charset("utf-8")
            text = response.read().decode(charset, errors="replace")
    except error.URLError as exc:
        raise RuntimeError(f"설문 CSV를 불러오지 못했습니다: {exc}") from exc

    reader = csv.DictReader(text.splitlines())
    headers = [sanitize_header(name) for name in (reader.fieldnames or []) if sanitize_header(name)]
    rows: list[dict[str, str]] = []

    for row in reader:
        cleaned: dict[str, str] = {}
        for raw_key, raw_value in row.items():
            key = sanitize_header(raw_key)
            if not key:
                continue
            cleaned[key] = sanitize_value(raw_value)
        if any(cleaned.values()):
            rows.append(cleaned)

    return headers, rows


def sanitize_header(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def sanitize_value(value: str | None) -> str:
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
    if not timestamp_headers or not rows:
        return ""

    latest_row = rows[-1]
    for header in timestamp_headers:
        value = latest_row.get(header, "").strip()
        if value:
            return value
    return ""


def build_user_prompt(
    rows: list[dict[str, str]],
    included_columns: list[str],
    total_responses: int,
) -> str:
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
        next_length = current_length + len(block)
        if next_length > MAX_PROMPT_LENGTH:
            break

        blocks.append(block)
        current_length = next_length

    joined_rows = "\n\n".join(blocks) if blocks else "[응답 데이터 없음]"
    included_text = ", ".join(included_columns) if included_columns else "분석 가능한 질문 없음"

    return (
        f"전체 응답 수: {total_responses}\n"
        f"이번 요약에 반영된 질문: {included_text}\n"
        f"아래는 최근 응답 일부입니다.\n\n"
        f"{joined_rows}"
    )


def request_ollama_summary(api_url: str, model: str, user_prompt: str) -> str:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "options": {
            "temperature": 0.2,
        },
    }

    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        api_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=180) as response:
            body = json.loads(response.read().decode("utf-8"))
    except error.URLError as exc:
        raise RuntimeError(f"Ollama 요약 요청에 실패했습니다: {exc}") from exc

    message = body.get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise RuntimeError("Ollama 응답에 요약 본문이 없습니다.")
    return content


def build_output(
    *,
    status: str,
    title: str,
    message: str,
    total_responses: int,
    analyzed_responses: int,
    latest_response_at: str,
    included_columns: list[str],
    excluded_columns: list[str],
    summary_markdown: str,
) -> dict[str, object]:
    return {
        "status": status,
        "title": title,
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


def write_output(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - safety path for workflow visibility
        output_path = Path(os.getenv("SUMMARY_OUTPUT_PATH", DEFAULT_OUTPUT_PATH))
        fallback = build_output(
            status="error",
            title=os.getenv("SUMMARY_TITLE", "서산시 과학화 예비군 훈련장 설문 요약").strip(),
            message=str(exc),
            total_responses=0,
            analyzed_responses=0,
            latest_response_at="",
            included_columns=[],
            excluded_columns=[],
            summary_markdown=f"## 오류\n- {exc}",
        )
        write_output(output_path, fallback)
        print(str(exc), file=sys.stderr)
        raise SystemExit(0)
