/* ============================================================================
   ROBOTTO – Triagem Otorrino (MVP com NLP de sintomas no texto livre)
   Arquivo: main.js
   ============================================================================ */

const $ = (sel, root = document) => root.querySelector(sel);

/* --------------------------
   Elementos
-------------------------- */
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

/* --------------------------
   Estado
-------------------------- */
const state = {
  areas: new Set(),            // "ouvido" | "nariz" | "garganta" | "pescoco"
  selectedSymptoms: new Set(), // ids dos chips marcados
};

const AUTO_MARK_CHIPS = false; // se true, marca visualmente sintomas extraídos do texto

/* --------------------------
   Catálogo de sintomas (MVP)
-------------------------- */
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
    { id: "tosse", label: "Tosse" },
    { id: "rouquidao", label: "Rouquidão/disfonia" },
    { id: "placas", label: "Placas amigdalianas" },
    { id: "sialorreia", label: "Baba/sialorreia" },
    { id: "dispneia", label: "Falta de ar/dispneia" },
    { id: "febre", label: "Febre" },
  ],
  pescoco: [
    { id: "linfonodo", label: "Gânglio/‘íngua’ no pescoço" },
    { id: "nodulo_duro", label: "Nódulo duro/fixo" },
    { id: "dor_cervical", label: "Dor cervical" },
    { id: "aumento_progressivo", label: "Aumento progressivo" },
    { id: "perda_peso", label: "Perda de peso" },
    { id: "febre_prolong", label: "Febre prolongada" },
    { id: "trauma", label: "Trauma/infecção recente" },
  ],
};

/* Índices auxiliares */
const SYMPTOM_AREA = (() => {
  const m = new Map();
  Object.entries(SYMPTOMS).forEach(([area, arr]) =>
    arr.forEach(s => m.set(s.id, area))
  );
  return m;
})();
const SYMPTOM_LABEL = (() => {
  const m = new Map();
  Object.values(SYMPTOMS).flat().forEach(s => m.set(s.id, s.label));
  return m;
})();

/* --------------------------
   NLP leve: extrair sintomas do HPI
-------------------------- */
const NLP_PATTERNS = [
  // OUVIDO
  { id: "otalgia", re: /\b(dor(?: no| de)? (?:ouvido|orelha)|otalgia)\b/i },
  { id: "plenitude", re: /\b(ouvido(?:s)? (?:tampad[oa]s?|tapad[oa]s?|entupid[oa]s?)|plenitude)\b/i },
  { id: "otorreia", re: /\b(otorr(e|é)ia|secre[cç][aã]o.*(ouvido|orelha)|corrimento.*(ouvido|orelha))\b/i },
  { id: "hipoacusia", re: /\b(dificuldade (?:de|para) ouvir|queda de audi(?:ç|c)[aã]o|hipoacusia|surdez)\b/i },
  { id: "tinitus", re: /\b(zumbido|tinnitus)\b/i },
  { id: "vertigem", re: /\b(vertigem|tontura|tonteira|labirintite)\b/i },

  // NARIZ
  { id: "obstrucao", re: /\b(nariz (?:entupido|obstru[ií]do)|obstru[cç][aã]o nasal|congest[aã]o nasal)\b/i },
  { id: "rinorreia_hialina", re: /\b(coriza|secre[cç][aã]o aquosa|aguad[ao]|hialin[ao])\b/i },
  { id: "rinorreia_purulenta", re: /\b(catarro|secre[cç][aã]o (?:espessa|purulenta)|amarelada|esverdeada)\b/i },
  { id: "espirros", re: /\b(espirros?)\b/i },
  { id: "prurido_nasal", re: /\b(coceira (?:no )?nariz|prurido nasal)\b/i },
  { id: "hiposmia", re: /\b(n[aã]o (?:sinto|consigo) cheirar|perda de olfato|anosmia|hiposmia)\b/i },
  { id: "dor_facial", re: /\b((dor|press[aã]o) (na )?face|maxilar|ma[cç][aã]s do rosto)\b/i },
  { id: "epistaxe", re: /\b(epistaxe|sangramento(?: pelo)? nariz|nariz sangrand[oa])\b/i },
  { id: "cefaleia", re: /\b(cefaleia|dor de cabe[cç]a)\b/i },

  // GARGANTA
  { id: "odinofagia", re: /\b(dor(?: ao)? engolir|odinofagia|garganta (?:doendo|dolorida))\b/i },
  { id: "disfagia", re: /\b(dificuldade (?:para|de) engolir|engasgar|disfagia)\b/i },
  { id: "rouquidao", re: /\b(rouquid[aã]o|voz rouca|disfonia)\b/i },
  { id: "tosse", re: /\b(tosse|tossindo)\b/i },
  { id: "placas", re: /\b(placas?|pontos?) (?:nas )?am[ií]gdal(as)?\b/i },
  { id: "sialorreia", re: /\b(baba|saliva (?:escorrendo|excessiva)|sialorreia)\b/i },
  { id: "dispneia", re: /\b(falta de ar|dispneia|dif[ií]cil respirar|respirando mal)\b/i },

  // PESCOÇO
  { id: "linfonodo", re: /\b((g[aâ]nglio|[ií]ngua|caro[cç]o|n[oó]dulo).*(pesco[cç]o)|caro[cç]o no pesco[cç]o)\b/i },
  { id: "nodulo_duro", re: /\b(n[oó]dulo (?:duro|fixo))\b/i },
  { id: "dor_cervical", re: /\b(dor (?:no )?pesco[cç]o|cervicalgia)\b/i },
  { id: "aumento_progressivo", re: /\b(aument(?:ou|ando) de tamanho|crescendo)\b/i },
  { id: "perda_peso", re: /\b(perda de peso|emagrecimento)\b/i },

  // GERAIS
  { id: "febre", re: /\b(febre|febril|38(\.|,)?\d)/i },
  { id: "febre_prolong", re: /\b(febre (?:persistente|prolongada)|febre h[aá] (?:dias|semanas))\b/i },
  { id: "trauma", re: /\b(trauma|batida|queda|acidente)\b/i },
  { id: "prurido_o", re: /\b(coceira (?:no )?(ouvido|orelha))\b/i },
];

