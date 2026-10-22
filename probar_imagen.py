"""Prueba aislada de la generación de imágenes. Ejecuta:  python probar_imagen.py"""
import os, time, urllib.parse
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
key = os.getenv("POLLINATIONS_API_KEY", "").strip()
model = os.getenv("IMAGE_MODEL", "flux").strip() or "flux"
print("Clave encontrada:", "SI (empieza por %s...)" % key[:4] if key else "NO  <-- falta en el .env")

url = "https://gen.pollinations.ai/image/" + urllib.parse.quote("a small red fox in a forest")
for label, params, headers in [
    ("con clave + modelo", {"model": model, "width": 512, "height": 512}, {"Authorization": f"Bearer {key}"}),
    ("con clave, sin modelo", {"width": 512, "height": 512}, {"Authorization": f"Bearer {key}"}),
]:
    t = time.time()
    try:
        r = requests.get(url, params=params, headers=headers, timeout=(10, 90))
        print(f"[{label}] HTTP {r.status_code} | {r.headers.get('Content-Type')} | {len(r.content)} bytes | {time.time()-t:.1f}s")
        if r.ok and r.headers.get("Content-Type", "").startswith("image/"):
            open("prueba.jpg", "wb").write(r.content)
            print("OK -> se guardó prueba.jpg. La generación funciona.")
            break
        print("Respuesta:", r.text[:400])
    except Exception as e:
        print(f"[{label}] ERROR: {type(e).__name__}: {e}")
