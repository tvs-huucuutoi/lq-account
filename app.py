import os
import sqlite3
import secrets
import string
import hmac
import hashlib
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
            CREATE TABLE IF NOT EXISTS parser_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                file_type TEXT NOT NULL,
                total_lines INTEGER NOT NULL,
                valid_lines INTEGER NOT NULL,
                duplicate_lines INTEGER NOT NULL,
                invalid_lines INTEGER NOT NULL,
                blank_lines INTEGER NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_parser_activity_created_at ON parser_activity(created_at)")

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

    return jsonify({"results": results, "count": len(results)})

@app.post("/api/parser-history")
def save_parser_history():
    if not validate_csrf():
        return jsonify({"error": "Phiên làm việc hết hạn. Hãy tải lại trang."}), 400

    data = request.get_json(silent=True) or {}
    file_type = str(data.get("file_type", "")).lower()
    if file_type not in ("txt", "docx"):
        return jsonify({"error": "Loại file không hợp lệ."}), 400

    try:
        total_lines = int(data.get("total_lines"))
        valid_lines = int(data.get("valid_lines"))
        duplicate_lines = int(data.get("duplicate_lines"))
        invalid_lines = int(data.get("invalid_lines"))
        blank_lines = int(data.get("blank_lines"))
    except (TypeError, ValueError):
        return jsonify({"error": "Số liệu lịch sử không hợp lệ."}), 400

    values = (total_lines, valid_lines, duplicate_lines, invalid_lines, blank_lines)
    if any(value < 0 or value > 10000000 for value in values):
        return jsonify({"error": "Số liệu vượt giới hạn cho phép."}), 400
    if valid_lines + duplicate_lines + invalid_lines + blank_lines > total_lines:
        return jsonify({"error": "Tổng số dòng phân loại không hợp lệ."}), 400

    created_at = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        cursor = conn.execute(
            """INSERT INTO parser_activity
               (created_at, file_type, total_lines, valid_lines, duplicate_lines, invalid_lines, blank_lines)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (created_at, file_type, total_lines, valid_lines, duplicate_lines, invalid_lines, blank_lines)
        )
        activity_id = cursor.lastrowid

    return jsonify({"ok": True, "id": activity_id})


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
        parser_rows = conn.execute(
            """SELECT id, created_at, file_type, total_lines, valid_lines,
                      duplicate_lines, invalid_lines, blank_lines
               FROM parser_activity ORDER BY id DESC LIMIT 100"""
        ).fetchall()
        parser_total = conn.execute("SELECT COUNT(*) AS n FROM parser_activity").fetchone()["n"]
    return render_template("admin.html", rows=rows, total=total,
                           parser_rows=parser_rows, parser_total=parser_total)

@app.get("/kiem-tra-du-lieu")
def safe_file_parser():
    """Local-only file parser; never receives or stores uploaded file contents."""
    return render_template("safe_file_parser.html")

@app.get("/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=False)
