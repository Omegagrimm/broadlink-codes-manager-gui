"""Set actual GitHub URL metadata before publishing a HACS custom repository."""
import json
import re
import sys
from pathlib import Path

if len(sys.argv) != 2 or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", sys.argv[1]):
    print("Usage: python scripts/prepare_repository.py OWNER/REPO")
    raise SystemExit(2)

owner_repo = sys.argv[1]
manifest_path = Path(__file__).resolve().parents[1] / "custom_components/rm4_code_manager/manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["documentation"] = f"https://github.com/{owner_repo}#readme"
manifest["issue_tracker"] = f"https://github.com/{owner_repo}/issues"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Prepared HACS metadata for https://github.com/{owner_repo}")
