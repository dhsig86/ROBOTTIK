/* ============================================================================
   ROBOTTO – Triagem Otorrino (Fase 1 – Frontend oficial)
   Arquivo: main.js (único; plug-and-play para o index.html que você enviou)
   Objetivo: Tornar o MVP totalmente funcional para investidores, offline.
   - Áreas e sintomas sugeridos (chips)
   - Coleta de dados (nome/idade/sexo/HPI)
   - Triagem local (heurística leve) → 4 saídas:
       1) Via (nível de atendimento) + motivo
       2) Diagnósticos prováveis e diferenciais/potenciais
       3) Sinais de alerta (red flags)
       4) Condutas / Exames sugeridos
   - Salvar caso local (localStorage) e Exportar relatório (Markdown)
   - Pronto para plugar backend (stub triageHybrid)
   ============================================================================ */

/** Utilidades DOM simples */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Elementos principais */
const el = {
  nome: $("#in_nome"),
  idade: $("#in_idade"),
  sexo: $("#in_sexo"),
  hpi: $("#in_text"),
  areaPills: $("#areaPills"),
  symptomsBox: $("#symptomsBox"),
  btnTriar: $("#btnTriar"),
  btnLimpar: $("#btnLimpar"),
  btnSalvar: $("#btnSalvar"),
  btnExportar: $("#btnExportar"),
  resultPane: $("#resultPane"),
  toast: $("#toast"),
};

/** Estado do formulário */
const state = {
  areas: new Set(),           // "ouvido" | "nariz" | "garganta" | "pescoco"
  selectedSymptoms: new Set(),// ids de sintomas
};

/** Catálogo reduzido de sintomas por área (MVP) */
const SYMPTOMS = {
  ouvido: [
    { id: "otalgia", label: "Dor de ouvido (otalgia)" },
    { id: "otorreia", label: "Secreção no ouvido (otorreia)" },
    { id: "hipoacusia", label: "Diminuição da audição (hipoacusia)" },
    { id: "plenitude", label: "Ouvido tampado (plenitude)" },
    { id: "tinitus", label: "Zumbido (tinnitus)" },
    { id: "vertigem", label: "Vertigem/tonteira" },
    { id: "febre", label: "Febre" },
    { id: "odontalgia_ref", label: "Dor dente/ATM referida" },
    { id: "trauma", label: "Trauma/impacto recente" },
    { id: "prurido_o", label: "Coceira no ouvido" },
  ],
  nariz: [
    { id: "obstrucao", label: "Obstrução nasal" },
    { id: "rinorreia_hialina", label: "Rinorreia hialina" },
    { id: "rinorreia_purulenta", label: "Rinorreia espessa/purulenta" },
    { id: "espirros", label: "Espirros" },
    { id: "prurido_nasal", label: "Prurido nasal" },
    { id: "hiposmia", label: "Hiposmia/Anosmia" },
    { id: "dor_facial", label: "Dor/pressão facial" },
    { id: "epistaxe", label: "Sangramento nasal (epistaxe)" },
    { id: "cefaleia", label: "Cefaleia" },
    { id: "febre", label: "Febre" },
  ],
  garganta: [
    { id: "odinofagia", label: "Dor ao engolir (odinofagia)" },
    { id: "disfagia", label: "Dificuldade para engolir (disfagia)" },
    { id: "odinodisfagia", label: "Dor + dificuldade (odino-disfagia)" },
    { id: "odinofonia", label: "Dor para falar" },
    { id: "tosse", label: "Tosse" },
    { id: "rouquidao", label: "Rouquidão/disfonia" },
    { id: "placas", label: "Placas amigdalianas" },
    { id: "febre", label: "Febre" },
    { id: "sialorreia", label: "Baba/sialorreia" },
    { id: "dispneia", label: "Falta de ar/dispneia" },
  ],
  pescoco: [
    { id: "linfonodo", label: "Gânglio/‘íngua’ no pescoço" },
    { id: "nódulo_duro", label: "Nódulo duro/fixo" },
    { id: "dor_cervical", label: "Dor cervical" },
    { id: "aumento_progressivo", label: "Aumento progressivo" },
    { id: "perda_peso", label: "Perda de peso" },
    { id: "odinofagia", label: "Dor ao engolir (odinofagia)" },
    { id: "disfagia", label: "Dificuldade para engolir" },
    { id: "rouquidao", label: "Rouquidão" },
    { id: "febre_prolong", label: "Febre prolongada" },
    { id: "trauma", label: "Trauma/infecção recente" },
  ],
};

