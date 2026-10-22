"""Memoria local de Fábula (SQLite)."""
import os
import re
import sqlite3
from datetime import datetime, timezone

# Ruta absoluta: la base de datos siempre queda junto al proyecto,
# sin importar desde qué carpeta ejecutes `python app.py`.
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "fabula_memory.db")
MAX_CONTENT = 500_000


def connect_db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_knowledge():
    """Crea la base de datos local si todavía no existe."""
    conn = connect_db()
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS knowledge (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    source TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(source, title, content)
                )
            """)
    finally:
        conn.close()


def save_knowledge(title, content, source="manual"):
    """Guarda un conocimiento y su procedencia. Lanza ValueError si los datos no son válidos."""
    title = str(title).strip()
    content = str(content).strip()
    source = str(source).strip() or "manual"

    if not title or not content:
        raise ValueError("El título y el contenido son obligatorios.")
    content = content[:MAX_CONTENT]

    conn = connect_db()
    try:
        with conn:
            conn.execute(
                "INSERT OR IGNORE INTO knowledge (title, content, source, created_at) "
                "VALUES (?, ?, ?, ?)",
                (title, content, source, datetime.now(timezone.utc).isoformat()),
            )
    finally:
        conn.close()


def recall_knowledge(query, limit=5):
    """Devuelve los recuerdos guardados que más se parecen a la consulta."""
    words = {w for w in re.findall(r"\w{3,}", query.lower())}
    if not words:
        return []

    conn = connect_db()
    try:
        rows = conn.execute(
            "SELECT title, content, source FROM knowledge ORDER BY id DESC LIMIT 500"
        ).fetchall()
    finally:
        conn.close()

    scored = []
    for row in rows:
        haystack = f"{row['title']} {row['content']}".lower()
        score = sum(1 for w in words if w in haystack)
        if score:
            scored.append((score, dict(row)))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [item[1] for item in scored[:limit]]
