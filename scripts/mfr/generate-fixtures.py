#!/usr/bin/env python3
"""Generate a small, synthetic formula smoke set with TeX and Pillow.

Requires pdflatex, pdftoppm, and Pillow. No network or model access is needed.
The set tests implementation behavior; it is not a held-out quality benchmark.
"""

import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


FORMULAS = [
    ("simple", r"x=1", "Short baseline, clearly typeset numeral."),
    ("quadratic", r"x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}", "Fraction, radical, superscripts, plus/minus."),
    ("nested-fraction", r"\frac{1}{1+\frac{1}{x}}", "Nested fractions."),
    ("gaussian-integral", r"\int_0^{\infty} e^{-x^2}\,dx=\frac{\sqrt{\pi}}{2}", "Integral limits, exponent, spacing command."),
    ("infinite-series", r"\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}", "Summation limits and fractions."),
    ("subscripts", r"a_{i,j}^{(k+1)}=\alpha a_{i,j}^{(k)}+(1-\alpha)b_j", "Nested subscripts and superscripts, Greek letter."),
    ("matrix", r"A=\begin{pmatrix}a&b\\c&d\end{pmatrix}", "Two-by-two matrix; alternative LaTeX environments require visual review."),
    ("piecewise", r"f(x)=\begin{cases}x^2,&x\geq 0\\-x,&x<0\end{cases}", "Piecewise function, brace, two rows."),
    ("aligned", r"\begin{aligned}(a+b)^2&=a^2+2ab+b^2\\(a-b)^2&=a^2-2ab+b^2\end{aligned}", "Two aligned equations; alignment syntax is not scored as semantic equivalence."),
    ("long-derivative", r"\frac{d}{dx}\left[x^n e^{ax}\right]=nx^{n-1}e^{ax}+ax^n e^{ax}", "Wide expression with derivative and repeated superscripts."),
]


def render_formula(latex: str, directory: Path) -> Image.Image:
    source = (
        r"\documentclass[12pt]{article}" "\n"
        r"\usepackage[paperwidth=28cm,paperheight=10cm,margin=1cm]{geometry}" "\n"
        r"\usepackage{amsmath,amssymb}" "\n"
        r"\pagestyle{empty}" "\n"
        r"\begin{document}" "\n"
        r"\[" + latex + r"\]" "\n"
        r"\end{document}" "\n"
    )
    tex_path = directory / "formula.tex"
    tex_path.write_text(source, encoding="utf-8")
    subprocess.run(
        ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", "formula.tex"],
        cwd=directory,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    subprocess.run(
        ["pdftoppm", "-r", "180", "-png", "-singlefile", "formula.pdf", "formula"],
        cwd=directory,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    image = Image.open(directory / "formula.png").convert("RGB")
    box = ImageChops.difference(image, Image.new("RGB", image.size, "white")).getbbox()
    if box is None:
        raise ValueError("TeX rendering produced a blank image")
    return ImageOps.expand(image.crop(box), border=12, fill="white")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("tests/fixtures/mfr"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cases = []
    rendered = {}
    with tempfile.TemporaryDirectory(prefix="openmathpix-fixtures-") as temporary:
        for name, latex, description in FORMULAS:
            image = render_formula(latex, Path(temporary))
            rendered[name] = image
            image.save(args.output / f"{name}.png")
            cases.append({"id": name, "file": f"{name}.png", "expectedLatex": latex,
                          "kind": "formula", "description": description})

    quadratic = rendered["quadratic"]
    quadratic.resize((round(quadratic.width * 0.45), round(quadratic.height * 0.45)),
                     Image.Resampling.BILINEAR).save(args.output / "low-resolution.png")
    cases.append({"id": "low-resolution", "file": "low-resolution.png", "kind": "formula",
                  "expectedLatex": FORMULAS[1][1],
                  "description": "Quadratic formula downsampled to 45%; synthetic low-resolution stress case."})
    ImageOps.invert(rendered["simple"]).save(args.output / "dark-background.png")
    cases.append({"id": "dark-background", "file": "dark-background.png", "kind": "formula",
                  "expectedLatex": FORMULAS[0][1],
                  "description": "Inverted baseline simulating dark-background screenshots; intentionally outside white-page preprocessing assumptions."})

    Image.new("RGB", (160, 80), "white").save(args.output / "blank.png")
    cases.append({"id": "blank", "file": "blank.png", "kind": "negative",
                  "expectedBehavior": "Reject blank input instead of presenting generated tokens as recognition.",
                  "description": "Uniform white image; excluded from formula accuracy denominator."})
    (args.output / "invalid-image.bin").write_bytes(b"This is not an image.\n")
    cases.append({"id": "invalid-image", "file": "invalid-image.bin", "kind": "negative",
                  "expectedBehavior": "Reject invalid image data.",
                  "description": "Malformed input; excluded from formula accuracy denominator."})

    for case in cases:
        file = args.output / case["file"]
        case["sha256"] = hashlib.sha256(file.read_bytes()).hexdigest()
        if file.suffix == ".png":
            with Image.open(file) as image:
                case["width"], case["height"] = image.size

    manifest = {
        "schemaVersion": 1,
        "purpose": "Small reproducible synthetic implementation smoke set; not evidence of general accuracy.",
        "source": "Generated locally from the stated LaTeX using TeX Live, Computer Modern, pdftoppm at 180 DPI, and Pillow. No user documents.",
        "scoring": {
            "exact": "Raw predicted LaTeX equals expectedLatex.",
            "normalized": "Only whitespace, math delimiters, display-size/spacing commands, and declared command aliases are normalized. This is not a proof of mathematical equivalence.",
            "visual": "Human review compares rendered prediction to the source image, including symbols, rows, and bounds. Successful rendering alone is not correctness.",
        },
        "cases": cases,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated {len(cases)} cases in {args.output}")


if __name__ == "__main__":
    main()
