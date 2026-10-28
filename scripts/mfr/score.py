#!/usr/bin/env python3
"""Score raw MFR reports conservatively; rendering success is never accuracy.

Normalization only covers explicitly stated LaTeX formatting variants. Other
equivalent representations, particularly matrices/aligned environments, remain
unmatched until reviewed by a person. No symbolic equivalence is inferred.
"""

import argparse
import json
import re
from itertools import combinations
from pathlib import Path


def normalize(latex: str) -> str:
    text = latex.strip()
    for left, right in [("$$", "$$"), (r"\[", r"\]"), (r"\(", r"\)"), ("$", "$")]:
        if text.startswith(left) and text.endswith(right) and len(text) >= len(left) + len(right):
            text = text[len(left):-len(right)].strip()
            break
    # Preserve whitespace in text-bearing commands, including nested braces.
    protected = []
    index = 0
    while True:
        match = re.search(r"\\(?:text|operatorname|mbox)\s*\{", text[index:])
        if not match:
            break
        start = index + match.start()
        end = index + match.end()
        depth = 1
        while end < len(text) and depth:
            if text[end] == "{" and text[end - 1] != "\\":
                depth += 1
            elif text[end] == "}" and text[end - 1] != "\\":
                depth -= 1
            end += 1
        if depth:
            break
        placeholder = f"\ue000{len(protected)}\ue001"
        protected.append(text[start:end])
        text = text[:start] + placeholder + text[end:]
        index = start + len(placeholder)
    text = re.sub(r"\\(?:displaystyle|textstyle|left|right|quad|qquad)(?![a-zA-Z])", "", text)
    text = re.sub(r"\\[,!;: ]", "", text)
    text = re.sub(r"\\[dt]frac(?![a-zA-Z])", r"\\frac", text)
    text = re.sub(r"\\ge(?![a-zA-Z])", r"\\geq", text)
    text = re.sub(r"\\le(?![a-zA-Z])", r"\\leq", text)
    text = re.sub(r"\s+", "", text)
    text = re.sub(r"([_^])\{([a-zA-Z0-9])\}", r"\1\2", text)
    for number, original in enumerate(protected):
        text = text.replace(f"\ue000{number}\ue001", original)
    return text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reports", nargs="+", type=Path)
    parser.add_argument("--manifest", type=Path, default=Path("tests/fixtures/mfr/manifest.json"))
    parser.add_argument("--output", type=Path, default=Path("scripts/mfr/results/comparison.json"))
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    expected = {case["id"]: case for case in manifest["cases"]}
    reports = []
    for path in args.reports:
        raw = json.loads(path.read_text())
        scored = []
        formula_count = exact_count = normalized_count = 0
        for result in raw["cases"]:
            case = expected[result["id"]]
            row = {"id": case["id"], "status": result["status"], "elapsedMs": result["elapsedMs"]}
            if case["kind"] == "formula":
                formula_count += 1
                actual = result.get("latex", "")
                exact = result["status"] == "ok" and actual == case["expectedLatex"]
                normalized = result["status"] == "ok" and normalize(actual) == normalize(case["expectedLatex"])
                exact_count += exact
                normalized_count += normalized
                row.update({"expectedLatex": case["expectedLatex"], "actualLatex": actual,
                            "exactMatch": exact, "normalizedMatch": normalized,
                            "visualReview": "pending"})
            else:
                row.update({"expectedBehavior": case["expectedBehavior"], "actualLatex": result.get("latex"),
                            "rejected": result["status"] == "error", "error": result.get("error")})
            scored.append(row)
        reports.append({"file": str(path), "implementation": raw.get("implementation"),
                        "expectedFormulaCases": sum(case["kind"] == "formula" for case in expected.values()),
                        "formulaCases": formula_count, "exactMatches": exact_count,
                        "normalizedMatches": normalized_count, "cases": scored})
    agreement = []
    for first, second in combinations(reports, 2):
        first_cases = {case["id"]: case for case in first["cases"] if "exactMatch" in case}
        second_cases = {case["id"]: case for case in second["cases"] if "exactMatch" in case}
        common = sorted(first_cases.keys() & second_cases.keys())
        matching = [case_id for case_id in common
                    if first_cases[case_id]["status"] == second_cases[case_id]["status"] == "ok"
                    and first_cases[case_id]["actualLatex"] == second_cases[case_id]["actualLatex"]]
        agreement.append({"first": first["file"], "second": second["file"],
                          "commonFormulaCases": len(common), "rawOutputMatches": len(matching),
                          "unmatchedIds": sorted(set(common) - set(matching))})
    report = {"purpose": manifest["purpose"], "scoring": manifest["scoring"],
              "warning": "Counts describe only these synthetic fixtures. Normalization is not mathematical equivalence; pending visual review is not a pass.",
              "rawOutputAgreement": agreement,
              "reports": reports}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for summary in reports:
        print(f"{summary['file']}: exact={summary['exactMatches']}/{summary['formulaCases']}; formatting-normalized={summary['normalizedMatches']}/{summary['formulaCases']}; visual review pending")


if __name__ == "__main__":
    main()
