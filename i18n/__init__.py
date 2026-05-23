"""
i18n/__init__.py
----------------
Simple translation loader for the CTTI Tender Evaluation Workbench.

Supported languages: "en" (English), "es" (Spanish), "ca" (Catalan).

Usage:
    from i18n import get_translations
    t = get_translations("ca")
    st.title(t["app_title"])
    st.button(t["run_button"])
"""

import json
from pathlib import Path
from functools import lru_cache

TRANSLATIONS_PATH = Path(__file__).parent / "translations.json"
SUPPORTED_LANGUAGES = {"en": "English", "es": "Español", "ca": "Català"}


@lru_cache(maxsize=None)
def _load_all() -> dict:
    with open(TRANSLATIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


def get_translations(lang: str = "en") -> dict:
    """Return the translation dict for the given language code."""
    all_t = _load_all()
    if lang not in all_t:
        lang = "en"
    return all_t[lang]