function extractSymptomsFromText(hpi = "") {
  const found = new Set();
  const text = ` ${hpi} `.normalize("NFC");
  NLP_PATTERNS.forEach(p => { if (p.re.test(text)) found.add(p.id); });
  return [...found];
}

function inferAreasFromSymptoms(symptoms = []) {
  const areas = new Set();
  symptoms.forEach(id => { const a = SYMPTOM_AREA.get(id); if (a) areas.add(a); });
  return [...areas];
}

/* --------------------------
   Red flags (reforçadas)
-------------------------- */
const REDFLAGS = [
  {
    id: "via_aerea",
    label: "Sinais de obstrução de via aérea (estridor, sialorreia grave, dispneia)",
    match: (s, h) => s.has("dispneia") || s.has("sialorreia") || /\bestridor\b/i.test(h),
  },
  {
    id: "mastoidite",
    label: "Dor retroauricular, abaulamento mastoide (suspeita de mastoidite)",
    match: (s, h) => /masto(i|ó)de|retroauricular/i.test(h),
  },
  {
    id: "celulite_orb",
    label: "Edema palpebral, dor ocular, proptose (celulite orbitária)",
    match: (s, h) => (s.has("rinorreia_purulenta") || s.has("dor_facial")) && /orb(i|í)ta|proptose|olho inchado/i.test(h),
  },
  {
    id: "sangramento_grave",
    label: "Epistaxe abundante/inescapável",
    match: (s, h) => s.has("epistaxe") && /(abundante|sem parar|grande volume)/i.test(h),
  },
  {
    id: "abscesso_garganta",
    label: "Sialorreia, trismo, voz abafada (abscesso peri/para-faríngeo)",
    match: (s, h) => s.has("sialorreia") || /voz de batata|trismo/i.test(h),
  },
];

