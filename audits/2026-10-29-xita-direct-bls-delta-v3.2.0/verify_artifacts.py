#!/usr/bin/env python3
"""Read-only verification of the v3.2.0 public audit package.

Usage: python verify_artifacts.py [--audit-dir PATH]
       [--prior-history PATH] [--expected-manifest-sha256 HEX]

Requires Python 3.10+ and pypdf. No network or production calls, extraction,
source checkout, package installation or product tests are performed. The
outer manifest cannot authenticate itself: compare its printed SHA-256 with
an independently retained attestation, or supply that digest with the flag.
PDF text checks establish bounded content consistency, not visual quality.
"""

from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import unicodedata
import zipfile

sys.dont_write_bytecode = True

AUDIT_ID = "XITA-DBLS-2026-10-29-v3.2.0"
SEALED_PHASE_A = "8a6651e9ed0167e7605dab9d129a0fa8019833a37bb5bd348373dadc5bf49a52"
FINDING_IDS = {f"F-{i:02d}" for i in range(1, 36)}
RESOLVED_IDS = {"F-01", "F-02", "F-07", "F-16", "F-26", "F-27", "F-30"}
SEVERITIES = {"Critical": 0, "High": 0, "Medium": 14, "Low": 12, "Informational": 2, "RESOLVED": 7}
DISPOSITIONS = {"OPEN": 24, "PARTIALLY_MITIGATED": 3, "ACCEPTED_RISK": 1, "VERIFIED / RESOLVED": 7}
HISTORICAL_COLUMNS = (
    "audit", "id", "original_severity", "current_severity", "disposition", "title",
    "original_condition", "boundary_prerequisites", "current_assessment", "source_refs",
    "corrections", "tests", "production", "current_finding", "duplicate_of", "baseline_provenance",
)
REQUIRED = (
    "README.md", "report.md", "report.pdf", "scope-and-baselines.json", "change-inventory.csv",
    "findings.csv", "finding-statistics.json", "historical-findings-matrix.csv", "phase-a-findings.md",
    "phase-a-freeze.json", "phase-a-publication.json", "verification.md", "test-matrix.md",
    "remediation.md", "launch-decision.md", "pdf-validation.json", "evidence-public.zip",
    "evidence/MANIFEST.json", "archive-manifest.json", "confidential-evidence-reference.json",
    "verify_artifacts.py", "reproduce_source_scope.py",
)


