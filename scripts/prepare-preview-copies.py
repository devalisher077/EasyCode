"""Create temporary, source-preserving PPTX copies for static browser PDF export.

Usage: python3 scripts/prepare-preview-copies.py --out-dir /private/tmp/easycode-preview-copies
This does not export PDF, install fonts, or overwrite original materials.
"""

import argparse
import hashlib
import html
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent / "content" / "materials"
DRAWING = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
SLIDE = re.compile(r"ppt/slides/slide(\d+)\.xml$")
TEXT_RUN = re.compile(rb"(<a:t\b[^>]*>)(.*?)(</a:t\s*>)", re.DOTALL)
RUN = re.compile(rb"<a:r\b[^>]*>.*?</a:r>", re.DOTALL)

# Full-text exceptions preserve grammar and the meaning of the two grid labels.
EXACT = {
    "⭐": "Цель",
    "🤖": "Робот",
    "Дойдёт ли робот до звёздочки ⭐?": "Дойдёт ли робот до цели?",
    "Старт 🚩": "Старт по флажку",
    "🚩": "",  # Already captioned «Зелёный флажок» on the same card.
    "🛑": "",  # Already captioned «Красный стоп-знак» on the same card.
    "🧩 ": "",  # Decorative puzzle beside an already labeled script.
    "При нажатии на 🚩 спрайт сразу пройдёт 10 шагов вперёд и дружно произнесёт «Привет!» 💬":
        "При нажатии на флажок спрайт сразу пройдёт\n10 шагов вперёд и дружно произнесёт «Привет!»",
}
PHRASES = {
    "кликнут по 🚩": "кликнут по флажку",
    "нажатии на 🚩": "нажатии на флажок",
    "нажат 🚩": "нажат флажок",
    "кнопкой 🚩": "флажком",
    "зелёный флажок 🚩": "зелёный флажок",
    "Блок запуска 🚩": "Блок запуска",
    "Берём жёлтую шапку 🚩": "Берём жёлтую шапку",
}
# These symbols repeat adjacent written labels, headings, actions or warnings.
# Check/cross removal never labels textual code as invalid or changes a judgment.
DECORATIVE = set("🤖🗣💡✅❌⚠🧩⏹👟🚪🚶⭐🔍❓🚀🎮🎨🎭👾🖥✨🔵🟣💗💛🎉💬")
EMOJI = DECORATIVE | {"🚩", "🛑"}


def compatible_text(text):
    if text in EXACT:
        return EXACT[text]
    updated = text
    for source, target in PHRASES.items():
        updated = updated.replace(source, target)
    updated = "".join(char for char in updated if char not in DECORATIVE and char != "\ufe0f")
    if any(char in EMOJI or ord(char) > 0xFFFF for char in updated):
        raise ValueError("Unmapped meaningful symbol: " + repr(text))
    # Preserve the source's intentional boundary spaces in split runs (for
    # example, the space after a separate bold «Решение:» text run).
    if updated == text:
        return text
    leading = re.match(r"^\s*", text)[0]
    trailing = re.search(r"\s*$", text)[0]
    return leading + updated.strip() + trailing


def slide_copy(payload):
    original = ET.fromstring(payload)
    original_texts = [element.text or "" for element in original.iter(DRAWING + "t")]
    changes = []

    def replace(match):
        text = html.unescape(match.group(2).decode("utf-8"))
        updated = compatible_text(text)
        if updated == text:
            return match.group(0)
        changes.append({"before": text, "after": updated})
        return match.group(1) + escape(updated).encode("utf-8") + match.group(3)

    updated = TEXT_RUN.sub(replace, payload)
    parsed = ET.fromstring(updated)
    assert [node.text or "" for node in parsed.iter(DRAWING + "t")] == [compatible_text(text) for text in original_texts]
    # Comparing parsed trees after restoring text proves geometry, attributes,
    # fonts, relationships and all other XML nodes stayed unchanged.
    for node, text in zip(parsed.iter(DRAWING + "t"), original_texts):
        node.text = text or None
    assert ET.tostring(parsed) == ET.tostring(original), "Non-text slide change"
    return updated, changes