/* --------------------------
   Regras de escore (hipóteses)
-------------------------- */
const RULES = [
  {
    id: "rinites", name: "Rinite alérgica", domain: "nariz",
    score: (s, h) =>
      (s.has("obstrucao") + s.has("rinorreia_hialina") + s.has("espirros") + s.has("prurido_nasal")) * 2 +
      (/pó|poeira|ácaro|sazonal|primavera|alerg/i.test(h) ? 2 : 0),
  },
  {
    id: "rsa", name: "Rinossinusite aguda", domain: "nariz",
    score: (s, h) =>
      (s.has("dor_facial") + s.has("rinorreia_purulenta") + s.has("obstrucao") + s.has("febre")) * 2 +
      (/10\s*dias|piorou|dupla piora|pos-?viral|pós-?viral/i.test(h) ? 2 : 0),
  },
  {
    id: "rsc", name: "Rinossinusite crônica", domain: "nariz",
    score: (s, h) =>
      (s.has("obstrucao") + s.has("hiposmia") + s.has("rinorreia_purulenta") + s.has("dor_facial")) * 1 +
      (/semanas|mes(es)?|12 semanas|3 meses|6 meses/i.test(h) ? 3 : 0),
  },
  {
    id: "otite_media_aguda", name: "Otite média aguda", domain: "ouvido",
    score: (s, h) =>
      (s.has("otalgia") + s.has("febre") + s.has("plenitude")) * 2 +
      (/crian(c|ç)a|resfriado|vias a(e|é)reas superiores|IVAS/i.test(h) ? 1 : 0),
  },
  {
    id: "otite_externa", name: "Otite externa difusa", domain: "ouvido",
    score: (s, h) =>
      (s.has("otalgia") + s.has("prurido_o") + s.has("otorreia")) * 2 +
      (/piscina|praia|nadar|cot(o|ó)net|cotonet|[úu]mido|manipulou/i.test(h) ? 2 : 0),
  },
  {
    id: "labirintite_bppv", name: "Vertigem posicional (VPPB) / vestibulopatia periférica", domain: "ouvido",
    score: (s, h) =>
      (s.has("vertigem")) * 2 + (/deitar|virar na cama|olhar para cima|segundos|minutos/i.test(h) ? 2 : 0),
  },
  {
    id: "faringoamigdalite_aguda", name: "Faringoamigdalite aguda", domain: "garganta",
    score: (s, h) =>
      (s.has("odinofagia") + s.has("placas") + s.has("febre")) * 2 +
      (/dor de garganta|contato|fam(i|í)lia|adenite/i.test(h) ? 1 : 0),
  },
  {
    id: "cervical_linfadenite", name: "Linfadenite cervical", domain: "pescoco",
    score: (s, h) =>
      (s.has("linfonodo") + s.has("dor_cervical") + s.has("febre_prolong")) * 2 +
      (/infec(c|ç)ao|infecção|odonto|pele|garganta/i.test(h) ? 1 : 0),
  },
];

/* Sugestões didáticas */
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
    "Gotas otológicas (ATB +/- corticoide)",
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

/* --------------------------
   Renderização Áreas / Sintomas
-------------------------- */
function labelArea(id){ return ({ouvido:"Ouvido", nariz:"Nariz", garganta:"Garganta", pescoco:"Pescoço"}[id]||id); }

function renderAreas(){
  const areas = ["ouvido","nariz","garganta","pescoco"];
  el.areaPills.innerHTML = "";
  areas.forEach(a=>{
    const pill = document.createElement("label");
    pill.className = "pill";
    pill.innerHTML = `<input type="checkbox" value="${a}"><span>${labelArea(a)}</span>`;
    const input = $("input", pill);
    input.checked = state.areas.has(a);
    input.addEventListener("change",()=>{
      if (input.checked) state.areas.add(a); else state.areas.delete(a);
      renderSymptoms();
    });
    el.areaPills.appendChild(pill);
  });
}

function renderSymptoms(){
  el.symptomsBox.innerHTML = "";
  const areas = [...state.areas];
  if (!areas.length){
    el.symptomsBox.innerHTML = `<div class="muted">Selecione uma ou mais áreas acima para sugerir sintomas.</div>`;
    return;
  }
  const frag = document.createDocumentFragment();
  areas.forEach(area=>{
    const group = document.createElement("div");
    group.style.marginBottom = "10px";
    group.innerHTML = `<div class="muted" style="margin:6px 0">${labelArea(area)}</div>`;
    const box = document.createElement("div");
    SYMPTOMS[area].forEach(sym=>{
      const pill = document.createElement("label");
      pill.className = "pill";
      pill.innerHTML = `<input type="checkbox" value="${sym.id}"><span>${sym.label}</span>`;
      const input = $("input", pill);
      input.checked = state.selectedSymptoms.has(sym.id);
      input.addEventListener("change",()=>{
        if (input.checked) state.selectedSymptoms.add(sym.id);
        else state.selectedSymptoms.delete(sym.id);
      });
      box.appendChild(pill);
    });
    group.appendChild(box);
    frag.appendChild(group);
  });
  el.symptomsBox.appendChild(frag);
}

