import html
import logging
import os
import re
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

from knowledge import init_knowledge, recall_knowledge, save_knowledge

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

app = Flask(__name__)
app.config["JSON_AS_ASCII"] = False
app.secret_key = os.getenv("FLASK_SECRET_KEY") or os.urandom(24)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Configuración (se lee del archivo .env) ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
SEARCH_API_KEY = os.getenv("SEARCH_API_KEY", "").strip()
POLLINATIONS_API_KEY = os.getenv("POLLINATIONS_API_KEY", "").strip()
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "flux").strip() or "flux"

# rstrip(".") protege contra un punto final por error de tipeo en el .env
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip().rstrip(".") or "gemini-3.8-flash"
# Modelos de respaldo vigentes (gemini-1.5 y 2.x ya fueron retirados).
MODEL_CHAIN = list(dict.fromkeys([GEMINI_MODEL, "gemini-3.5-flash", "gemini-3.1-flash-lite"]))

# Endpoints reales (antes apuntaban a las portadas de brave.com / wikimedia.org)
SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"
COMMONS_URL = "https://commons.wikimedia.org/w/api.php"
IMAGE_URL = "https://gen.pollinations.ai/image/"  # requiere API key (enter.pollinations.ai)

MAX_QUERY_LEN = 500
AUDIO_EXTENSIONS = (".ogg", ".oga", ".mp3", ".wav", ".flac", ".opus")

_client = None


# ------------------------------------------------------------------ búsquedas

def clean_text(value):
    """Quita etiquetas HTML y entidades que devuelven los buscadores."""
    return html.unescape(re.sub(r"<[^>]+>", "", value or "")).strip()


def search_web(query):
    """Busca páginas web, guarda los fragmentos en memoria y devuelve resultados."""
    if not SEARCH_API_KEY:
        return []

    response = requests.get(
        SEARCH_URL,
        headers={"X-Subscription-Token": SEARCH_API_KEY, "Accept": "application/json"},
        params={"q": query, "count": 8},
        timeout=15,
    )
    response.raise_for_status()

    results = []
    for item in response.json().get("web", {}).get("results", []):
        url = item.get("url")
        if not url:
            continue
        title = clean_text(item.get("title")) or "Sin título"
        snippet = clean_text(item.get("description"))
        results.append({"title": title, "url": url, "snippet": snippet})

        if snippet:
            try:
                save_knowledge(title=title, content=snippet, source=url)
            except Exception:
                logger.exception("No se pudo guardar en la memoria local")

    return results


IMAGE_STYLES = {
    "cuento": "children's book illustration, warm colors, storybook style",
    "realista": "photorealistic, natural light, highly detailed",
    "acuarela": "soft watercolor painting, delicate brush strokes",
    "anime": "anime style, vibrant colors, clean line art",
    "fantasia": "epic fantasy concept art, dramatic lighting, magical atmosphere",
}


def generate_images(prompt, style="cuento"):
    """Devuelve 3 URLs LOCALES (/api/image). El servidor es quien llama a Pollinations
    con la clave, así la clave nunca llega al navegador."""
    variants = [("Vista principal", 42), ("Variante cinematográfica", 101), ("Ángulo detallado", 999)]
    return [
        {
            "title": title,
            "image": "/api/image?" + urllib.parse.urlencode({"prompt": prompt, "style": style, "seed": seed}),
        }
        for title, seed in variants
    ]


def fetch_pollinations_image(prompt, style, seed):
    """Descarga la imagen desde Pollinations usando la API key. Devuelve (bytes, mimetype)."""
    suffix = IMAGE_STYLES.get(style, "")
    full_prompt = f"{prompt}, {suffix}" if suffix else prompt
    started = time.time()
    logger.info("Pidiendo imagen a Pollinations (seed=%s, modelo=%s)...", seed, IMAGE_MODEL)
    response = requests.get(
        IMAGE_URL + urllib.parse.quote(full_prompt, safe=""),
        params={"width": 768, "height": 768, "seed": seed, "model": IMAGE_MODEL, "nologo": "true"},
        headers={"Authorization": f"Bearer {POLLINATIONS_API_KEY}"},
        timeout=(10, 60),
    )
    logger.info("Pollinations respondió %s en %.1fs", response.status_code, time.time() - started)
    if not response.ok:
        raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
    mime = response.headers.get("Content-Type", "image/jpeg").split(";")[0]
    if not mime.startswith("image/"):
        raise ValueError(f"Pollinations devolvió {mime} en lugar de una imagen: {response.text[:200]}")
    return response.content, mime


