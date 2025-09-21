# TEMPLATE_SCHEMA.md
Template Schema (v1) — **Template‑Driven Form Engine**

This document defines the JSON schema used to render the Formulaire UI.  
The template is the **single source of truth** for sections, fields, icons, conditionals, and role visibility.

---

## 1) Top‑Level Structure

```json
{
  "version": "YYYY.MM.DD-hhmm",
  "i18n": { "default": "fr" },
  "sections": [ /* Section[] */ ]
}
```

- **version**: free string; bump on any change to the structure.
- **i18n.default**: default language key (e.g., `fr`).
- **sections**: ordered array; each renders as a collapsible card with a nav chip.

---

## 2) Section, Subsection, Field

### 2.1 Section
```json
{
  "id": "audit",
  "title": "Audit",
  "icon": "folder",
  "collapsed": false,
  "subsections": [ /* Subsection[] */ ]
}
```

- **id**: stable slug (a–z, 0–9, `-`). Must be unique per template.
- **title**: UI title.
- **icon**: Feather icon name (e.g., `folder`, `sun`, `flame`, `shield`).  
- **collapsed**: optional; default `false`.
- **subsections**: ordered array.

### 2.2 Subsection
```json
{
  "id": "incendie",
  "title": "Incendie",
  "icon": "flame",
  "fields": [ /* Field[] */ ]
}
```

- **id**: stable slug unique within the section.
- **title**: UI subtitle.
- **icon**: Feather icon for subsection header.
- **fields**: ordered array; rendered in a grid/table according to `type`.

### 2.3 Field (common)
```json
{
  "id": "puissance-crete",
  "label": "Puissance crête installée",
  "type": "number",
  "helpText": "kWc",
  "unit": "kWc",
  "level": "BOTH",
  "required": false,
  "defaultValue": null,
  "validation": { "min": 0, "max": 100000, "step": 0.1, "pattern": null },
  "visibilityRules": [ /* Rule or RuleGroup */ ]
}
```

- **id**: stable per field, unique within its subsection.
- **label**: UI label (localizable later).
- **type**: one of:
  - `text`, `textarea`, `number`, `date`, `select`, `file`,
  - `monthTable`, `yearTable`, `bool`,
  - `group` (reserved for compound fields / future)
- **helpText** (optional), **unit** (optional)
- **level**: `L1` | `L2` | `BOTH`
- **required**: boolean (default `false`)
- **defaultValue**: any (value appropriate for `type`)
- **validation** (optional):
  - `min`, `max`, `step` for numbers
  - `pattern` (regex string) for text
- **visibilityRules** (optional): show/hide this field based on other field values.

#### 2.3.1 Select fields
```json
{
  "id": "rapport",
  "label": "Rapport amiante ?",
  "type": "select",
  "options": ["Oui","Non"],
  "level": "BOTH"
}
```

#### 2.3.2 File fields
File values are stored as object metadata:
```json
{ "name": "rapport.pdf", "size": 123456, "type": "application/pdf", "url": "/uploads/..." }
```

#### 2.3.3 Month table
```json
{
  "id": "monthly-production",
  "label": "Production mensuelle",
  "type": "monthTable",
  "unit": "kWh",
  "level": "BOTH"
}
```
Data format:
```json
{
  "monthly-production": {
    "janvier": 0, "février": 0, "mars": 0, "avril": 0, "mai": 0, "juin": 0,
    "juillet": 0, "août": 0, "septembre": 0, "octobre": 0, "novembre": 0, "décembre": 0
  }
}
```

#### 2.3.4 Year table
```json
{
  "id": "conso-annees",
  "label": "Consommation par année",
  "type": "yearTable",
  "unit": "kWh",
  "years": [2020, 2021, 2022, 2023, 2024],
  "level": "BOTH"
}
```
Data format:
```json
{ "conso-annees": { "2020": 0, "2021": 0, "2022": 0, "2023": 0, "2024": 0 } }
```

---

## 3) Visibility Rules

### 3.1 Simple rule
```json
{ "when": "audit.amiante.rapport", "eq": "Non" }
```
- **when**: path `"sectionId.subsectionId.fieldId"`
- Operators (one of):
  - `eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `truthy`, `falsy`
- Examples:
```json
{ "when": "audit.incendie.rapport", "eq": "Oui" }
{ "when": "audit.amiante.avant1990", "eq": "Oui" }
{ "when": "energie.cecb.note", "in": ["A", "B"] }
```

### 3.2 Composite rules
```json
{
  "allOf": [
    { "when": "audit.amiante.rapport", "eq": "Non" },
    { "when": "audit.amiante.avant1990", "eq": "Oui" }
  ]
}
```
- `anyOf`, `allOf`, `not` may wrap simple rules or other groups.

### 3.3 Built‑in patterns
- **Rapport ?**: show file upload when `rapport == "Oui"`, show questions when `rapport == "Non"`.
- **Amiante fork**: add a follow‑up `avant1990` shown when `rapport == "Non"`; then show questions when `avant1990 == "Oui"`.

> The renderer must evaluate rules **after every change** and recalc progress on visible fields only.

---

## 4) Icons
- Use **Feather** icon names (`https://feathericons.com/`), e.g.: `flame`, `alert-triangle`, `shield`, `tool`, `zap`, `user-check`, `bar-chart-2`, `sun`, `thermometer`, `folder`.

---

## 5) Data Layout (Canonical)
All values are stored under section/subsection/field IDs:
```json
{
  "audit": {
    "amiante": {
      "rapport": "Non",
      "avant1990": "Oui",
      "details": "…"
    }
  },
  "production": {
    "pv": { "monthly-production": { "janvier": 120, "février": 98, ... } }
  }
}
```

---

## 6) Schema Validation & Lint Rules
- Unique IDs at each level (section, subsection, field).
- `visibilityRules.when` paths must refer to existing fields.
- Allowed `type`/`level`/operators only.
- Recommended: CI linter that validates the template on commit.

---

## 7) Migration Guidelines
- **Add fields**: appear with `null` values; progress updates.
- **Remove/Rename**: mark old IDs **deprecated**; hide from UI; retain data 90 days; optional mapping for migration.
- Store `template.version` with each save to support re-render & migration.

---

## 8) Example Template
A full example extracted from the current `index.html` is provided as `template.example.json` and includes deterministic random `level`s for illustration.