/** Red flags simplificadas (detecção por sintomas e/ou HPI) */
const REDFLAGS = [
  { id: "via_aerea",  label: "Sinais de obstrução de via aérea (estridor, sialorreia grave, dispneia)", match: (s, h) => s.has("dispneia") || /estridor|saliva(ção|rrei)|engasgo/i.test(h) },
  { id: "mastoidite", label: "Dor retroauricular, abaulamento mastoide (suspeita de mastoidite)", match: (s, h) => /masto(i|ó)de|retroauricular/i.test(h) },
  { id: "celulite_orb", label: "Edema palpebral, dor ocular, proptose (celulite orbitária)", match: (s, h) => /orb(i|í)ta|proptose|olho inchado/i.test(h) && (s.has("rinorreia_purulenta") || s.has("dor_facial")) },
  { id: "sangramento_grave", label: "Epistaxe abundante/insuportável", match: (s, h) => s.has("epistaxe") && /muito|abundante|sem parar/i.test(h) },
  { id: "abscesso_garganta", label: "Sialorreia, trismo, voz abafada (abscesso peritonsilar/para-faríngeo)", match: (s, h) => s.has("sialorreia") || /voz de batata|trismo|trancado/i.test(h) },
];

/** Mapeamento simples: sintomas → hipóteses (score) */
const RULES = [
  {
    id: "rinites",
    name: "Rinite alérgica",
    score: (s, h) => (
      (s.has("obstrucao") + s.has("rinorreia_hialina") + s.has("espirros") + s.has("prurido_nasal")) * 2 +
      (/piora com pó|ácaro|sazonal|primavera/i.test(h) ? 2 : 0)
    ),
    domain: "nariz",
  },
  {
    id: "rsa",
    name: "Rinossinusite aguda",
    score: (s, h) => (
      (s.has("dor_facial") + s.has("rinorreia_purulenta") + s.has("obstrucao") + s.has("febre")) * 2 +
      (/mais de 10 dias|piorou|dupla piora|pos-viral|pós-viral/i.test(h) ? 2 : 0)
    ),
    domain: "nariz",
  },
  {
    id: "rsc",
    name: "Rinossinusite crônica",
    score: (s, h) => (
      (s.has("obstrucao") + s.has("hiposmia") + s.has("rinorreia_purulenta") + s.has("dor_facial")) * 1 +
      (/semanas|mes(es)?|12 semanas|3 meses|6 meses/i.test(h) ? 3 : 0)
    ),
    domain: "nariz",
  },
  {
    id: "otite_media_aguda",
    name: "Otite média aguda",
    score: (s, h) => (
      (s.has("otalgia") + s.has("febre") + s.has("plenitude")) * 2 +
      (/crianca|criança|resfriado|iv(as)?|vias a(e|é)reas superiores/i.test(h) ? 1 : 0)
    ),
    domain: "ouvido",
  },
  {
    id: "otite_externa",
    name: "Otite externa difusa",
    score: (s, h) => (
      (s.has("otalgia") + s.has("prurido_o") + s.has("otorreia")) * 2 +
      (/piscina|praia|nadar|cot(o|ó)net|umido|úmido|manipulou/i.test(h) ? 2 : 0)
    ),
    domain: "ouvido",
  },
  {
    id: "labirintite_bppv",
    name: "Vertigem posicional (VPPB) / vestibulopatia periférica",
    score: (s, h) => (
      (s.has("vertigem")) * 2 +
      (/ao deitar|virar na cama|olhar para cima|segundos|minutos/i.test(h) ? 2 : 0)
    ),
    domain: "ouvido",
  },
  {
    id: "faringoamigdalite_aguda",
    name: "Faringoamigdalite aguda",
    score: (s, h) => (
      (s.has("odinofagia") + s.has("placas") + s.has("febre")) * 2 +
      (/odinofagia|dor de garganta|contato|fam(i|í)lia/i.test(h) ? 1 : 0)
    ),
    domain: "garganta",
  },
  {
    id: "cervical_linfadenite",
    name: "Linfadenite cervical",
    score: (s, h) => (
      (s.has("linfonodo") + s.has("dor_cervical") + s.has("febre_prolong")) * 2 +
      (/infec(c|ç)ao|infecção|odonto|pele|garganta/i.test(h) ? 1 : 0)
    ),
    domain: "pescoco",
  },
];

