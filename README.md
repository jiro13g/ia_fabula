# Fábula · Buscador con IA

Aplicación local (Flask). Primero responde con **texto** (rápido) y el resto se carga **solo cuando lo pides**, desde el panel izquierdo o desde las sugerencias al final de cada respuesta:

- ✨ **Respuesta de Gemini** con efecto de escritura, lectura en voz alta y botón de copiar.
- 🖼️ **Imágenes relacionadas** reales (Wikimedia Commons) con visor ampliado.
- 🎨 **Generar imagen** con IA (Pollinations), con prompt editable y varios estilos.
- 🎧 **Sonidos** reales de Wikimedia Commons.
- 🧠 **Memoria**: fuentes web (Brave Search) y recuerdos guardados en SQLite que la IA reutiliza.

## Instalación (Windows)

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Configuración

1. Copia `.env.example` como `.env`.
2. Pega tu clave de https://aistudio.google.com/app/apikey en `GEMINI_API_KEY`.
3. Para **Generar imagen**: crea una clave en https://enter.pollinations.ai y pégala en `POLLINATIONS_API_KEY`.
4. (Opcional) Añade `SEARCH_API_KEY` de Brave Search para activar las fuentes web.
5. Revisa que `GEMINI_MODEL` no tenga espacios ni puntos al final.

## Ejecutar

```powershell
python app.py
```

Abre http://127.0.0.1:5000

Atajos: `/` o `Ctrl+K` enfocan el buscador; `Esc`, `←` y `→` controlan el visor de imágenes.

## Privacidad

Las búsquedas se envían a Gemini, Brave y Pollinations. No escribas datos privados.