class VerificationError(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def relative_path(value: object) -> str:
    require(isinstance(value, str) and bool(value), "Manifest/ZIP path must be a nonempty string")
    require("\\" not in value and "\x00" not in value, f"Unsafe path: {value!r}")
    path = PurePosixPath(value)
    require(not path.is_absolute() and not re.match(r"^[A-Za-z]:", value), f"Absolute path: {value!r}")
    require(all(part not in ("", ".", "..") for part in value.split("/")), f"Noncanonical path: {value!r}")
    require(path.as_posix() == value, f"Noncanonical path: {value!r}")
    return value


def local_path(root: Path, relative: str) -> Path:
    relative = relative_path(relative)
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        require(not current.is_symlink(), f"Symlink is not an audit artifact: {relative}")
    require(current.resolve().is_relative_to(root), f"Path escapes audit directory: {relative}")
    return current


def json_file(path: Path) -> dict:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise VerificationError(f"Cannot read JSON {path.name}: {exc}") from exc
    require(isinstance(result, dict), f"Expected JSON object: {path.name}")
    return result


def csv_file(path: Path) -> tuple[list[str], list[dict]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        columns = reader.fieldnames or []
    require(len(columns) == len(set(columns)), f"Duplicate CSV columns: {path.name}")
    require(all(None not in row and all(value is not None for value in row.values()) for row in rows),
            f"Malformed CSV row: {path.name}")
    return columns, rows


def manifest_entries(document: dict, key: str) -> dict[str, dict]:
    rows = document.get(key)
    require(isinstance(rows, list) and bool(rows), f"Manifest requires nonempty {key} array")
    result = {}
    for row in rows:
        require(isinstance(row, dict), f"Invalid {key} manifest entry")
        name = relative_path(row.get("path"))
        require(name not in result, f"Duplicate manifest path: {name}")
        require(type(row.get("bytes")) is int and row["bytes"] >= 0, f"Invalid byte count: {name}")
        require(isinstance(row.get("sha256"), str) and re.fullmatch(r"[0-9a-f]{64}", row["sha256"]) is not None,
                f"Invalid SHA-256: {name}")
        result[name] = row
    return result


def compare_bytes(data: bytes, entry: dict, label: str) -> None:
    require(len(data) == entry["bytes"], f"Byte count mismatch: {label}")
    require(sha256(data) == entry["sha256"], f"SHA-256 mismatch: {label}")


def all_local_files(root: Path) -> set[str]:
    result = set()
    for path in root.rglob("*"):
        name = path.relative_to(root).as_posix()
        require(not path.is_symlink(), f"Symlink is not permitted: {name}")
        if path.is_dir():
            continue
        require(path.is_file(), f"Non-regular artifact: {name}")
        relative_path(name)
        result.add(name)
    return result


def verify_archive(root: Path, expected_digest: str | None) -> dict:
    manifest_path = root / "archive-manifest.json"
    entries = manifest_entries(json_file(manifest_path), "artifacts")
    require("archive-manifest.json" not in entries, "Outer manifest must exclude only itself")
    actual = all_local_files(root) - {"archive-manifest.json"}
    require(set(entries) == actual,
            f"Outer manifest file set mismatch: missing={sorted(actual - set(entries))}, unexpected={sorted(set(entries) - actual)}")
    for name, entry in entries.items():
        path = local_path(root, name)
        require(path.stat().st_size == entry["bytes"], f"Byte count mismatch: {name}")
        require(file_sha256(path) == entry["sha256"], f"SHA-256 mismatch: {name}")
    digest = file_sha256(manifest_path)
    if expected_digest:
        require(re.fullmatch(r"[0-9a-fA-F]{64}", expected_digest) is not None, "Expected manifest digest must be 64 hexadecimal characters")
        require(digest == expected_digest.lower(), "Outer manifest differs from the independently supplied attestation")
    return {"artifacts": len(entries), "sha256": digest, "external_digest_compared": bool(expected_digest),
            "self_authentication_limit": "The outer manifest excludes itself. Its digest requires independent retention/attestation."}


def verify_evidence(root: Path) -> dict:
    manifest_path = root / "evidence/MANIFEST.json"
    manifest_bytes = manifest_path.read_bytes()
    entries = manifest_entries(json_file(manifest_path), "files")
    require("evidence/MANIFEST.json" not in entries, "Evidence manifest must exclude itself")
    require(all(name.startswith("evidence/") for name in entries), "Evidence paths must begin with evidence/")
    expected = set(entries) | {"evidence/MANIFEST.json"}
    with zipfile.ZipFile(root / "evidence-public.zip") as archive:
        infos = archive.infolist()
        names = [relative_path(info.filename) for info in infos]
        require(len(names) == len(set(names)), "Duplicate ZIP members")
        require(set(names) == expected,
                f"ZIP member set mismatch: missing={sorted(expected - set(names))}, unexpected={sorted(set(names) - expected)}")
        for info in infos:
            require(not info.is_dir(), f"ZIP directory entry not permitted: {info.filename}")
            require(not (info.flag_bits & 1), f"Public evidence member is encrypted: {info.filename}")
            mode = (info.external_attr >> 16) & 0xFFFF
            require(stat.S_IFMT(mode) in (0, stat.S_IFREG), f"ZIP member is not a regular file: {info.filename}")
            data = archive.read(info)  # zipfile verifies CRC while reading; no extraction.
            if info.filename == "evidence/MANIFEST.json":
                require(data == manifest_bytes, "ZIP and external evidence manifests differ")
            else:
                compare_bytes(data, entries[info.filename], f"ZIP:{info.filename}")
        require(archive.testzip() is None, "ZIP CRC validation failed")
    unpacked = {name for name in all_local_files(root / "evidence")}
    for name in unpacked:
        relative = "evidence/" + name
        require(relative in expected, f"Unmanifested unpacked evidence: {relative}")
        if relative != "evidence/MANIFEST.json":
            compare_bytes(local_path(root, relative).read_bytes(), entries[relative], relative)
    return {"payload_files": len(entries), "zip_members": len(expected), "unpacked_files_checked": len(unpacked),
            "crc": "PASS", "zip_paths": "PASS", "extraction_performed": False}


def verify_registers(root: Path, prior: Path | None) -> dict:
    _, findings = csv_file(root / "findings.csv")
    identifiers = [row["id"] for row in findings]
    require(len(identifiers) == 35 and set(identifiers) == FINDING_IDS, "Current register must contain F-01 through F-35 exactly once")
    severity = Counter(row["current_severity"] for row in findings)
    disposition = Counter(row["disposition"] for row in findings)
    require(all(severity.get(k, 0) == v for k, v in SEVERITIES.items()) and set(severity) <= set(SEVERITIES),
            f"Incorrect severity counts: {dict(severity)}")
    require(dict(disposition) == DISPOSITIONS, f"Incorrect disposition counts: {dict(disposition)}")
    require({row["id"] for row in findings if row["current_severity"] == "RESOLVED"} == RESOLVED_IDS, "Resolved ID list differs")
    for row in findings:
        require((row["current_severity"] == "RESOLVED") == (row["disposition"] == "VERIFIED / RESOLVED"),
                f"Resolution/severity inconsistency: {row['id']}")
        if row["historical_severity"] == "Medium" or row["current_severity"] == "Medium":
            require(row["management_category"] in {"SCHLIESSBAR", "OFFEN"}, f"Missing Medium management category: {row['id']}")
        if row["current_severity"] == "Medium":
            require(row["management_category"] == "OFFEN", f"Current Medium must remain OFFEN: {row['id']}")
    stats = json_file(root / "finding-statistics.json")
    require(stats.get("audit_id") == AUDIT_ID, "Statistics audit identity differs")
    require(stats.get("current_unique_entries") == 35 and stats.get("prior_current_entries_reassessed") == 32
            and stats.get("new_findings") == 3 and stats.get("resolved_count") == 7
            and stats.get("historical_occurrences") == 43, "Statistics totals differ")
    require(stats.get("unresolved_severity_counts") == {k: v for k, v in SEVERITIES.items() if k != "RESOLVED"},
            "Statistics severity counts differ from CSV")
    require(stats.get("disposition_counts") == DISPOSITIONS and set(stats.get("resolved_ids", [])) == RESOLVED_IDS,
            "Statistics disposition/resolution IDs differ from CSV")
    new_ids = {row["id"] for row in findings if row["new_finding"].lower() == "true"}
    require(new_ids == {"F-33", "F-34", "F-35"}, "New finding IDs differ")
    regressions = {row["id"] for row in findings if row["regression"].lower() == "true"}
    require(regressions == {"F-06"} and stats.get("reopened_regressions") == ["F-06"], "Regression IDs differ")
    _, inventory = csv_file(root / "change-inventory.csv")
    inventory_keys = {(row["repository"], row["path"]) for row in inventory}
    require(len(inventory) == 48 and len(inventory_keys) == 48, "Change inventory must have 48 unique paths")
    require(all(row["review_status"] == "REVIEWED" for row in inventory), "An inventory path is not REVIEWED")
    columns, historical = csv_file(root / "historical-findings-matrix.csv")
    require(set(HISTORICAL_COLUMNS) <= set(columns), "Historical matrix omits retained original columns")
    key = lambda row: (row["audit"], row["id"])
    historical_by_key = {key(row): row for row in historical}
    require(len(historical) == 43 and len(historical_by_key) == 43, "Historical matrix must have 43 unique occurrences")
    for row in historical:
        mapped = row.get("v3_2_current_finding_id", "")
        require(not mapped or mapped in FINDING_IDS, f"Unknown current ID in historical matrix: {mapped}")
        require(row.get("v3_2_disposition") in set(DISPOSITIONS), f"Unknown historical overlay disposition: {key(row)}")
        if row["original_severity"] == "Medium" or row.get("v3_2_current_severity") == "Medium":
            require(row.get("v3_2_management_category") in {"SCHLIESSBAR", "OFFEN"},
                    f"Historical Medium lacks management category: {key(row)}")
    alias = root / "historical-findings.csv"
    if alias.exists():
        require(alias.read_bytes() == (root / "historical-findings-matrix.csv").read_bytes(), "Historical CSV compatibility alias differs")
    prior_result = {"status": "NOT_AVAILABLE", "limit": "Prior 16-column cell comparison needs the prior CSV; current 43-row structure was checked."}
    if prior is not None and prior.is_file():
        prior_columns, prior_rows = csv_file(prior)
        require(set(HISTORICAL_COLUMNS) <= set(prior_columns), "Prior historical CSV lacks expected original columns")
        prior_by_key = {key(row): row for row in prior_rows}
        require(len(prior_rows) == 43 and len(prior_by_key) == 43, "Prior historical CSV does not contain 43 unique occurrences")
        require(set(prior_by_key) == set(historical_by_key), "Historical occurrence identities differ from prior CSV")
        for occurrence, old in prior_by_key.items():
            for column in HISTORICAL_COLUMNS:
                require(old[column] == historical_by_key[occurrence][column], f"Original historical cell changed: {occurrence}, {column}")
        prior_result = {"status": "PASS", "sha256": file_sha256(prior), "occurrences": 43, "columns": 16, "cells": 688}
    return {"findings": 35, "severity_counts": dict(severity), "dispositions": dict(disposition),
            "inventory_reviewed": 48, "historical_occurrences": 43, "prior_original_cells": prior_result}


def normalized_text(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).replace("\u00ad", "").split())


def verify_report(root: Path) -> dict:
    markdown_bytes = (root / "report.md").read_bytes()
    markdown = markdown_bytes.decode("utf-8")
    headings = re.findall(r"^## (\d+)\. (.+)$", markdown, re.MULTILINE)
    require([int(number) for number, _ in headings] == list(range(1, 16)), "Report must contain the 15 numbered chapters in order")
    finding_headings = re.findall(r"^### (F-\d{2})\s+[-\u2013\u2014]\s+", markdown, re.MULTILINE)
    require(len(finding_headings) == 35 and set(finding_headings) == FINDING_IDS,
            "Report must contain one detailed finding heading for each F-01 through F-35")
    pdf_bytes = (root / "report.pdf").read_bytes()
    require(pdf_bytes.startswith(b"%PDF-"), "report.pdf lacks a PDF header")
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise VerificationError("pypdf is required for PDF verification; install it in your verification environment") from exc
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes), strict=True)
        require(not reader.is_encrypted, "Public report PDF must not be encrypted")
        page_text = [page.extract_text() or "" for page in reader.pages]
    except Exception as exc:
        raise VerificationError(f"PDF parsing/text extraction failed: {exc}") from exc
    require(bool(page_text), "PDF has no pages")
    empty_pages = [i + 1 for i, text in enumerate(page_text) if not text.strip()]
    require(not empty_pages, f"PDF has empty extracted-text pages: {empty_pages}")
    combined = "\n".join(page_text)
    normalized = normalized_text(combined)
    for number, title in headings:
        require(normalized_text(f"{number}. {title}") in normalized, f"PDF lacks chapter heading {number}")
    for finding_id in FINDING_IDS:
        require(re.search(r"\b" + finding_id + r"\b", combined) is not None, f"PDF lacks {finding_id}")
    visible_markdown = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", markdown)
    visible_markdown = re.sub(r"https?://\S+", " ", visible_markdown)
    tokens = lambda value: Counter(re.findall(r"[A-Za-z]+", normalized_text(value)))
    source_words, pdf_words = tokens(visible_markdown), tokens(combined)
    coverage = sum((source_words & pdf_words).values()) / max(1, sum(source_words.values()))
    require(coverage >= 0.98, f"PDF visible-word occurrence coverage is only {coverage:.2%}")
    metadata = json_file(root / "pdf-validation.json")
    require(metadata.get("file") == "report.pdf" and metadata.get("source") == "report.md", "PDF validation file identities differ")
    require(metadata.get("sha256") == sha256(pdf_bytes) and metadata.get("bytes") == len(pdf_bytes), "PDF validation hash/bytes are stale")
    require(metadata.get("source_sha256") == sha256(markdown_bytes), "PDF validation Markdown hash is stale")
    require(metadata.get("pages") == len(page_text), "PDF validation page count differs")
    require(metadata.get("empty_pages") == [], "PDF validation records empty pages")
    require(metadata.get("all_current_ids_present") is True and metadata.get("all_chapters_present") is True,
            "PDF validation does not assert all finding IDs and chapters")
    return {"chapters": 15, "finding_sections": 35, "pdf_pages": len(page_text), "pdf_sha256": sha256(pdf_bytes),
            "markdown_sha256": sha256(markdown_bytes), "visible_word_occurrence_coverage": round(coverage, 6),
            "limit": "Text coverage is a bounded consistency check; it does not replace separate rendered-page visual review."}