def commons_search(query, filetype, limit=8, thumb_width=800):
    """Busca archivos en Wikimedia Commons y devuelve las páginas ordenadas por relevancia."""
    response = requests.get(
        COMMONS_URL,
        params={
            "action": "query",
            "generator": "search",
            "gsrsearch": f"{query} filetype:{filetype}",
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|mime",
            "iiurlwidth": thumb_width,
            "format": "json",
        },
        headers={"User-Agent": "FabulaIA/1.0 (multimedia search)"},
        timeout=15,
    )
    response.raise_for_status()
    pages = response.json().get("query", {}).get("pages", {})
    return sorted(pages.values(), key=lambda p: p.get("index", 0))


def search_related_images(query):
    """Imágenes reales relacionadas (Wikimedia Commons)."""
    results = []
    for page in commons_search(query, "bitmap", limit=9):
        info_list = page.get("imageinfo") or []
        info = info_list[0] if info_list else {}
        mime = info.get("mime", "")
        src = info.get("thumburl") or info.get("url", "")
        if src and mime.startswith("image/"):
            results.append({
                "title": page.get("title", "Imagen").replace("File:", "").rsplit(".", 1)[0],
                "image": src,
                "page": info.get("descriptionurl", ""),
            })
    return results


def search_audio(query):
    """Busca archivos de audio en Wikimedia Commons."""
    results = []
    for page in commons_search(query, "audio", limit=8):
        # imageinfo es una LISTA: antes se usaba la lista completa y .get() fallaba.
        info_list = page.get("imageinfo") or []
        info = info_list[0] if info_list else {}
        url = info.get("url", "")
        mime = info.get("mime", "")
        is_audio = mime.startswith("audio/") or mime == "application/ogg" \
            or url.lower().endswith(AUDIO_EXTENSIONS)
        if url and is_audio:
            title = page.get("title", "Audio").replace("File:", "")
            results.append({"title": title, "audio": url, "mime": mime or "audio/ogg"})
    return results


# ----------------------------------------------------------------- generación

def _get_client():
    global _client
    if _client is None:
        from google import genai  # paquete: google-genai
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def generate_answer(query, web_results, memory):
    """Genera la respuesta con Gemini, probando varios modelos en orden."""
    if not GEMINI_API_KEY:
        return (
            "Configura GEMINI_API_KEY en tu archivo .env para activar "
            "las respuestas de inteligencia artificial.", None
        )

    web_context = "\n".join(
        f"- {r['title']}: {r['snippet']} ({r['url']})" for r in web_results
    ) or "No hay resultados web."
    memory_context = "\n".join(
        f"- {m['title']}: {m['content'][:300]}" for m in memory
    ) or "La memoria local no tiene datos sobre este tema."

    prompt = f"""Eres un asistente experto, cálido y directo. Responde en español.

REGLAS DE FORMATO:
1. Empieza INMEDIATAMENTE con la información solicitada, sin saludos ni preámbulos.
2. Prohibido abrir con notas, disculpas o advertencias.
3. Si necesitas añadir una nota o aclaración, ponla al FINAL, separada por una línea con ---.
4. Puedes usar **negritas** y listas con "- " cuando ayuden a la claridad.

Pregunta: {query}

Memoria local (úsala si es relevante):
{memory_context}

Resultados web (úsalos como contexto si son útiles):
{web_context}
"""

    last_error = None
    for model in MODEL_CHAIN:
        try:
            response = _get_client().models.generate_content(model=model, contents=prompt)
            if response.text:
                return response.text, model
            logger.warning("El modelo %s no devolvió texto", model)
        except Exception as exc:  # cuota, saturación, modelo inexistente...
            last_error = exc
            logger.warning("Falló el modelo %s: %s", model, exc)

    logger.error("Todos los modelos fallaron: %s", last_error)
    return (
        "La IA no pudo responder ahora mismo. Revisa tu GEMINI_API_KEY y el nombre "
        "del modelo en el archivo .env, o intenta de nuevo en unos segundos.", None
    )