/* --------------------------
   Triagem Local (com união HPI→sintomas)
-------------------------- */
function triageLocal(payload){
  // 1) extrair sintomas do texto
  const fromText = extractSymptomsFromText(payload.hpi);
  // 2) unir com os chips (sem alterar UI visual)
  const allSymptoms = new Set([...(payload.symptoms||[]), ...fromText]);

  // 3) inferir áreas se usuário não marcou nenhuma
  let areas = new Set(payload.areas||[]);
  if (areas.size === 0){
    inferAreasFromSymptoms([...allSymptoms]).forEach(a=>areas.add(a));
  }
  // opcional: marcar visualmente
  if (AUTO_MARK_CHIPS){
    state.selectedSymptoms = new Set(allSymptoms);
    state.areas = new Set(areas);
    renderAreas(); renderSymptoms();
  }

  const s = allSymptoms;
  const h = (payload.hpi||"").trim();

  // Red flags
  const alarmes = REDFLAGS.filter(r => r.match(s, h)).map(r => r.label);

  // Escore
  const scored = RULES.map(r=>({ id:r.id, name:r.name, domain:r.domain, score:r.score(s,h) }))
                      .filter(r=>r.score>0);
  scored.sort((a,b)=>b.score-a.score);
  const total = scored.reduce((acc,r)=>acc+r.score,0) || 1;
  const ranked = scored.map(r=>({ id:r.id, name:r.name, p: Math.round(r.score/total*100) }));

  // Via
  let via = "Ambulatorial", via_reason = "Quadro sem sinais de emergência aparentes.";
  if (alarmes.length){ via = "Emergência"; via_reason = "Presença de sinais de alerta que exigem avaliação imediata."; }
  else if (/febre/.test(h) || s.has("febre") || s.has("febre_prolong")){ via = "Preferencial"; via_reason = "Febre/sintomas sistêmicos sugerem avaliação médica em breve."; }

  const potenciais = ranked.slice(3,6);
  const topId = ranked[0]?.id;
  const condutas = topId && SUGGESTIONS[topId] ? SUGGESTIONS[topId] : [
    "Orientações gerais conforme queixa",
    "Reavaliação clínica se piora",
  ];

  return { via, via_reason, alarmes, provaveis: ranked.slice(0,3), potenciais, condutas };
}

/* --------------------------
   (Stub) Triagem Híbrida
-------------------------- */
async function triageHybrid(payload){
  // pronto para integrar backend no futuro; por ora, usamos o local
  return triageLocal(payload);
}

/* --------------------------
   Render dos 4 blocos
-------------------------- */
function renderOutputs(out){
  const pane = el.resultPane;
  if (!out){
    pane.innerHTML = `<div class="muted">Preencha os campos e clique em <b>Triar</b>.</div>`;
    return;
  }
  const viaClass = out.via === "Emergência" ? "danger" : out.via === "Preferencial" ? "warn" : "ok";
  pane.innerHTML = `
    <div class="kpi">
      <div class="box"><span class="muted">Via:</span> <span class="via ${viaClass}">${out.via}</span></div>
      <div class="box"><span class="muted">Motivo:</span> ${escapeHTML(out.via_reason)}</div>
    </div>

    <div style="margin:8px 0;">
      <div class="muted" style="margin-bottom:6px;">Diagnósticos mais prováveis</div>
      ${out.provaveis.length
        ? `<ol class="rank">${out.provaveis.map(r=>`<li><b>${escapeHTML(r.name)}</b> — ${r.p}%</li>`).join("")}</ol>`
        : `<div class="muted">Sem hipóteses fortes até agora.</div>`
      }
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Diferenciais / Potenciais</div>
      <div class="tags">
        ${out.potenciais?.length ? out.potenciais.map(r=>`<span class="tag">${escapeHTML(r.name)}</span>`).join("") : `<span class="muted">—</span>`}
      </div>
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Sinais de Alerta</div>
      ${out.alarmes?.length ? `<ul class="alarmes">${out.alarmes.map(a=>`<li>⚠️ ${escapeHTML(a)}</li>`).join("")}</ul>` : `<div class="muted">Nenhum identificado no momento.</div>`}
    </div>

    <div style="margin:12px 0;">
      <div class="muted" style="margin-bottom:6px;">Condutas / Exames sugeridos</div>
      ${out.condutas?.length ? `<ul class="rank">${out.condutas.map(c=>`<li>${escapeHTML(c)}</li>`).join("")}</ul>` : `<div class="muted">—</div>`}
    </div>
  `;
}

