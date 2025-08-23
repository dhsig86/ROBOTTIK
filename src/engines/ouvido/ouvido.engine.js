const ouvidoEngine = {
  "version": "2.0.0",
  "area": "ouvido",
  "intake": {
    "symptoms": [
      { "id": "otalgia", "label": "Dor de ouvido", "aliases": ["dor no ouvido", "dor auricular"], "weights": 1.0 },
      { "id": "otorreia", "label": "Saída de secreção pelo ouvido", "aliases": ["pús no ouvido", "vazamento de ouvido"], "weights": 1.0 },
      { "id": "hipoacusia", "label": "Diminuição da audição", "aliases": ["surdez", "ouvir menos"], "weights": 1.0 },
      { "id": "plenitude_auricular", "label": "Sensação de ouvido tampado", "aliases": ["pressão no ouvido", "entupido"], "weights": 1.0 },
      { "id": "prurido_auricular", "label": "Coceira no ouvido", "aliases": ["coçando o ouvido"], "weights": 1.0 },
      { "id": "zumbido", "label": "Zumbido", "aliases": ["apito no ouvido", "chiado no ouvido"], "weights": 0.8 },
      { "id": "vertigem", "label": "Tontura/vertigem", "aliases": ["rotatória", "girando"], "weights": 1.0 },
      { "id": "febre", "label": "Febre", "aliases": [], "weights": 0.8 },
      { "id": "dor_trago_pavilhao", "label": "Dor à pressão no tragus ou ao tracionar a orelha", "aliases": ["dor no tragus", "dor ao puxar a orelha"], "weights": 1.2 },
      { "id": "edema_conduto", "label": "Inchaço do conduto auditivo", "aliases": ["conduto inchado", "canal inchado"], "weights": 1.0 },
      { "id": "hiperemia_mt", "label": "Vermelhidão da membrana timpânica", "aliases": ["tímpano vermelho"], "weights": 1.0 },
      { "id": "perfuracao_mt", "label": "Perfuração no tímpano", "aliases": ["furo no tímpano"], "weights": 1.0 },
      { "id": "natacao_recente", "label": "Natação/banho de piscina recente", "aliases": ["entrou na piscina", "mar/água"], "weights": 0.8 },
      { "id": "voo_mergulho_recente", "label": "Voo ou mergulho recente", "aliases": ["pressão do avião", "mergulho"], "weights": 0.8 },
      { "id": "diabetes_imunossupressao", "label": "Diabetes ou imunossupressão", "aliases": ["baixa imunidade", "imunodeficiência"], "weights": 0.8 },
      { "id": "q_tip_uso", "label": "Uso de haste flexível / cotonete", "aliases": ["cotonete", "limpar o ouvido"], "weights": 0.6 },
      { "id": "trauma_auricular", "label": "Trauma no ouvido", "aliases": ["pancada no ouvido", "corpo estranho"], "weights": 0.8 },
      { "id": "cefaleia", "label": "Cefaleia", "aliases": ["dor de cabeça"], "weights": 0.6 },
      { "id": "posicional", "label": "Vertigem desencadeada por posição", "aliases": ["piora ao deitar", "piora ao virar na cama"], "weights": 1.0 },
      { "id": "dor_noturna_intensa", "label": "Dor noturna intensa", "aliases": [], "weights": 1.2 },
      { "id": "paralisia_facial", "label": "Fraqueza/paralisia facial", "aliases": [], "weights": 1.5 },
      { "id": "granulacao_conduto", "label": "Granulação no conduto", "aliases": [], "weights": 1.2 },
      { "id": "sinais_neurologicos_focais", "label": "Sinais neurológicos focais", "aliases": [], "weights": 1.5 },
      { "id": "surdidez_subita", "label": "Perda auditiva súbita", "aliases": [], "weights": 1.5 }
    ],
    "modifiers": [
      { "id": "duracao_dias", "type": "number", "unit": "d" },
      { "id": "piora_48_72h", "type": "boolean" },
      { "id": "laterality", "type": "categorical", "levels": ["dir", "esq", "bilateral"] },
      { "id": "intensidade_dor", "type": "ordinal", "levels": ["leve", "moderada", "intensa"] }
    ]
  },
  "dx": [
    {
      "id": "otite_media_aguda",
      "label": "Otite Média Aguda",
      "pretest": 0.12,
      "criteria": [
        { "if": ["otalgia"], "lr+": 4.0 },
        { "if": ["febre"], "lr+": 1.6 },
        { "if": ["hiperemia_mt"], "lr+": 2.0 },
        { "if": ["piora_48_72h"], "weight": 1.2 }
      ],
      "heuristics": [],
      "red_flags": ["mastoidite_suspeita"]
    },
    {
      "id": "otite_media_com_efusao",
      "label": "Otite Média com Efusão (Sero-mucosa)",
      "pretest": 0.08,
      "criteria": [
        { "if": ["plenitude_auricular"], "lr+": 2.0 },
        { "if": ["hipoacusia"], "lr+": 1.5 },
        { "if": ["febre"], "lr-": 0.6 }
      ],
      "heuristics": [
        { "when": ["duracao_dias"], "boost": 1.1 }
      ],
      "red_flags": []
    },
    {
      "id": "otite_externa_aguda",
      "label": "Otite Externa Aguda",
      "pretest": 0.10,
      "criteria": [
        { "if": ["dor_trago_pavilhao"], "lr+": 3.5 },
        { "if": ["edema_conduto"], "lr+": 3.0 },
        { "if": ["natacao_recente"], "lr+": 1.5 },
        { "if": ["otorreia"], "lr+": 1.4 }
      ],
      "heuristics": [
        { "when": ["prurido_auricular"], "boost": 1.2 }
      ],
      "red_flags": []
    },
    {
      "id": "otite_externa_maligna",
      "label": "Otite Externa Maligna (Necrosante)",
      "pretest": 0.005,
      "criteria": [
        { "if": ["dor_trago_pavilhao", "edema_conduto"], "lr+": 2.0 },
        { "if": ["diabetes_imunossupressao"], "lr+": 3.0 },
        { "if": ["dor_noturna_intensa"], "weight": 1.5 }
      ],
      "heuristics": [],
      "red_flags": ["dor_noturna_intensa", "paralisia_facial", "granulacao_conduto"]
    },
    {
      "id": "cerume_impactado",
      "label": "Tampão de Cerume (Impactação)",
      "pretest": 0.08,
      "criteria": [
        { "if": ["hipoacusia"], "lr+": 1.6 },
        { "if": ["plenitude_auricular"], "lr+": 1.8 },
        { "if": ["q_tip_uso"], "lr+": 1.3 },
        { "if": ["prurido_auricular"], "lr+": 1.2 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "otomicose",
      "label": "Otomicose",
      "pretest": 0.05,
      "criteria": [
        { "if": ["prurido_auricular"], "lr+": 2.0 },
        { "if": ["otorreia"], "lr+": 1.4 },
        { "if": ["natacao_recente"], "lr+": 1.3 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "perfuracao_timpanica",
      "label": "Perfuração Timpânica",
      "pretest": 0.03,
      "criteria": [
        { "if": ["perfuracao_mt"], "lr+": 4.0 },
        { "if": ["otorreia"], "lr+": 1.6 },
        { "if": ["trauma_auricular", "voo_mergulho_recente"], "lr+": 1.8 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "barotrauma_otico",
      "label": "Barotrauma Ótico",
      "pretest": 0.03,
      "criteria": [
        { "if": ["voo_mergulho_recente"], "lr+": 3.0 },
        { "if": ["otalgia", "plenitude_auricular"], "lr+": 1.8 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "disfuncao_tubaria",
      "label": "Disfunção da Tuba Auditiva",
      "pretest": 0.10,
      "criteria": [
        { "if": ["plenitude_auricular"], "lr+": 2.0 },
        { "if": ["hipoacusia"], "lr+": 1.3 },
        { "if": ["hiperemia_mt"], "lr-": 0.7 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "neurite_vestibular",
      "label": "Neurite Vestibular / Labirintite viral",
      "pretest": 0.02,
      "criteria": [
        { "if": ["vertigem"], "lr+": 3.0 },
        { "if": ["hipoacusia"], "lr-": 0.7 }
      ],
      "heuristics": [],
      "red_flags": ["sinais_neurologicos_focais"]
    },
    {
      "id": "dm_meniere",
      "label": "Doença de Ménière",
      "pretest": 0.01,
      "criteria": [
        { "if": ["vertigem", "zumbido", "hipoacusia", "plenitude_auricular"], "weight": 2.0 }
      ],
      "heuristics": [],
      "red_flags": []
    },
    {
      "id": "vppb",
      "label": "Vertigem Posicional Paroxística Benigna (VPPB)",
      "pretest": 0.04,
      "criteria": [
        { "if": ["vertigem"], "lr+": 2.0 }
      ],
      "heuristics": [
        { "when": ["posicional"], "boost": 1.5 }
      ],
      "red_flags": ["sinais_neurologicos_focais"]
    },
    {
      "id": "surdidez_subita_neurossensorial",
      "label": "Perda Auditiva Súbita Neurossensorial",
      "pretest": 0.005,
      "criteria": [
        { "if": ["hipoacusia"], "lr+": 3.0 },
        { "if": ["zumbido"], "lr+": 1.5 },
        { "if": ["duracao_dias"], "weight": 1.4 }
      ],
      "heuristics": [],
      "red_flags": ["surdidez_subita"]
    },
    {
      "id": "mastoidite_aguda",
      "label": "Mastoidite Aguda",
      "pretest": 0.005,
      "criteria": [
        { "if": ["otalgia", "febre"], "lr+": 2.0 },
        { "if": ["cefaleia"], "lr+": 1.3 }
      ],
      "heuristics": [
        { "when": ["piora_48_72h"], "boost": 1.4 }
      ],
      "red_flags": ["mastoidite_suspeita"]
    }
  ],
  "profiles": {
    "crianca": { "multipliers": { "otite_media_aguda": 1.25, "otite_externa_aguda": 0.9, "otite_media_com_efusao": 1.15 } },
    "idoso": { "multipliers": { "otite_externa_maligna": 1.30 } }
  },
  "via_atendimento": {
    "mastoidite_suspeita": "emergencia_especializada",
    "surdidez_subita": "emergencia_especializada",
    "sinais_neurologicos_focais": "emergencia_geral",
    "paralisia_facial": "emergencia_especializada",
    "granulacao_conduto": "ambulatorio_rotina"
  }
};

export default ouvidoEngine;