# ---------------------------------------------------------------------- rutas

@app.route("/")
def index():
    return render_template("index.html")


def read_text(field="query"):
    """Lee y valida el texto enviado en el JSON. Devuelve (texto, respuesta_de_error)."""
    body = request.get_json(silent=True) or {}
    value = body.get(field, "")
    if not isinstance(value, str) or not value.strip():
        return None, (jsonify({"error": "Escribe algo para poder continuar."}), 400)
    return value.strip()[:MAX_QUERY_LEN], None


@app.route("/api/search", methods=["POST"])
def api_search():
    """Solo texto: respuesta de IA + fuentes + memoria. Lo demás se pide aparte."""
    query, error = read_text()
    if error:
        return error

    warnings = []
    if not SEARCH_API_KEY:
        warnings.append("Búsqueda web desactivada: falta SEARCH_API_KEY en el .env.")

    def safe(fn, label):
        try:
            return fn(query)
        except Exception as exc:
            logger.warning("Falló %s: %s", label, exc)
            warnings.append(f"No se pudo obtener {label}.")
            return []

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_memory = pool.submit(safe, recall_knowledge, "la memoria local")
        f_web = pool.submit(safe, search_web, "los resultados web")
        memory, web = f_memory.result(), f_web.result()

    answer, model = generate_answer(query, web, memory)
    return jsonify({"answer": answer, "model": model, "web": web,
                    "memory": memory, "warnings": warnings})


@app.route("/api/related-images", methods=["POST"])
def api_related_images():
    query, error = read_text()
    if error:
        return error
    try:
        return jsonify({"images": search_related_images(query)})
    except Exception as exc:
        logger.warning("Falló la búsqueda de imágenes: %s", exc)
        return jsonify({"images": [], "warning": "No se pudieron obtener imágenes ahora mismo."})


@app.route("/api/audio", methods=["POST"])
def api_audio():
    query, error = read_text()
    if error:
        return error
    try:
        return jsonify({"audio": search_audio(query)})
    except Exception as exc:
        logger.warning("Falló la búsqueda de audio: %s", exc)
        return jsonify({"audio": [], "warning": "No se pudieron obtener audios ahora mismo."})


@app.route("/api/generate-image", methods=["POST"])
def api_generate_image():
    prompt, error = read_text("prompt")
    if error:
        return error
    if not POLLINATIONS_API_KEY:
        return jsonify({"error": "Falta POLLINATIONS_API_KEY en el .env. "
                                 "Consíguela gratis en https://enter.pollinations.ai"}), 400
    style = (request.get_json(silent=True) or {}).get("style", "cuento")
    return jsonify({"images": generate_images(prompt, style)})


@app.route("/api/image")
def api_image():
    """Proxy: pide la imagen a Pollinations con la clave y la entrega al navegador."""
    prompt = (request.args.get("prompt") or "").strip()[:MAX_QUERY_LEN]
    style = request.args.get("style", "cuento")
    try:
        seed = int(request.args.get("seed", 42))
    except ValueError:
        seed = 42
    if not prompt or not POLLINATIONS_API_KEY:
        return "Falta el prompt o POLLINATIONS_API_KEY", 400
    try:
        data, mime = fetch_pollinations_image(prompt, style, seed)
    except Exception as exc:
        logger.warning("Falló la generación de imagen: %s", exc)
        return "No se pudo generar la imagen", 502
    return Response(data, mimetype=mime, headers={"Cache-Control": "public, max-age=86400"})


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "La ruta solicitada no existe."}), 404
    return "Página no encontrada", 404


@app.errorhandler(500)
def internal_error(error):
    logger.exception("Error interno de Flask")
    if request.path.startswith("/api/"):
        return jsonify({"error": "Error interno del servidor."}), 500
    return "Error interno del servidor", 500


init_knowledge()

if __name__ == "__main__":
    app.run(debug=True)
