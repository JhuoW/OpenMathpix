#!/usr/bin/env python3
"""Render source/prediction contact sheets for visual review, without scoring.

Requires the same TeX/Pillow tools as generate-fixtures.py. A successful TeX
render is only preparation for inspection, never a correctness verdict.
"""

import argparse
import importlib.util
import json
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", type=Path, default=Path("scripts/mfr/results/node-engine.json"))
    parser.add_argument("--manifest", type=Path, default=Path("tests/fixtures/mfr/manifest.json"))
    parser.add_argument("--output-dir", type=Path, default=Path("scripts/mfr/results/visual"))
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    spec = importlib.util.spec_from_file_location("fixture_renderer", Path(__file__).with_name("generate-fixtures.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    manifest = json.loads(args.manifest.read_text())
    expected = {case["id"]: case for case in manifest["cases"]}
    report = json.loads(args.report.read_text())
    rows = []
    status = []
    with tempfile.TemporaryDirectory(prefix="openmathpix-visual-") as temporary:
        for result in report["cases"]:
            case = expected[result["id"]]
            if case["kind"] != "formula":
                continue
            row = Image.new("RGB", (1280, 240), "#eeeeee")
            draw = ImageDraw.Draw(row)
            draw.text((12, 10), f"{case['id']} | INPUT", fill="black")
            draw.text((652, 10), "PREDICTED LaTeX RENDER (rendering is not a correctness test)", fill="black")
            source = Image.open(args.manifest.parent / case["file"]).convert("RGB")
            source.thumbnail((610, 195))
            row.paste(source, ((640 - source.width) // 2, 36))
            try:
                prediction = module.render_formula(result.get("latex", ""), Path(temporary))
                prediction.thumbnail((610, 195))
                row.paste(prediction, (640 + (640 - prediction.width) // 2, 36))
                status.append({"id": case["id"], "rendered": True, "visualReview": "pending"})
            except Exception as error:
                draw.text((652, 50), f"Render failed: {type(error).__name__}", fill="red")
                status.append({"id": case["id"], "rendered": False, "visualReview": "pending"})
            rows.append(row)
    for offset in range(0, len(rows), 6):
        batch = rows[offset:offset + 6]
        sheet = Image.new("RGB", (1280, 240 * len(batch)), "white")
        for index, row in enumerate(batch):
            sheet.paste(row, (0, index * 240))
        sheet.save(args.output_dir / f"comparison-{offset // 6 + 1}.png")
    (args.output_dir / "render-status.json").write_text(json.dumps(status, indent=2) + "\n")
    print(f"Rendered {len(rows)} source/prediction pairs; visual review still required.")


if __name__ == "__main__":
    main()