def fit_grid_labels(payload, changes):
    """Only the two emoji-to-word grid labels need smaller type in their cells."""
    requested = {change["after"]: size for change in changes
                 for symbol, size in [("⭐", "2000"), ("🤖", "1400")]
                 if change["before"] == symbol}
    adjustments = []

    def fit(match):
        text_match = TEXT_RUN.search(match[0])
        if not text_match:
            return match[0]
        label = html.unescape(text_match[2].decode("utf-8"))
        if label not in requested:
            return match[0]
        size = requested[label]
        original_size = re.search(rb'<a:rPr\b[^>]*\bsz="(\d+)"', match[0])
        assert original_size, "Grid label missing explicit font size"
        result, count = re.subn(rb'(<a:rPr\b[^>]*\bsz=")(\d+)(")',
                               lambda found: found[1] + size.encode() + found[3], match[0])
        assert count == 1
        adjustments.append({"text": label, "beforePoints": int(original_size[1]) / 100,
                            "afterPoints": int(size) / 100})
        return result

    updated = RUN.sub(fit, payload)
    assert len(adjustments) == len(requested)
    before, after = ET.fromstring(payload), ET.fromstring(updated)
    for original, copied in zip(before.iter(DRAWING + "rPr"), after.iter(DRAWING + "rPr")):
        if original.attrib != copied.attrib:
            copied.set("sz", original.get("sz"))
    assert ET.tostring(before) == ET.tostring(after), "Unexpected non-size label change"
    return updated, adjustments


def prepare(out_dir):
    out_dir = out_dir.resolve()
    if out_dir == ROOT or ROOT in out_dir.parents:
        raise ValueError("Use a separate temporary folder outside content/materials.")
    catalog = json.loads((ROOT / "catalog.json").read_text())
    entries = [
        (topic["number"], material["path"])
        for section in catalog["sections"] for topic in section["topics"]
        for material in topic["materials"]
        if material["type"] == "presentation" and material["path"].endswith(".pptx")
    ]
    out_dir.mkdir(parents=True, exist_ok=True)
    targets = [out_dir / f"topic-{topic}-browser.pptx" for topic, _ in entries]
    report_path = out_dir / "compatibility-report.json"
    if any(target.exists() for target in [*targets, report_path]):
        raise ValueError("Output exists; use a fresh folder. Nothing was overwritten.")
    report = []
    for (topic, relative), target in zip(entries, targets):
        source = (ROOT / relative).resolve()
        if ROOT not in source.parents:
            raise ValueError("Material path outside source directory")
        before_hash = hashlib.sha256(source.read_bytes()).hexdigest()
        edits, changed_parts, font_adjustments = [], [], []
        with ZipFile(source) as original, ZipFile(target, "x") as copied:
            for info in original.infolist():
                before = original.read(info.filename)
                after = before
                match = SLIDE.fullmatch(info.filename)
                if match:
                    after, changes = slide_copy(before)
                    after, sizes = fit_grid_labels(after, changes)
                    edits.extend({"slide": int(match[1]), **change} for change in changes)
                    font_adjustments.extend({"slide": int(match[1]), **change} for change in sizes)
                elif info.filename == "[Content_Types].xml" and b'xmlns:ns0="http://schemas.openxmlformats.org/package/2006/content-types"' in before:
                    after = before.replace(b"xmlns:ns0=", b"xmlns=").replace(b"<ns0:", b"<").replace(b"</ns0:", b"</")
                    assert ET.tostring(ET.fromstring(before)) == ET.tostring(ET.fromstring(after))
                if after != before:
                    changed_parts.append(info.filename)
                copied.writestr(info, after)
        with ZipFile(source) as original, ZipFile(target) as copied:
            assert original.namelist() == copied.namelist()
            actual_changes = [name for name in original.namelist() if original.read(name) != copied.read(name)]
            assert actual_changes == changed_parts
        assert hashlib.sha256(source.read_bytes()).hexdigest() == before_hash, "Original changed"
        report.append({"topic": topic, "original": relative, "originalSha256": before_hash, "copy": str(target), "changedParts": changed_parts, "textChanges": edits, "fontSizeAdjustments": font_adjustments})
        print(f"{topic}: {len(edits)} text replacements; {len(changed_parts)} changed XML parts; source SHA256 unchanged\n  {target}")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    prepare(args.out_dir)
