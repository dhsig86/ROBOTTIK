import assert from "node:assert/strict";
import { triage } from "../../core/triageEngine.js";

const BASE = process.env.BASE_URL || "http://127.0.0.1:5500";

async function t_case(name, fn) {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    console.error(`✘ ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

/** 1) Viral > Alérgica quando coriza + obstrução */
async () => {
  await t_case("Viral > Alérgica (coriza+obstrução)", async () => {
    const res = await triage(
      { symptoms: ["rinorreia", "obstrucao_nasal"], idade: 28, sexo: "F" },
      { mode: "gated" },
    );
    const ids = res.ranking.map((r) => r.global_id);
    assert(
      ids[0] === "uri_nasofaringite",
      `Top-1 esperado uri_nasofaringite, obtido ${ids[0]}`,
    );
  });
};
/** 2) Bacteriana sobe com duração+purulenta */
async () => {
  await t_case("Bacteriana sobe (duracao + purulenta)", async () => {
    const res = await triage(
      {
        symptoms: ["dor_face", "rinorreia_purulenta"],
        duracao_dias: 12,
        idade: 40,
        sexo: "M",
      },
      { mode: "gated" },
    );
    const ids = res.ranking.map((r) => r.global_id);
    const posBact = ids.indexOf("rinossinusite_aguda_bacteriana");
    const posViral = ids.indexOf("uri_nasofaringite");
    assert(
      posBact !== -1,
      "rinossinusite_aguda_bacteriana deveria estar no ranking",
    );
    assert(
      posViral === -1 || posBact < posViral,
      "bacteriana deveria estar acima de viral",
    );
  });
};

/** 3) Red flag (epistaxe posterior) força via emergência geral */

async () => {
  await t_case("Red flag → emergência_geral", async () => {
    const res = await triage(
      { symptoms: ["epistaxe", "hemorragia_abundante", "hipertensao"] },
      { mode: "always" },
    );
    assert(
      res.outputs.via === "emergencia_geral",
      `via esperada emergencia_geral; obtida ${res.outputs.via}`,
    );
  });
};

console.log("\nUnit tests finalizados.");
