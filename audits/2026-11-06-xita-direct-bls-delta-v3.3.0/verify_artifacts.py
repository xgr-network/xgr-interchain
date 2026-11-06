import hashlib,json,pathlib
r=pathlib.Path(__file__).resolve().parent
m=json.loads((r/"archive-manifest.json").read_text())
for x in m["files"]:
 p=r/x["path"];assert p.is_file(),p;assert hashlib.sha256(p.read_bytes()).hexdigest()==x["sha256"],p
s=json.loads((r/"finding-statistics.json").read_text());assert s["total"]==39;assert sum(s["current"].values())==39
print("Verified",len(m["files"]),"artifact hashes and 39-entry statistics")