/* --------------------------
   Form / Ações
-------------------------- */
function buildPayloadFromForm(){
  return {
    nome: (el.nome.value||"").trim() || null,
    idade: el.idade.value ? Number(el.idade.value) : null,
    sexo: el.sexo.value || null,
    hpi: (el.hpi.value||"").trim(),
    symptoms: [...state.selectedSymptoms],
    areas: [...state.areas],
    timestamp: new Date().toISOString(),
  };
}

let lastResult = null;

async function onTriar(){
  const payload = buildPayloadFromForm();
  const out = await triageHybrid(payload);
  lastResult = { payload, out };
  renderOutputs(out);
  toast("Triagem concluída.");
}

function onLimpar(){
  el.nome.value = ""; el.idade.value = ""; el.sexo.value = ""; el.hpi.value = "";
  state.areas.clear(); state.selectedSymptoms.clear();
  renderAreas(); renderSymptoms(); renderOutputs(null);
  lastResult = null; toast("Campos limpos.");
}

function onSalvar(){
  if (!lastResult){ toast("Faça uma triagem antes de salvar."); return; }
  const db = getDb(); db.cases.push(lastResult); setDb(db); toast("Caso salvo localmente.");
}

function onExportar(){
  if (!lastResult){ toast("Faça uma triagem antes de exportar."); return; }
  const md = buildMarkdown(lastResult);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const name = lastResult.payload?.nome ? `-${slug(lastResult.payload.nome)}` : "";
  a.href = url; a.download = `ROBOTTO-triagem${name}.md`; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url); toast("Relatório (MD) exportado.");
}

/* --------------------------
   Persistência leve
-------------------------- */
const LS_KEY = "robotto_triage_db_v1";
const getDb = () => { try{ const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : {cases:[]}; } catch { return {cases:[]}; } };
const setDb = (db) => localStorage.setItem(LS_KEY, JSON.stringify(db));

/* --------------------------
   Markdown
-------------------------- */
function buildMarkdown({ payload, out }){
  const fmt = (x)=> (x!=null && x!=="") ? String(x) : "—";
  const symLabels = (payload.symptoms||[]).map(id => SYMPTOM_LABEL.get(id)||id);
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
    symLabels.length ? symLabels.map(s=>`- ${s}`).join("\n") : "—",
    ``,
    `## Resultado`,
    `**Via:** ${out.via}  `,
    `**Motivo:** ${out.via_reason}`,
    ``,
    `### Diagnósticos mais prováveis`,
    out.provaveis?.length ? out.provaveis.map(r=>`- ${r.name} — ${r.p}%`).join("\n") : "- —",
    ``,
    `### Diferenciais / Potenciais`,
    out.potenciais?.length ? out.potenciais.map(r=>`- ${r.name}`).join("\n") : "- —",
    ``,
    `### Sinais de Alerta`,
    out.alarmes?.length ? out.alarmes.map(a=>`- ⚠️ ${a}`).join("\n") : "- Nenhum identificado",
    ``,
    `### Condutas / Exames sugeridos`,
    out.condutas?.length ? out.condutas.map(c=>`- ${c}`).join("\n") : "- —",
    ``,
    `> **Aviso**: ferramenta de triagem; não substitui consulta médica.`,
    ``,
  ].join("\n");
}

/* --------------------------
   Helpers
-------------------------- */
function escapeHTML(str){ return String(str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function toast(msg){ el.toast.textContent = msg; setTimeout(()=>{ if(el.toast.textContent===msg) el.toast.textContent=""; }, 3000); }
function slug(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-").toLowerCase(); }

/* --------------------------
   Boot
-------------------------- */
function attachEvents(){
  el.btnTriar.addEventListener("click", onTriar);
  el.btnLimpar.addEventListener("click", onLimpar);
  el.btnSalvar.addEventListener("click", onSalvar);
  el.btnExportar.addEventListener("click", onExportar);
  el.hpi.addEventListener("keydown", (ev)=>{
    if (ev.key==="Enter" && (ev.ctrlKey || ev.metaKey || !ev.shiftKey)){
      ev.preventDefault(); onTriar();
    }
  });
}
function initFromURL(){
  const url = new URL(location.href);
  if (url.searchParams.get("demo")==="1"){
    el.hpi.value = "Há 5 dias: ouvido tampado e dor de ouvido; coriza espessa e dor na face. Piorou ontem.";
    state.areas = new Set(); // deixamos vazio para a inferência automática
  }
}

function main(){ renderAreas(); renderSymptoms(); renderOutputs(null); attachEvents(); initFromURL(); }
document.addEventListener("DOMContentLoaded", main);