/** Condutas/exames (sugestões didáticas para demo) */
const SUGGESTIONS = {
  rinites: [
    "Lavagem nasal com solução salina",
    "Corticosteroide nasal",
    "Anti-histamínico oral",
    "Controle ambiental (ácaros/poeira)",
  ],
  rsa: [
    "Lavagem nasal + analgésicos",
    "Reavaliação se piorar ou >10 dias",
    "Antibiótico se critérios de bacteriana",
  ],
  rsc: [
    "Tratamento clínico intensivo (3–6 meses)",
    "Corticosteroide nasal",
    "TC de seios da face se falha",
  ],
  otite_media_aguda: [
    "Analgésico/antitérmico",
    "Antibiótico conforme critérios",
    "Atenção em lactentes e febre alta",
  ],
  otite_externa: [
    "Gotas otológicas (antibiótico +/- corticoide)",
    "Evitar água/manipulação",
    "Limpeza do conduto quando indicado",
  ],
  labirintite_bppv: [
    "Manobras reposicionais (ex.: Epley)",
    "Sintomáticos por curto período",
    "Evitar imobilidade prolongada",
  ],
  faringoamigdalite_aguda: [
    "Analgésico/antitérmico",
    "Antibiótico se critérios de bacteriana",
    "Hidratação e repouso",
  ],
  cervical_linfadenite: [
    "Analgesia",
    "Antibiótico se bacteriana",
    "USG se dúvida diagnóstica",
  ],
};

/* ============================
   Renderização das Áreas/Sintomas
   ============================ */
function renderAreas() {
  const areas = ["ouvido", "nariz", "garganta", "pescoco"];
  el.areaPills.innerHTML = "";
  areas.forEach((a) => {
    const pill = document.createElement("label");
    pill.className = "pill";
    pill.innerHTML = `
      <input type="checkbox" value="${a}">
      <span>${labelArea(a)}</span>
    `;
    const input = $("input", pill);
    input.checked = state.areas.has(a);
    input.addEventListener("change", () => {
      if (input.checked) state.areas.add(a);
      else state.areas.delete(a);
      renderSymptoms();
    });
    el.areaPills.appendChild(pill);
  });
}

function labelArea(id) {
  return ({
    ouvido: "Ouvido",
    nariz: "Nariz",
    garganta: "Garganta",
    pescoco: "Pescoço",
  }[id] || id);
}

function renderSymptoms() {
  el.symptomsBox.innerHTML = "";
  const areas = [...state.areas];
  if (!areas.length) {
    el.symptomsBox.innerHTML = `<div class="muted">Selecione uma ou mais áreas acima para sugerir sintomas.</div>`;
    return;
  }
  const wrap = document.createElement("div");
  areas.forEach((area) => {
    const group = document.createElement("div");
    group.style.marginBottom = "8px";
    const hd = document.createElement("div");
    hd.className = "muted";
    hd.textContent = labelArea(area);
    hd.style.margin = "6px 0";
    group.appendChild(hd);

    const box = document.createElement("div");
    SYMPTOMS[area].forEach((sym) => {
      const pill = document.createElement("label");
      pill.className = "pill";
      pill.innerHTML = `
        <input type="checkbox" value="${sym.id}">
        <span>${sym.label}</span>
      `;
      const input = $("input", pill);
      input.checked = state.selectedSymptoms.has(sym.id);
      input.addEventListener("change", () => {
        if (input.checked) state.selectedSymptoms.add(sym.id);
        else state.selectedSymptoms.delete(sym.id);
      });
      box.appendChild(pill);
    });
    group.appendChild(box);
    wrap.appendChild(group);
  });
  el.symptomsBox.appendChild(wrap);
}

/* ============================
   Triagem – Local Heurística
   ============================ */
function triageLocal(payload) {
  // payload: { nome, idade, sexo, hpi, symptoms: [ids] }
  const s = new Set(payload.symptoms || []);
  const h = (payload.hpi || "").trim();

  // 1) Red flags
  const alarmes = REDFLAGS.filter((rf) => rf.match(s, h)).map((r) => r.label);

  // 2) Scoring das hipóteses
  const withScore = RULES.map((r) => ({
    id: r.id, name: r.name, domain: r.domain, score: r.score(s, h),
  })).filter(r => r.score > 0);

  withScore.sort((a, b) => b.score - a.score);
  const total = withScore.reduce((acc, r) => acc + r.score, 0) || 1;
  const ranked = withScore.map((r) => ({
    id: r.id, name: r.name, p: Math.round((r.score / total) * 100),
  }));

  // 3) Via (nível de atendimento)
  let via = "Ambulatorial";
  let via_reason = "Quadro sem sinais de emergência aparentes.";
  if (alarmes.length) {
    via = "Emergência";
    via_reason = "Presença de sinais de alerta que exigem avaliação imediata.";
  } else if (/febre/.test(h) || s.has("febre") || s.has("febre_prolong")) {
    via = "Preferencial";
    via_reason = "Febre/sintomas sistêmicos sugerem avaliação médica em breve.";
  }

  // 4) Diferenciais (potenciais) – “cauda” do ranking
  const potenciais = ranked.slice(3, 6);

  // 5) Condutas/Exames por top-1 (demonstração)
  const topId = ranked[0]?.id;
  const condutas = topId && SUGGESTIONS[topId] ? SUGGESTIONS[topId] : [
    "Orientações gerais conforme queixa",
    "Reavaliação clínica se piora",
  ];

  return {
    via, via_reason,
    alarmes,
    provaveis: ranked.slice(0, 3),
    potenciais,
    condutas,
  };
}

