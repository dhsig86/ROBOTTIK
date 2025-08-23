# Regras Clínicas — Drafts e Validação
Gerado em 2025-08-23.

## O que foi adicionado
- **diag_ouvido.json** e **diag_garganta.json** com 12–14 diagnósticos, sintomas/modifiers e red flags.
- **Schemas** em `src/schemas/` (diag, lexicon, profiles, outputs).
- **Validador Node** em `scripts/validate_rules.js` (usa Ajv).
- **GitHub Actions** para travar PRs se a validação falhar.

## Como rodar localmente
```bash
npm i -D ajv ajv-formats
node scripts/validate_rules.js
```
Saída esperada:
- `VALIDATOR_OK` (passou)
- ou `VALIDATION_FAILED` (exibe erros).

> Observação: os LR+/LR- são rascunhos e podem ser substituídos por pesos (`weight`) onde não houver evidência consolidada. Ajuste `pretest` conforme sua curadoria.
