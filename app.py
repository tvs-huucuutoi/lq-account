import os
import sqlite3
import secrets
import string
import hmac
import hashlib
import re
from io import BytesIO
from werkzeug.utils import secure_filename
from docx import Document
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, render_template, request, jsonify, session, redirect, url_for, flash
from werkzeug.middleware.proxy_fix import ProxyFix

APP_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DATABASE_PATH", "/tmp/lq_account_tool.db")

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "dev-only-change-this-secret-key")
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS generations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                username_length INTEGER NOT NULL,
                password_length INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                preview TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS filter_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                filename TEXT NOT NULL,
                extracted_count INTEGER NOT NULL,
                skipped_count INTEGER NOT NULL,
                status TEXT NOT NULL
            )
        """)
init_db()

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get("is_admin"):
            return redirect(url_for("login", next=request.path))
        return fn(*args, **kwargs)
    return wrapper

def csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_urlsafe(32)
    return session["csrf_token"]

@app.context_processor
def inject_globals():
    return {"csrf_token": csrf_token(), "is_admin": bool(session.get("is_admin"))}

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/filter")
def filter_page():
    return render_template("filter.html")

@app.get("/api/csrf")
def api_csrf():
    return jsonify({"csrf_token": csrf_token()})

def validate_csrf():
    supplied = request.headers.get("X-CSRF-Token", "") or request.form.get("_csrf", "")
    expected = session.get("csrf_token", "")
    return bool(expected and supplied and hmac.compare_digest(expected, supplied))

@app.post("/api/generate")
def generate():
    if not validate_csrf():
        return jsonify({"error": "Phiên làm việc hết hạn. Hãy tải lại trang."}), 400

    data = request.get_json(silent=True) or {}
    try:
        quantity = int(data.get("quantity", 100))
        username_length = int(data.get("username_length", 10))
        password_length = int(data.get("password_length", 12))
    except (TypeError, ValueError):
        return jsonify({"error": "Thông số không hợp lệ."}), 400

    if not 1 <= quantity <= 5000:
        return jsonify({"error": "Số lượng phải từ 1 đến 5.000."}), 400
    if not 3 <= username_length <= 32:
        return jsonify({"error": "Độ dài tài khoản phải từ 3 đến 32."}), 400
    if not 4 <= password_length <= 64:
        return jsonify({"error": "Độ dài mật khẩu phải từ 4 đến 64."}), 400

    username_chars = string.ascii_lowercase + string.digits
    password_chars = string.ascii_letters + string.digits
    pairs = set()
    while len(pairs) < quantity:
        username = "".join(secrets.choice(username_chars) for _ in range(username_length))
        password = "".join(secrets.choice(password_chars) for _ in range(password_length))
        pairs.add(f"{username}:{password}")

    results = sorted(pairs)
    preview = f"{len(results)} cặp dữ liệu được tạo (không lưu nội dung tài khoản/mật khẩu)."
    created_at = datetime.now(timezone.utc).isoformat()

    # Keep history metadata only; do not store generated passwords.
    with db() as conn:
        conn.execute(
            "INSERT INTO generations (created_at, username_length, password_length, quantity, preview) VALUES (?, ?, ?, ?, ?)",
            (created_at, username_length, password_length, quantity, preview)
        )

    # Public visitors receive usernames with masked passwords. Only an authenticated
    # admin receives the generated password values in the API response.
    if session.get("is_admin"):
        visible_results = results
    else:
        visible_results = [item.split(":", 1)[0] + ":••••••" for item in results]

    return jsonify({"results": visible_results, "count": len(visible_results),
                    "passwords_visible": bool(session.get("is_admin"))})


@app.get("/login")
def login():
    if session.get("is_admin"):
        return redirect(url_for("admin"))
    return render_template("login.html", error=None)

@app.post("/login")
def login_post():
    if not validate_csrf():
        return render_template("login.html", error="Phiên đăng nhập hết hạn. Hãy tải lại trang."), 400

    username = request.form.get("username", "")
    password = request.form.get("password", "")
    if not ADMIN_PASSWORD:
        return render_template("login.html", error="Chưa cấu hình ADMIN_PASSWORD trên Render."), 503

    username_ok = hmac.compare_digest(username, ADMIN_USERNAME)
    password_ok = hmac.compare_digest(
    password.encode("utf-8"),
    ADMIN_PASSWORD.encode("utf-8")
)
    if username_ok and password_ok:
        session.clear()
        session["is_admin"] = True
        session["admin_name"] = ADMIN_USERNAME
        session["csrf_token"] = secrets.token_urlsafe(32)
        return redirect(url_for("admin"))

    return render_template("login.html", error="Tên đăng nhập hoặc mật khẩu không đúng."), 401

@app.post("/logout")
def logout():
    if not validate_csrf():
        return redirect(url_for("index"))
    session.clear()
    return redirect(url_for("index"))

@app.get("/admin")
@admin_required
def admin():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, created_at, username_length, password_length, quantity, preview "
            "FROM generations ORDER BY id DESC LIMIT 100"
        ).fetchall()
        total = conn.execute("SELECT COALESCE(SUM(quantity), 0) AS n FROM generations").fetchone()["n"]
        filter_rows = conn.execute(
            "SELECT id, created_at, filename, extracted_count, skipped_count, status "
            "FROM filter_history ORDER BY id DESC LIMIT 100"
        ).fetchall()
        filter_total = conn.execute("SELECT COUNT(*) AS n FROM filter_history").fetchone()["n"]
    return render_template("admin.html", rows=rows, total=total, filter_rows=filter_rows, filter_total=filter_total)


@app.post("/api/filter-file")
def filter_file():
    if not validate_csrf():
        return jsonify({"error": "Phiên làm việc hết hạn. Hãy tải lại trang."}), 400

    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Vui lòng chọn file TXT hoặc DOCX."}), 400

    filename = secure_filename(uploaded.filename) or "uploaded-file"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in {".txt", ".docx"}:
        return jsonify({"error": "Chỉ hỗ trợ file .txt và .docx."}), 400

    raw = uploaded.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        return jsonify({"error": "File vượt quá giới hạn 10 MB."}), 413

    try:
        if extension == ".txt":
            try:
                source_text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                try:
                    source_text = raw.decode("cp1258")
                except UnicodeDecodeError:
                    source_text = raw.decode("latin-1")
        else:
            document = Document(BytesIO(raw))
            text_parts = [p.text for p in document.paragraphs if p.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    text_parts.append(" | ".join(cell.text for cell in row.cells))
            source_text = "\n".join(text_parts)
    except Exception:
        return jsonify({"error": "Không thể đọc nội dung file. Hãy kiểm tra file DOCX/TXT."}), 400

    extracted = []
    skipped = 0
    metadata_labels = {
        "NAME", "RANK", "LEVEL", "TƯỚNG", "TUONG", "SKIN", "QH",
        "HERO", "BAN", "EMAIL", "SDT", "SĐT", "CMND", "CCCD",
        "AUTHEN", "FB", "SÒ", "SO", "QUỐC GIA", "LOGIN",
        "SS", "SSS", "ANIME", "OTHER", "TÌNH TRẠNG", "TRẠNG THÁI",
        "REGION", "FINAL", "IN", "RESULT"
    }

    for raw_line in source_text.splitlines():
        line = raw_line.strip().lstrip("\\ufeff")
        if not line:
            continue

        # A record may start with one of these export labels.
        lowered = line.lower()
        for prefix in ("in:", "result =", "final ="):
            if lowered.startswith(prefix):
                line = line[len(prefix):].strip()
                break

        # Ignore continuation/metadata lines from multi-line account exports.
        if "|" not in line and ":" not in line:
            skipped += 1
            continue

        first_field = line.split("|", 1)[0].strip()
        if ":" in first_field:
            username, password = first_field.split(":", 1)
        else:
            fields = line.split("|", 2)
            if len(fields) < 2:
                skipped += 1
                continue
            username, password = fields[0], fields[1]

        username = username.strip()
        password = password.strip()
        normalized_user = username.upper()

        # Reject obvious account-detail rows such as "30|QH : 0",
        # "YES|CMND : NO", and "OTHER|0 []".
        looks_like_metadata = (
            normalized_user in metadata_labels
            or (username.isdigit() and len(username) < 6)
            or (username.isalpha() and username.isupper())
        )
        valid_username = (
            len(username) >= 3
            and all(ch.isalnum() or ch in "._-@+" for ch in username)
            and (any(ch.islower() for ch in username)
                 or any(ch.isdigit() for ch in username)
                 or any(ch in "._-@+" for ch in username))
        )
        if looks_like_metadata or not valid_username or not password:
            skipped += 1
            continue

        pair = username + "|" + password
        extracted.append(pair)

    status = "success" if extracted else "empty"
    with db() as conn:
        conn.execute(
            "INSERT INTO filter_history (created_at, filename, extracted_count, skipped_count, status) VALUES (?, ?, ?, ?, ?)",
            (datetime.now(timezone.utc).isoformat(), filename, len(extracted), skipped, status)
        )

    return jsonify({
        "filename": filename,
        "results": extracted,
        "count": len(extracted),
        "skipped": skipped,
        "status": status
    })




@app.post("/api/search-filter")
def search_filter():
    if not validate_csrf():
        return jsonify({"error": "Phiên làm việc hết hạn. Hãy tải lại trang."}), 400

    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Vui lòng chọn file TXT hoặc DOCX."}), 400

    filename = secure_filename(uploaded.filename) or "uploaded-file"
    extension = os.path.splitext(filename)[1].lower()
    if extension not in {".txt", ".docx"}:
        return jsonify({"error": "Chỉ hỗ trợ file .txt và .docx."}), 400

    raw = uploaded.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        return jsonify({"error": "File vượt quá giới hạn 10 MB."}), 413

    try:
        if extension == ".txt":
            try:
                source_text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                try:
                    source_text = raw.decode("cp1258")
                except UnicodeDecodeError:
                    source_text = raw.decode("latin-1")
        else:
            document = Document(BytesIO(raw))
            parts = [p.text for p in document.paragraphs if p.text.strip()]
            for table in document.tables:
                for row in table.rows:
                    parts.append(" | ".join(cell.text for cell in row.cells))
            source_text = "\n".join(parts)
    except Exception:
        return jsonify({"error": "Không thể đọc nội dung file TXT/DOCX."}), 400

    keywords = {
        "SS": (request.form.get("ss") or "").strip(),
        "SSS": (request.form.get("sss") or "").strip(),
        "SKIN": (request.form.get("skin") or "").strip(),
    }
    active = {label: value.casefold() for label, value in keywords.items() if value}
    if not active:
        return jsonify({"error": "Hãy nhập ít nhất một từ khóa SS, SSS hoặc SKIN."}), 400

    # Split the document into account sections. "In:" is the common export
    # prefix; plain account|password rows are also accepted as section starts.
    sections = []
    current = []

    def is_account_start(line):
        candidate = line.strip()
        if candidate.lower().startswith("in:"):
            candidate = candidate[3:].strip()
        first = candidate.split("|", 1)[0].strip()
        if ":" in first:
            user, password = first.split(":", 1)
        else:
            fields = candidate.split("|", 2)
            if len(fields) < 2:
                return False
            user, password = fields[0], fields[1]
        user, password = user.strip(), password.strip()
        labels = {"NAME", "RANK", "LEVEL", "TƯỚNG", "TUONG", "SKIN", "QH",
                  "SS", "SSS", "ANIME", "OTHER", "EMAIL", "SDT", "SĐT",
                  "IN", "RESULT", "FINAL"}
        # Only accept account identifiers, never descriptive metadata rows.
        valid_user = (
            len(user) >= 3
            and all(ch.isalnum() or ch in "._-@+" for ch in user)
            and (any(ch.islower() for ch in user)
                 or any(ch.isdigit() for ch in user)
                 or any(ch in "._-@+" for ch in user))
        )
        return (valid_user and bool(password)
                and user.upper() not in labels
                and not (user.isalpha() and user.isupper()))

    for raw_line in source_text.splitlines():
        line = raw_line.strip().lstrip("\ufeff")
        if not line:
            continue
        if is_account_start(line):
            if current:
                sections.append(current)
            current = [line]
        elif current:
            current.append(line)
    if current:
        sections.append(current)

    results = []
    for section in sections:
        block = "\n".join(section)
        found_labels = {}
        for label in active:
            # Match a complete metadata label (SS does not match SSS).
            pattern = rf"(?i)(?:^|[|,\s]){label}\s*:\s*([^|\r\n,]+)"
            values = [m.group(1).strip().casefold() for m in re.finditer(pattern, block)]
            found_labels[label] = any(active[label] in value for value in values)

        # OR logic: one matching entered field is enough.
        if not any(found_labels.values()):
            continue

        first = section[0]
        if first.lower().startswith("in:"):
            first = first[3:].strip()
        first_field = first.split("|", 1)[0].strip()
        if ":" in first_field:
            username, password = first_field.split(":", 1)
        else:
            fields = first.split("|", 2)
            if len(fields) < 2:
                continue
            username, password = fields[0], fields[1]
        pair = username.strip() + "|" + password.strip()
        if pair not in results:
            results.append(pair)

    return jsonify({
        "filename": filename,
        "results": results,
        "count": len(results),
        "keywords": keywords,
        "match_mode": "OR"
    })


@app.get("/api/filter-history")
@admin_required
def filter_history():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, created_at, filename, extracted_count, skipped_count, status "
            "FROM filter_history ORDER BY id DESC LIMIT 30"
        ).fetchall()
    return jsonify({"history": [dict(row) for row in rows]})


@app.get("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
