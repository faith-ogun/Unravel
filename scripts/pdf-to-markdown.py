"""Convert the reference PDFs in refs/ to Markdown (and JSON) for cheap reading.

opendataloader-pdf shells out to a Java engine, so this makes sure a Java
runtime is on PATH (falling back to the Homebrew OpenJDK) before converting.
"""

import os
from pathlib import Path

# opendataloader-pdf shells out to `java`. On macOS, /usr/bin/java is always
# present as a stub that fails if no real JDK is installed, so we can't just
# check whether `java` exists. Always put the Homebrew OpenJDK first on PATH so
# the real runtime wins over the stub.
brew_jdk = Path("/opt/homebrew/opt/openjdk/bin")
if (brew_jdk / "java").exists():
    os.environ["PATH"] = str(brew_jdk) + os.pathsep + os.environ.get("PATH", "")

import opendataloader_pdf  # noqa: E402

# Layout: refs/pdf (source) -> refs/md (markdown + *_images) + refs/json.
REFS = Path(__file__).resolve().parent.parent / "refs"
PDF_DIR = REFS / "pdf"
MD_DIR = REFS / "md"
JSON_DIR = REFS / "json"

# Fall back to the flat layout if pdf/ does not exist yet.
src = PDF_DIR if PDF_DIR.is_dir() else REFS
pdfs = sorted(src.glob("*.pdf"))

if not pdfs:
    raise SystemExit(f"No PDFs found in {src}")

MD_DIR.mkdir(exist_ok=True)
JSON_DIR.mkdir(exist_ok=True)

# Convert one file per call: a single bad PDF in a batch makes the whole run
# return non-zero, so we isolate each and keep going. opendataloader writes the
# .md, .json and _images into one output dir, so we emit into md/ then move the
# .json into json/.
ok = 0
for pdf in pdfs:
    try:
        opendataloader_pdf.convert(
            input_path=[str(pdf)],
            output_dir=str(MD_DIR),
            format="markdown,json",
        )
        produced_json = MD_DIR / f"{pdf.stem}.json"
        if produced_json.exists():
            produced_json.replace(JSON_DIR / produced_json.name)
        print(f"OK   : {pdf.name}")
        ok += 1
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL : {pdf.name} ({exc})")

print(f"Converted {ok}/{len(pdfs)} PDF(s): markdown in {MD_DIR}, json in {JSON_DIR}")