/* ============================
   Triagem – Híbrida (stub para backend)
   ============================ */
async function triageHybrid(payload) {
  // Quando o backend estiver disponível:
  // 1) Chamar API para NER/extração de sintomas e/ou ranking clínico
  // 2) “Blendar” com o resultado local (ou usar como fonte primária)
  // Aqui mantemos a experiência local, e (opcionalmente) você pode
  // simular latência ou sobrepor o ranking retornado.
  // Exemplo de uso futuro:
  //
  // const base = triageLocal(payload);
  // try {
  //   const res = await fetch(`${TRIAGE_API_BASE}/api/triage`, {...});
  //   const cloud = await res.json();
  //   return blendOutputs(base, cloud);
  // } catch {
  //   return base;
  // }
  return triageLocal(payload);
}

/* ============================
   Render – 4 blocos oficiais
   ============================ */
function renderOutputs(out) {
  const pane = el.resultPane;
  if (!out) {
    pane.innerHTML = `<div class="muted">Preencha os campos e clique em <b>Triar</b>.</div>`;
    return;
  }

  const viaClass = out.via === "Emergência" ? "danger" :
                   out.via === "Preferencial" ? "warn" : "ok";

  pane.innerHTML = `
    <div class="kpi">
      <div class="box"><span class="muted">Via:</span> <span class="via ${viaClass}">${out.via}</span></div>
      <div class="box"><span class="muted">Motivo:</span> ${sanitize(out.via_reason)}</div>
    </div>

    <div style="margin:8px 0;">
      <div class="muted" style="margin-bottom:6px;">Diagnósticos mais prováveis</div>
      <ol class="rank">
        ${out.provaveis.length ? out.provaveis.map(r => `
          <li><b>${sanitize(r.name)}</b> — ${r.p}%</li>
        `).join("") : `<div class="muted">Sem hipóteses fortes até agora.</div>`}
      </ol>
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Diferenciais / Potenciais</div>
      <div class="tags">
        ${out.potenciais?.length ? out.potenciais.map(r => `
          <span class="tag">${sanitize(r.name)}</span>
        `).join("") : `<span class="muted">—</span>`}
      </div>
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Sinais de Alerta</div>
      <ul class="alarmes">
        ${out.alarmes?.length ? out.alarmes.map(a => `<li>⚠️ ${sanitize(a)}</li>`).join("") : `<div class="muted">Nenhum identificado no momento.</div>`}
      </ul>
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Condutas / Exames sugeridos</div>
      <ul class="rank">
        ${out.condutas?.length ? out.condutas.map(c => `<li>${sanitize(c)}</li>`).join("") : `<div class="muted">—</div>`}
      </ul>
    </div>
  `;
}

/* ============================
   Ações: Triar / Limpar / Salvar / Exportar
   ============================ */
function buildPayloadFromForm() {
  return {
    nome: (el.nome.value || "").trim() || null,
    idade: el.idade.value ? Number(el.idade.value) : null,
    sexo: el.sexo.value || null,
    hpi: (el.hpi.value || "").trim(),
    symptoms: Array.from(state.selectedSymptoms),
    areas: Array.from(state.areas),
    timestamp: new Date().toISOString(),
  };
}

function onTriar() {
  const payload = buildPayloadFromForm();
  const out = triageLocal(payload);
  renderOutputs(out);
  toast("Triagem concluída.");
  // opcional: anexar out ao payload para salvar/exportar
  lastResult = { payload, out };
}

function onLimpar() {
  el.nome.value = "";
  el.idade.value = "";
  el.sexo.value = "";
  el.hpi.value = "";
  state.areas.clear();
  state.selectedSymptoms.clear();
  renderAreas();
  renderSymptoms();
  renderOutputs(null);
  toast("Campos limpos.");
  lastResult = null;
}

