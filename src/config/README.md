# Configuração de Ambiente (`src/config/`)

Gerado em 2025-08-23. Apenas *configuração*, sem código de app.

## Como usar
1. Copie `src/config/env.example.json` → `src/config/env.json`.
2. Em dev local, mantenha:
   - `"LLM_PROVIDER": "off"`
   - `"TRIAGE_API_BASE": ""`
3. No GitHub Pages, faça commit de `env.json`. Quando o Heroku estiver pronto, troque:
   - `"TRIAGE_API_BASE": "https://<seu-app>.herokuapp.com/api/triage"`
   - `"LLM_PROVIDER": "gpt5nano"` ou `"stratis"`.

**Atenção:** não salve tokens secretos aqui. Proteja isso no backend.
