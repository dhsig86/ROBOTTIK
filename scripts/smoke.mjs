// File: scripts/smoke.mjs
const BASE = (process.env.BASE_URL || "http://127.0.0.1:5500").replace(
  /\/$/,
  "",
);
const mode = process.argv.includes("--always") ? "always" : "gated";

// Prefixa fetch("/src/...") -> "http://127.0.0.1:5500/src/..."
const origFetch = globalThis.fetch;
if (typeof origFetch !== "function") {
  throw new Error("Node 18+ é necessário (fetch nativo).");
}
globalThis.fetch = (input, init) => {
  let url = input;
  if (typeof url === "string" && url.startsWith("/")) {
    url = BASE + url;
  }
  return origFetch(url, init);
};

import { triage, explainTop } from "../src/core/triageEngine.js";
import { loadRegistry } from "../src/core/conditionRegistry.js";

(async () => {
  try {
    const raw = {
      symptoms: [
        "rinorreia",
        "obstrucao_nasal",
        "odinofagia",
        "plenitude_auricular",
        "linfonodo_cervical_aumentado",
      ],
      idade: 70,
      sexo: "M",
      comorbidades: ["tabagista"],
      hpi: "Há 3 dias: coriza, leve dor de garganta, ouvido tampado.",
    };

    const res = await triage(raw, { mode });
    const registry = await loadRegistry();

    const top3 = res.ranking.slice(0, 3).map((r) => ({
      global_id: r.global_id,
      posterior: +r.posterior.toFixed(3),
    }));

    console.log("=== ROBOTTO Smoke Test ===");
    console.log("BASE_URL  :", BASE);
    console.log("Router    :", mode);
    console.log("Áreas     :", res.areas.join(", "));
    console.log("Top-1     :", explainTop(res.ranking, registry));
    console.log("Top-3     :", top3);
    console.log("Via       :", res.outputs.via);
    console.log("Alarmes   :", res.outputs.alarmes);
    console.log("Resumo    :", res.outputs.resumo);

    // --- Micro-test: 'rinorreia_liquida_clara' deve enviar para EMERGÊNCIA GERAL ---
    try {
      const lcrCase = await triage(
        {
          symptoms: ["rinorreia_liquida_clara"], // ID canônico em features.json
          idade: 40,
          sexo: "F",
          hpi: "Saída de líquido claro pelo nariz desde ontem.",
        },
        { mode },
      );

      const via = lcrCase?.outputs?.via || "(indefinido)";
      const expected = "emergencia_geral";

      if (via !== expected) {
        console.error(
          `[Smoke Error] Esperado via '${expected}' para 'rinorreia_liquida_clara', mas veio '${via}'.`,
        );
        // Logs úteis para depurar quando falhar:
        console.error(">> outputs.alarmes =", lcrCase?.outputs?.alarmes);
        console.error(
          ">> debug.selectedAreas =",
          lcrCase?.debug?.selectedAreas,
        );
        console.error(">> intake =", lcrCase?.intake);
        process.exitCode = 1; // marca o processo como falho, mas não aborta o restante do log
      } else {
        console.log("✔ Micro-test LCR: via =", via);
      }
    } catch (e) {
      console.error("[Smoke Error] Micro-test LCR falhou com exceção:", e);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error("[Smoke Error]", err);

    process.exit(1);
  }

  // [SMOKE] garg/estridor -> emergência geral
  {
    const raw2 = { symptoms: ["estridor"], idade: 22, sexo: "M" };
    const res2 = await triage(raw2, { mode });
    if (res2.outputs.via !== "emergencia_geral") {
      console.error(
        "✘ Micro-test Estridor: via esperada emergencia_geral, obtido:",
        res2.outputs.via,
      );
      process.exit(1);
    } else {
      console.log("✔ Micro-test Estridor: via = emergencia_geral");
      if (res2.outputs?.next_questions?.length) {
        console.log(
          "NBQ:",
          res2.outputs.next_questions.map(
            (q) => `${q.label} [~${q.gainBits} bits]`,
          ),
        );
      }
      // ✔ Micro-test NBQ: deve trazer pelo menos 1 sugestão
      if (
        !Array.isArray(res2.outputs.next_questions) ||
        res2.outputs.next_questions.length === 0
      ) {
        throw new Error("NBQ: nenhuma sugestão retornada");
      } else {
        console.log(
          `✔ Micro-test NBQ: ${res2.outputs.next_questions.length} sugestão(ões)`,
        );
      }
    }
  }
})();
