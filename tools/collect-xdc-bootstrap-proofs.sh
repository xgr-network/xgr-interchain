#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
proof_dir="${XITA_PUBLIC_BOOTSTRAP_DIR:-$HOME/xita-bootstrap-public}/xdc"
data_dir="$HOME/xgrchain/data"
node_commit=25fea57a56d21c34a914050daf0d50cad6dc7e32

mkdir -p -- "$proof_dir"
exec 9>"$proof_dir/.collect.lock"
flock 9
work_dir=$(mktemp -d "$proof_dir/.collect.XXXXXXXX")
trap 'rm -rf -- "$work_dir"' EXIT

binary=${XITA_BOOTSTRAP_BINARY:-"$work_dir/xgrchain"}
if [[ -z ${XITA_BOOTSTRAP_BINARY:-} ]]; then
  go_binary=$(command -v go || true)
  if [[ -z "$go_binary" && -x /usr/local/go/bin/go ]]; then
    go_binary=/usr/local/go/bin/go
  fi
  if [[ -z "$go_binary" ]]; then
    printf 'Go is required on the main validator host to build the pinned xgrchain CLI.\n' >&2
    exit 1
  fi
  git init -q "$work_dir/source"
  git -C "$work_dir/source" fetch -q --depth=1 https://github.com/xgr-network/xgr-node.git "$node_commit"
  git -C "$work_dir/source" checkout -q --detach "$node_commit"
  (
    cd -- "$work_dir/source"
    "$go_binary" build -trimpath -o "$binary" .
  )
fi

# Use the same CLI on each host. SSH transports the executable and returns
# public JSON. Each validator opens its own data directory locally.
collect_remote() {
  ssh -T -C -o BatchMode=yes "$1" '
    set -eu
    umask 077
    binary=$(mktemp "${TMPDIR:-/tmp}/xgrchain-proof.XXXXXXXX")
    trap '\''rm -f -- "$binary"'\'' EXIT
    cat > "$binary"
    chmod 700 "$binary"
    "$binary" ibft interchain bootstrap-proof --scheme ecdsa \
      --data-dir "$HOME/xgrchain/data" --origin-chain-id 1643 --destination-domain 50 --json
  ' < "$binary" > "$2"
}

collect_remote xgradmin@82.165.218.224 "$work_dir/validator-1.txt"
collect_remote xgradmin@217.154.225.155 "$work_dir/validator-2.txt"
"$binary" ibft interchain bootstrap-proof --scheme ecdsa \
  --data-dir "$data_dir" --origin-chain-id 1643 --destination-domain 50 --json > "$work_dir/validator-3.txt"

(
  cd -- "$repo_dir"
  node --input-type=module - "$work_dir" <<'NODE'
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {parsePublicProof} from "./services/admin/bootstrap-evidence.mjs";
import {validateECDSABootstrapProof} from "./services/admin/ecdsa-bootstrap-proof.mjs";

const readJSON=path=>JSON.parse(readFileSync(path,"utf8"));
const chain=readJSON("config/chains/xdc/chain.json");
const {validators}=readJSON("config/validators/xdc.json");
for(const [index,validator] of validators.entries()){
 const file=join(process.argv[2],"validator-"+(index+1)+".txt");
 const proof=parsePublicProof(readFileSync(file,"utf8"));
 validateECDSABootstrapProof(proof,{chain,approvedValidators:[validator]});
}
NODE
)

for index in 1 2 3; do
  mv -fT -- "$work_dir/validator-$index.txt" "$proof_dir/validator-$index.txt"
done
printf '3 public XDC Genesis proofs saved to %s\n' "$proof_dir"
