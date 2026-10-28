#!/usr/bin/env python3
"""Independent CPU reference for the public Pix2Text MFR-1.5 ONNX graphs.

Install only onnxruntime, tokenizers, numpy, and Pillow in an isolated environment.
This reproduces the model's documented preprocessing and greedy generation; it
does not claim to execute the official Transformers/Optimum Python wrapper.
No downloads, network calls, or credentials are used by this script.
"""

import argparse
import hashlib
import importlib.metadata
import json
import platform
import resource
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from tokenizers import Tokenizer


def pixels(image_path: Path, config: dict) -> np.ndarray:
    with Image.open(image_path) as source:
        image = source.convert("RGB")
    size = config["size"]
    image = image.resize((size["width"], size["height"]), Image.Resampling(config["resample"]))
    values = np.asarray(image, dtype=np.float32)
    if config.get("do_rescale", True):
        values *= np.float32(config["rescale_factor"])
    if config.get("do_normalize", True):
        values = (values - np.asarray(config["image_mean"], dtype=np.float32)) / np.asarray(config["image_std"], dtype=np.float32)
    return np.ascontiguousarray(values.transpose(2, 0, 1)[None, ...])


def metadata(session: ort.InferenceSession) -> dict:
    def describe(item):
        return {"name": item.name, "type": item.type, "shape": item.shape}
    return {"inputs": list(map(describe, session.get_inputs())),
            "outputs": list(map(describe, session.get_outputs()))}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--manifest", default=Path("tests/fixtures/mfr/manifest.json"), type=Path)
    parser.add_argument("--output", default=Path("scripts/mfr/results/python-reference.json"), type=Path)
    parser.add_argument("--max-new-tokens", type=int, default=1024)
    parser.add_argument("--timeout", type=float, default=90)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--only", nargs="*", help="Restrict to listed fixture IDs.")
    parser.add_argument("--dump-pixels", type=Path, help="Optional float32 NCHW input tensors for numerical preprocessing comparisons.")
    args = parser.parse_args()

    config = json.loads((args.model_dir / "preprocessor_config.json").read_text())
    generation = json.loads((args.model_dir / "generation_config.json").read_text())
    if config.get("do_center_crop"):
        raise ValueError("Reference only supports the published no-center-crop MFR-1.5 configuration")
    tokenizer = Tokenizer.from_file(str(args.model_dir / "tokenizer.json"))
    options = ort.SessionOptions()
    options.intra_op_num_threads = args.threads
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    load_start = time.perf_counter()
    encoder = ort.InferenceSession(str(args.model_dir / "encoder_model.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    decoder = ort.InferenceSession(str(args.model_dir / "decoder_model.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    load_ms = (time.perf_counter() - load_start) * 1000
    encoder_inputs = encoder.get_inputs()
    decoder_names = {item.name for item in decoder.get_inputs()}
    if len(encoder_inputs) != 1 or not {"input_ids", "encoder_hidden_states"}.issubset(decoder_names):
        raise ValueError("Unexpected ONNX graph inputs; inspect model metadata before adapting the reference")
    if decoder_names - {"input_ids", "encoder_hidden_states", "attention_mask", "encoder_attention_mask"}:
        raise ValueError(f"Unsupported decoder inputs: {decoder_names}")
    logits_index = next((i for i, item in enumerate(decoder.get_outputs()) if item.name == "logits"), 0)

    manifest = json.loads(args.manifest.read_text())
    report = {
        "implementation": "Independent Python ONNXRuntime CPU + Pillow + tokenizers; not the official Optimum wrapper.",
        "purpose": manifest["purpose"],
        "environment": {"python": platform.python_version(), "platform": platform.platform(),
                        "processor": platform.processor(), "threads": args.threads,
                        "packages": {name: importlib.metadata.version(name) for name in ["onnxruntime", "tokenizers", "numpy", "Pillow"]}},
        "model": {name: hashlib.sha256((args.model_dir / name).read_bytes()).hexdigest()
                  for name in ["encoder_model.onnx", "decoder_model.onnx", "preprocessor_config.json", "tokenizer.json", "generation_config.json"]},
        "encoder": metadata(encoder), "decoder": metadata(decoder),
        "loadMs": load_ms, "maxNewTokens": args.max_new_tokens,
        "timingNotes": "One inference per case in listed order, no artificial warmup; first case includes first-inference overhead. Includes image preprocessing and decoding, excludes session loading.",
        "cases": [],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    for case in manifest["cases"]:
        if args.only and case["id"] not in args.only:
            continue
        start = time.perf_counter()
        result = {"id": case["id"], "kind": case["kind"], "file": case["file"], "status": "error"}
        try:
            values = pixels(args.manifest.parent / case["file"], config)
            if args.dump_pixels:
                args.dump_pixels.mkdir(parents=True, exist_ok=True)
                values.astype("<f4").tofile(args.dump_pixels / f"{case['id']}.f32")
            hidden = encoder.run(None, {encoder_inputs[0].name: values})[0]
            ids = [generation["decoder_start_token_id"]]
            stopped = "token_limit"
            for _ in range(args.max_new_tokens):
                if time.perf_counter() - start > args.timeout:
                    stopped = "timeout"
                    break
                feeds = {"input_ids": np.asarray([ids], dtype=np.int64), "encoder_hidden_states": hidden}
                if "attention_mask" in decoder_names:
                    feeds["attention_mask"] = np.ones((1, len(ids)), dtype=np.int64)
                if "encoder_attention_mask" in decoder_names:
                    feeds["encoder_attention_mask"] = np.ones(hidden.shape[:2], dtype=np.int64)
                logits = decoder.run(None, feeds)[logits_index]
                token = int(np.argmax(logits[0, -1, :]))
                ids.append(token)
                if token == generation["eos_token_id"]:
                    stopped = "eos"
                    break
            latex = tokenizer.decode(ids, skip_special_tokens=True)
            result.update({"status": "ok" if stopped == "eos" else "incomplete", "latex": latex,
                           "tokenIds": ids, "generatedTokens": len(ids) - 1, "stopReason": stopped})
        except Exception as error:
            result["error"] = f"{type(error).__name__}: {error}"
        result["elapsedMs"] = (time.perf_counter() - start) * 1000
        report["cases"].append(result)
        # Save after each case so a failed or interrupted run remains inspectable.
        report["peakRssKiB"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(json.dumps({key: result.get(key) for key in ["id", "status", "elapsedMs", "latex", "stopReason", "error"]}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
