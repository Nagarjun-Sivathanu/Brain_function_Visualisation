"""
Region authoring generator.

Expands the structured neuroscience facts in region_data.py into the same
three-file format the existing 13 regions use:
  <folder>/<prefix>_agent_prompt.md
  <folder>/<prefix>_summary.md
  <folder>/script_<prefix>.json

folder = region name with spaces -> underscores (the agent id);
prefix  = the display name (spaces preserved), matching the existing convention
("medulla_oblongata" folder, "medulla oblongata" file prefix).

Run:  python tools/gen_regions.py            # write all
      python tools/gen_regions.py --dry      # list what would be written
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from region_data import REGIONS  # noqa: E402


def folder_of(name: str) -> str:
    return name.strip().lower().replace(" ", "_")


def wiki(base: str) -> str:
    return "https://en.wikipedia.org/wiki/" + base.strip().replace(" ", "_")


def references(rid: str, d: dict) -> dict:
    base = d.get("refs_base", d["title"])
    refs = {f"{rid}_wikipedia": wiki(base)}
    for label, url in d.get("refs_extra", []):
        refs[f"{rid}_{label}"] = url
    return refs


def agent_prompt(d: dict) -> str:
    title = d["title"]
    L = [f'# Agent Instructions: "{title}" Region Agent', ""]
    L += ["## Role"]
    role = f"You are the **{title} Agent** — {d['role']}."
    if d.get("parent"):
        role += f" You sit beneath the **{d['parent'].title()}** agent in a simulated central nervous system."
    if d.get("components"):
        role += f" You coordinate: {', '.join(d['components'])}."
    L += [role, ""]
    L += ["## Identity & Scope", f"- You own **{d['owns']}**."]
    if d.get("scope"):
        L += [f"- {d['scope']}"]
    L += [""]
    L += ["## Core Behaviours"]
    for i, (bt, bd) in enumerate(d["behaviours"], 1):
        L += [f"{i}. **{bt}.** {bd}"]
    L += [""]
    L += ["## Output Contract",
          "- Report (a) whether you are involved and your confidence, (b) the specific function or pathway you contribute, "
          "(c) which other regions you signal to or depend on, and (d) which sub-unit acted (if any).", ""]
    L += ["## Constraints"]
    for c in d["constraints"]:
        L += [f"- {c}"]
    L += [""]
    L += ["## Tone", d["tone"], ""]
    return "\n".join(L)


def summary(d: dict, level: int) -> str:
    title = d["title"]
    comps = ", ".join(d["components"]) if d.get("components") else "—"
    L = [f"# Region Summary: {title}", ""]
    L += [f"**Region name:** {d['name']}",
          f"**Hierarchy level:** {level}",
          f"**Parent:** {d.get('parent', '—')}"]
    if d.get("latin"):
        L += [f'**Latin / meaning:** "{d["latin"]}"']
    L += [f"**Major components:** {comps}", "", "---", ""]
    overview = d.get("overview") or (
        f"The {d['name']} is {d['role']}. It is responsible for {d['owns']}."
    )
    L += ["## 1. Overview", "", overview, ""]
    L += ["## 2. Detailed Functional Description", ""]
    if d.get("detailed"):
        for sub, bullets in d["detailed"]:
            L += [f"### {sub}"]
            for b in bullets:
                L += [f"- {b}"]
            L += [""]
    else:
        for bt, bd in d["behaviours"]:
            L += [f"- **{bt}.** {bd}"]
        L += [""]
    L += ["## 3. Behavioural Description", "", d["behavior"], ""]
    L += ["## 4. Functional Mimicry Notes (for agent modelling)", "", d["mimicry"], "", "---", ""]
    L += ["## Scientific Sources", ""]
    base = d.get("refs_base", title)
    srcs = [(f"{title} — Wikipedia", wiki(base))]
    for label, url in d.get("refs_extra", []):
        srcs.append((label.replace("_", " ").title(), url))
    for i, (label, url) in enumerate(srcs, 1):
        L += [f"{i}. {label}. {url}"]
    L += [""]
    return "\n".join(L)


def script(d: dict, level: int, rid: str) -> str:
    obj = {
        "region": d["name"],
        "hierarchy_level": level,
        "parent": d.get("parent"),
        "components": d.get("components", []),
        "references": references(rid, d),
    }
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main():
    dry = "--dry" in sys.argv
    written = 0
    for rid, d in REGIONS.items():
        name = d["title"]
        folder = folder_of(name)
        prefix = name  # display name, spaces preserved
        level = d["level"]
        fdir = ROOT / folder
        files = {
            fdir / f"{prefix}_agent_prompt.md": agent_prompt(d),
            fdir / f"{prefix}_summary.md": summary(d, level),
            fdir / f"script_{prefix}.json": script(d, level, rid),
        }
        if dry:
            print(f"[L{level}] {folder}/  ({len(d['behaviours'])} behaviours)")
            continue
        fdir.mkdir(parents=True, exist_ok=True)
        for path, content in files.items():
            path.write_text(content, encoding="utf-8")
        written += 1
    if not dry:
        print(f"Wrote {written} regions ({written*3} files).")


if __name__ == "__main__":
    main()
