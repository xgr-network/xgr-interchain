#!/usr/bin/env python3
"""Optional, read-only reproduction of the two frozen local Git source scopes.

Usage: python reproduce_source_scope.py --interchain /path/to/xgr-interchain
                                      --node /path/to/xgr-node

Reads existing Git objects only. Does not fetch, clone, checkout, reset, install,
run product tests, contact RPC endpoints or make any production call. Audit
publication commits after the frozen product heads are intentionally irrelevant.
The artifact verifier is independent of this optional source availability check.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import subprocess

EXPECTED = {
    "xgr-network/xgr-interchain": {
        "baseline_commit": "26d1356ce7c92eed67bfdbb91a5a0b19efc25ae3",
        "frozen_commit": "5cfc095d0f02271427832ee6bbb268322f38ae2d",
        "baseline_tree": "de63f3712463012a9fdb1efdeff81d30524a0ef6",
        "frozen_tree": "4b19f296d2791eec0a98b1f0e4e60ca0225963f9",
        "commits_including_merges": 62, "merge_commits": 3, "net_changed_files": 48, "all_touched_files": 48,
        "diff_sha256": "852139e49f3dbd60c58117a350def496437dcc87a1e0c398e26cca1c9db06e70",
    },
    "xgr-network/xgr-node": {
        "baseline_commit": "51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671",
        "frozen_commit": "51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671",
        "baseline_tree": "3c5d1a0a1e7264b8b7c5787ca390e976fed09b04",
        "frozen_tree": "3c5d1a0a1e7264b8b7c5787ca390e976fed09b04",
        "commits_including_merges": 0, "merge_commits": 0, "net_changed_files": 0, "all_touched_files": 0,
        "diff_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    },
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def git(repo: Path, *arguments: str) -> bytes:
    environment = os.environ.copy()
    environment.update({"GIT_OPTIONAL_LOCKS": "0", "GIT_NO_REPLACE_OBJECTS": "1", "GIT_NO_LAZY_FETCH": "1",
                        "GIT_TERMINAL_PROMPT": "0", "LC_ALL": "C"})
    command = ["git", "--no-pager", "-c", "core.quotePath=true", "-c", "diff.algorithm=myers",
               "-c", "diff.renames=true", "-c", "color.ui=false", "-C", str(repo), *arguments]
    process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment, check=False)
    require(process.returncode == 0, f"Git command failed ({' '.join(arguments)}): {process.stderr.decode(errors='replace').strip()}")
    return process.stdout


def split_paths(output: bytes) -> set[str]:
    return {entry.decode("utf-8") for entry in output.split(b"\0") if entry}


def verify_repository(name: str, repo: Path, declared: dict, inventory: list[dict]) -> dict:
    expected = EXPECTED[name]
    for field, value in expected.items():
        require(declared.get(field) == value, f"Declared scope differs from frozen audit constants: {name}/{field}")
    require(declared.get("baseline_is_ancestor") is True, f"Scope does not declare baseline ancestry: {name}")
    base, head = expected["baseline_commit"], expected["frozen_commit"]
    for revision in {base, head}:
        require(git(repo, "rev-parse", "--verify", revision + "^{commit}").decode().strip() == revision,
                f"Frozen commit object unavailable: {revision}")
    git(repo, "merge-base", "--is-ancestor", base, head)
    base_tree = git(repo, "rev-parse", base + "^{tree}").decode().strip()
    head_tree = git(repo, "rev-parse", head + "^{tree}").decode().strip()
    commits = git(repo, "rev-list", base + ".." + head).decode().split()
    merges = git(repo, "rev-list", "--merges", base + ".." + head).decode().split()
    changed = split_paths(git(repo, "diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", base, head, "--"))
    touched = set()
    for commit in commits:
        touched.update(split_paths(git(repo, "diff-tree", "-m", "--root", "--no-commit-id", "--name-only", "-r", "-z", commit, "--")))
    patch = git(repo, "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--binary", "--full-index",
                "--src-prefix=a/", "--dst-prefix=b/", "--unified=3", base, head, "--")
    measured = {"baseline_tree": base_tree, "frozen_tree": head_tree, "commits_including_merges": len(commits),
                "merge_commits": len(merges), "net_changed_files": len(changed), "all_touched_files": len(touched),
                "diff_sha256": hashlib.sha256(patch).hexdigest()}
    for field, value in measured.items():
        require(value == expected[field], f"Source mismatch: {name}/{field}: {value!r} != {expected[field]!r}")
    require(changed == touched, f"Touched path union differs from endpoint changes: {name}")
    rows = [row for row in inventory if row["repository"] == name]
    require(len(rows) == len(changed) and {row["path"] for row in rows} == changed, f"Inventory paths differ from frozen Git scope: {name}")
    for row in rows:
        require(row["review_status"] == "REVIEWED", f"Unreviewed inventory path: {row['path']}")
        if row["change_status"] != "D":
            blob = git(repo, "show", head + ":" + row["path"])
            require(hashlib.sha256(blob).hexdigest() == row["frozen_sha256"], f"Frozen blob digest differs: {row['path']}")
    return {"repository": name, "baseline_commit": base, "frozen_commit": head, "baseline_is_ancestor": True,
            **measured, "inventory_blob_hashes_checked": sum(row["change_status"] != "D" for row in rows), "status": "PASS"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--interchain", type=Path, required=True)
    parser.add_argument("--node", type=Path, required=True)
    parser.add_argument("--audit-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    result = {"audit_id": "XITA-DBLS-2026-10-29-v3.2.0", "verifier": "reproduce_source_scope.py",
              "optional": True, "read_only": True, "network_or_production_calls": False, "repositories": []}
    try:
        scope = json.loads((args.audit_dir / "scope-and-baselines.json").read_text(encoding="utf-8"))
        declarations = {row["repository"]: row for row in scope["repositories"]}
        require(set(declarations) == set(EXPECTED), "Scope must name exactly the two authorized repositories")
        with (args.audit_dir / "change-inventory.csv").open(encoding="utf-8", newline="") as handle:
            inventory = list(csv.DictReader(handle))
        require(len(inventory) == 48 and all(row["repository"] in EXPECTED for row in inventory), "Inventory scope differs")
        for name, path in (("xgr-network/xgr-interchain", args.interchain), ("xgr-network/xgr-node", args.node)):
            result["repositories"].append(verify_repository(name, path.resolve(), declarations[name], inventory))
        result["status"] = "PASS"
        result["limit"] = "Checks frozen local Git object identity and inventory, not installed production binaries, host configuration, live RPC state or semantic correctness."
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        result["status"] = "FAIL"
        result["error"] = str(exc)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