function onSalvar() {
  if (!lastResult) {
    toast("Faça uma triagem antes de salvar.");
    return;
  }
  const db = getDb();
  db.cases.push(lastResult);
  setDb(db);
  toast("Caso salvo localmente.");
}

function onExportar() {
  if (!lastResult) {
    toast("Faça uma triagem antes de exportar.");
    return;
  }
  const md = buildMarkdown(lastResult);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = lastResult.payload?.nome ? `-${slug(lastResult.payload.nome)}` : "";
  a.href = url;
  a.download = `ROBOTTO-triagem${name || ""}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Relatório (MD) exportado.");
}

/* ============================
   Persistência básica (localStorage)
   ============================ */
const LS_KEY = "robotto_triage_db_v1";

function getDb() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : { cases: [] };
  } catch {
    return { cases: [] };
  }
}
function setDb(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/* ============================
   Relatório Markdown (export)
   ============================ */
function buildMarkdown({ payload, out }) {
  const fmt = (x) => (x != null && x !== "" ? String(x) : "—");
  const symLabels = labelsFromIds(payload.symptoms);

  return [
    `# ROBOTTO — Triagem Otorrino`,
    ``,
    `**Nome:** ${fmt(payload.nome)}  `,
    `**Idade:** ${fmt(payload.idade)}  `,
    `**Sexo:** ${fmt(payload.sexo)}  `,
    `**Data:** ${new Date(payload.timestamp).toLocaleString()}`,
    ``,
    `## Queixa / HPI`,
    `${fmt(payload.hpi)}`,
    ``,
    `## Sintomas selecionados`,
    symLabels.length ? symLabels.map((s) => `- ${s}`).join("\n") : "—",
    ``,
    `## Resultado`,
    `**Via:** ${out.via}  `,
    `**Motivo:** ${out.via_reason}`,
    ``,
    `### Diagnósticos mais prováveis`,
    out.provaveis?.length ? out.provaveis.map((r) => `- ${r.name} — ${r.p}%`).join("\n") : "- —",
    ``,
    `### Diferenciais / Potenciais`,
    out.potenciais?.length ? out.potenciais.map((r) => `- ${r.name}`).join("\n") : "- —",
    ``,
    `### Sinais de Alerta`,
    out.alarmes?.length ? out.alarmes.map((a) => `- ⚠️ ${a}`).join("\n") : "- Nenhum identificado",
    ``,
    `### Condutas / Exames sugeridos`,
    out.condutas?.length ? out.condutas.map((c) => `- ${c}`).join("\n") : "- —",
    ``,
    `> **Aviso**: ferramenta de triagem; não substitui consulta médica.`,
    ``,
  ].join("\n");
}

/* ============================
   Helpers
   ============================ */
let lastResult = null;

function sanitize(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toast(msg) {
  el.toast.textContent = msg;
  setTimeout(() => {
    if (el.toast.textContent === msg) el.toast.textContent = "";
  }, 3000);
}

function slug(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim().replace(/\s+/g, "-").toLowerCase();
}

function labelsFromIds(ids = []) {
  const map = new Map();
  Object.keys(SYMPHACK_INDEX).forEach((k) => map.set(k, SYMPHACK_INDEX[k]));
  return (ids || []).map((id) => map.get(id) || id);
}

// índice id → label
const SYMPHACK_INDEX = (() => {
  const m = {};
  Object.entries(SYMPTOMS).forEach(([_, arr]) => {
    arr.forEach(({ id, label }) => (m[id] = label));
  });
  return m;
})();

/* ============================
   Boot
   ============================ */
function attachEvents() {
  el.btnTriar.addEventListener("click", onTriar);
  el.btnLimpar.addEventListener("click", onLimpar);
  el.btnSalvar.addEventListener("click", onSalvar);
  el.btnExportar.addEventListener("click", onExportar);

  // Enter envia triagem se foco estiver no HPI
  el.hpi.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey || !ev.shiftKey)) {
      ev.preventDefault();
      onTriar();
    }
  });
}

function initFromURL() {
  const url = new URL(location.href);
  const demo = url.searchParams.get("demo");
  if (demo === "1") {
    // Pré-preenche um cenário rápido para demo
    el.hpi.value = "Há 5 dias: obstrução nasal, rinorreia espessa, dor facial. Piora desde ontem.";
    state.areas = new Set(["nariz"]);
    state.selectedSymptoms = new Set(["obstrucao", "rinorreia_purulenta", "dor_facial", "febre"]);
  }
}

function main() {
  renderAreas();
  renderSymptoms();
  renderOutputs(null);
  attachEvents();
  initFromURL();
}

document.addEventListener("DOMContentLoaded", main);