def verify_phase_a(root: Path) -> dict:
    publication = json_file(root / "phase-a-publication.json")
    freeze = json_file(root / "phase-a-freeze.json")
    require(publication.get("audit_id") == AUDIT_ID and freeze.get("audit_id") == AUDIT_ID, "Phase A audit identity differs")
    original = publication.get("original", {})
    derivative = publication.get("derivative", {})
    require(original.get("sha256") == SEALED_PHASE_A and original.get("bytes") == 71049, "Original sealed Phase A identity differs")
    require(freeze.get("phase_a_findings", {}).get("sha256") == SEALED_PHASE_A
            and freeze.get("phase_a_findings", {}).get("bytes") == 71049, "Phase A freeze original identity differs")
    require(freeze.get("historical_findings_read_before_completion") is False, "Phase A independence declaration differs")
    public_bytes = (root / "phase-a-findings.md").read_bytes()
    require(derivative.get("sha256") == sha256(public_bytes) and derivative.get("bytes") == len(public_bytes),
            "Public Phase A derivative identity differs")
    header = public_bytes.decode("utf-8")[:2500]
    require("derivative" in header.lower() and SEALED_PHASE_A in header, "Public Phase A must clearly identify its derivative status and original digest")
    require(sha256(public_bytes) != SEALED_PHASE_A, "Public derivative must not be presented as the original sealed bytes")
    return {"sealed_original_sha256": SEALED_PHASE_A, "public_derivative_sha256": sha256(public_bytes),
            "limit": "Original bytes are not required in this public package; their external protected/Git checkpoint identity is declared, not re-read here."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audit-dir", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--prior-history", type=Path, help="Optional prior v3.1.0 historical-findings.csv; autodetected in sibling audit directory")
    parser.add_argument("--expected-manifest-sha256", help="Digest from an independently retained external attestation")
    args = parser.parse_args()
    root = args.audit_dir.resolve()
    result = {"audit_id": AUDIT_ID, "verifier": "verify_artifacts.py", "read_only": True,
              "network_or_production_calls": False, "checks": {}}
    try:
        require(root.is_dir(), "Audit directory does not exist")
        for name in REQUIRED:
            path = local_path(root, name)
            require(path.is_file() and path.stat().st_size > 0, f"Required artifact missing or empty: {name}")
        result["checks"]["required_nonempty_files"] = len(REQUIRED)
        result["checks"]["outer_manifest"] = verify_archive(root, args.expected_manifest_sha256)
        result["checks"]["public_evidence"] = verify_evidence(root)
        prior = args.prior_history or root.parent / "2026-10-27-xita-direct-bls-delta-v3.1.0/historical-findings.csv"
        if args.prior_history:
            require(prior.is_file(), "Explicit prior historical CSV does not exist")
        result["checks"]["registers"] = verify_registers(root, prior)
        result["checks"]["report"] = verify_report(root)
        result["checks"]["phase_a"] = verify_phase_a(root)
        result["status"] = "PASS"
    except (VerificationError, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as exc:
        result["status"] = "FAIL"
        result["error"] = str(exc)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
