# Publicação no GitHub Pages (ROBOTTIK)

## Estrutura mínima
- `index.html`
- `404.html` (igual ao index para SPA)
- `main.js`
- `src/**`
- `assets/**`
- `src/config/env.json` (copiado de `env.example.json`)

## Ativação
Settings → Pages → Deploy from a branch → **main** / **root**.

## Config inicial de `env.json`
```json
{
  "APP_NAME": "ROBOTTO",
  "VERSION": "6.0.0-alpha",
  "LLM_PROVIDER": "off",
  "TRIAGE_API_BASE": "",
  "SPEECH_ADDON": "off",
  "AREAS_ENABLED": [
    "ouvido",
    "nariz",
    "garganta",
    "pescoco"
  ],
  "FEATURE_FLAGS": {
    "multi_area_autodetect": true,
    "save_case_local": true
  }
}
```

Depois, ajuste `TRIAGE_API_BASE` e `LLM_PROVIDER` quando o Heroku estiver pronto.
