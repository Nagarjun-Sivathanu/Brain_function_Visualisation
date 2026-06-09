# Brain Regions — Master Index

Generated from `cleaned_brain_anatomy.json`. Covers all regions at hierarchy **levels 1–3** (numbering prefixes `1)`, `2)`, `3)`). Levels 4–8 are intentionally excluded.

Each region has three files in its folder:
- **`*_summary.md`** — detailed functional + behavioural description with scientific sources
- **`*_agent_prompt.md`** — system-prompt-style instructions to make an AI agent mimic the region
- **`script_*.json`** — reference links as a JSON dictionary

**Total: 13 regions × 3 files = 39 files.**

---

## Hierarchy Tree

```
Brain (L1)
├── rhombencephalon / hindbrain (L2)
│   ├── metencephalon (L3) → pons, cerebellum
│   ├── medulla oblongata (L3)
│   └── fourth ventricle (L3)
├── prosencephalon / forebrain (L2)
│   ├── diencephalon (L3)
│   └── telencephalon (L3)
└── midbrain / mesencephalon (L2)
    ├── part of midbrain (L3)
    ├── right side of midbrain (L3)
    ├── left side of midbrain (L3)
    └── aqueduct (L3)
```

---

## Level 1 — Root

| Region | Summary | Agent Prompt | References (JSON) |
|---|---|---|---|
| **Brain** | [summary](Brain/Brain_summary.md) | [agent prompt](Brain/Brain_agent_prompt.md) | [script](Brain/script_Brain.json) |

## Level 2 — Primary Divisions

| Region | Summary | Agent Prompt | References (JSON) |
|---|---|---|---|
| **rhombencephalon** (hindbrain) | [summary](rhombencephalon/rhombencephalon_summary.md) | [agent prompt](rhombencephalon/rhombencephalon_agent_prompt.md) | [script](rhombencephalon/script_rhombencephalon.json) |
| **prosencephalon** (forebrain) | [summary](prosencephalon/prosencephalon_summary.md) | [agent prompt](prosencephalon/prosencephalon_agent_prompt.md) | [script](prosencephalon/script_prosencephalon.json) |
| **midbrain** (mesencephalon) | [summary](midbrain/midbrain_summary.md) | [agent prompt](midbrain/midbrain_agent_prompt.md) | [script](midbrain/script_midbrain.json) |

## Level 3 — Subdivisions

### Under rhombencephalon (hindbrain)

| Region | Summary | Agent Prompt | References (JSON) |
|---|---|---|---|
| **metencephalon** | [summary](metencephalon/metencephalon_summary.md) | [agent prompt](metencephalon/metencephalon_agent_prompt.md) | [script](metencephalon/script_metencephalon.json) |
| **medulla oblongata** | [summary](medulla%20oblongata/medulla%20oblongata_summary.md) | [agent prompt](medulla%20oblongata/medulla%20oblongata_agent_prompt.md) | [script](medulla%20oblongata/script_medulla%20oblongata.json) |
| **fourth ventricle** | [summary](fourth%20ventricle/fourth%20ventricle_summary.md) | [agent prompt](fourth%20ventricle/fourth%20ventricle_agent_prompt.md) | [script](fourth%20ventricle/script_fourth%20ventricle.json) |

### Under prosencephalon (forebrain)

| Region | Summary | Agent Prompt | References (JSON) |
|---|---|---|---|
| **diencephalon** | [summary](diencephalon/diencephalon_summary.md) | [agent prompt](diencephalon/diencephalon_agent_prompt.md) | [script](diencephalon/script_diencephalon.json) |
| **telencephalon** (cerebrum) | [summary](telencephalon/telencephalon_summary.md) | [agent prompt](telencephalon/telencephalon_agent_prompt.md) | [script](telencephalon/script_telencephalon.json) |

### Under midbrain (mesencephalon)

| Region | Summary | Agent Prompt | References (JSON) |
|---|---|---|---|
| **part of midbrain** | [summary](part%20of%20midbrain/part%20of%20midbrain_summary.md) | [agent prompt](part%20of%20midbrain/part%20of%20midbrain_agent_prompt.md) | [script](part%20of%20midbrain/script_part%20of%20midbrain.json) |
| **right side of midbrain** | [summary](right%20side%20of%20midbrain/right%20side%20of%20midbrain_summary.md) | [agent prompt](right%20side%20of%20midbrain/right%20side%20of%20midbrain_agent_prompt.md) | [script](right%20side%20of%20midbrain/script_right%20side%20of%20midbrain.json) |
| **left side of midbrain** | [summary](left%20side%20of%20midbrain/left%20side%20of%20midbrain_summary.md) | [agent prompt](left%20side%20of%20midbrain/left%20side%20of%20midbrain_agent_prompt.md) | [script](left%20side%20of%20midbrain/script_left%20side%20of%20midbrain.json) |
| **aqueduct** (cerebral aqueduct) | [summary](aqueduct/aqueduct_summary.md) | [agent prompt](aqueduct/aqueduct_agent_prompt.md) | [script](aqueduct/script_aqueduct.json) |

---

## Notes

- **Scope:** Only levels 1–3 are included, per request (levels 4–8 excluded). The example region from the original prompt — *"white matter of left hemisphere of cerebellum"* — is a level-6 node and was therefore used only as a format template, not generated.
- **Container/laterality nodes:** *"part of midbrain"*, *"right side of midbrain"*, and *"left side of midbrain"* are not single named nuclei but compartment nodes in the source hierarchy; they are described as the midline-core and left/right hemilateral midbrain compartments (with the colliculi, red nucleus, and substantia nigra embedded).
- **Sources:** Every region was researched via live web search (NCBI/StatPearls, Wikipedia, Kenhub, ScienceDirect, TeachMeAnatomy, AMBOSS, UTHealth Neuroscience Online, Springer, Britannica, and others). Citations appear at the end of each `*_summary.md` and in each `script_*.json`.
