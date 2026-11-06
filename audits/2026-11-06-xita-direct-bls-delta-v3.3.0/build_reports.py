#!/usr/bin/env python3
"""Build the public audit record from frozen source and retained execution evidence.
No product writes, RPC calls, signing, deployment or service operations occur here.
"""
import argparse, collections, csv, hashlib, html, io, json, re, shutil, subprocess, zipfile
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4

AUDIT_DIR = 'audits/2026-11-06-xita-direct-bls-delta-v3.3.0'
PREVIOUS = 'audits/2026-10-29-xita-direct-bls-delta-v3.2.0'
FIXED_TIME = (2026, 11, 6, 9, 0, 0)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def readj(path):
    return json.loads(Path(path).read_text())

def writej(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=True) + '\n')

def git(root, *args):
    return subprocess.check_output(['git', '-c', 'safe.directory='+str(root), '-C', str(root), *args], text=True).strip()

def csv_write(path, rows, fields=None):
    fields = fields or list(rows[0])
    with Path(path).open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({k: json.dumps(v, sort_keys=True) if isinstance(v, (list, dict)) else v for k, v in row.items()})

def zip_tree(root, target, paths):
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in sorted(paths):
            info = zipfile.ZipInfo(p.relative_to(root).as_posix(), FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, p.read_bytes())

def parse_refs(value):
    if isinstance(value, list):
        return value
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else [parsed]
    except (ValueError, TypeError):
        result = []
        decoder = json.JSONDecoder()
        text = str(value).strip()
        while text:
            try:
                obj, end = decoder.raw_decode(text)
                result.append(obj)
                text = text[end:].lstrip('; \n')
            except ValueError:
                break
        return result

def source_refs(items, roots, data):
    result = []
    seen = set()
    for item in items:
        if isinstance(item, str):
            item = {'path': item.split(':', 1)[0]}
        if not isinstance(item, dict) or not item.get('path'):
            continue
        path = item['path']
        repo = item.get('repository', '')
        if '/' in repo:
            repo = repo.rsplit('/', 1)[-1]
        if repo not in roots:
            repo = 'xgr-node' if item.get('commit') == data['baselines']['xgr-node'] else 'xgr-interchain'
        if (repo, path) in seen:
            continue
        seen.add((repo, path))
        root = roots[repo]
        if not (root/path).is_file():
            raise ValueError('Unresolved current source reference: '+repo+'/'+path)
        current = git(root, 'rev-parse', data['targets'][repo]+':'+path)
        try:
            previous = git(root, 'rev-parse', data['baselines'][repo]+':'+path)
        except subprocess.CalledProcessError:
            previous = None
        result.append({'repository':repo, 'path':path, 'target':data['targets'][repo], 'target_blob':current,
                       'baseline_blob':previous, 'unchanged':previous == current,
                       'url':'https://github.com/xgr-network/'+repo+'/blob/'+data['targets'][repo]+'/'+path})
    return result

def inventory(root, baseline, target, repo):
    rows = []
    for line in git(root, 'diff', '--name-status', baseline, target).splitlines():
        parts = line.split('\t')
        status, path = parts[0], parts[-1]
        category = ('audit_publication' if path.startswith('audits/') else
                    'test' if '.test.' in path or path.endswith('_test.go') or path.startswith('test/') else
                    'ci' if path.startswith('.github/') else
                    'documentation' if path.endswith('.md') else
                    'source' if path.endswith(('.go','.sol','.js','.mjs','.cjs','.py','.sh','.sql')) else
                    'configuration_or_artifact')
        rows.append({'repository':repo,'path':path,'change':status,'category':category,
                     'coverage':'Complete change inventory; security-path review depth is described separately, not line coverage.'})
    return rows

def text_inline(text):
    text = html.escape(text)
    text = re.sub(r'`([^`]+)`', r'<font name="Courier">\1</font>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<b>\1</b>', text)
    return text

def pdf(md, target, short_title, audit_id):
    styles = {
        'h1': ParagraphStyle('h1', fontName='Helvetica-Bold',fontSize=23,leading=28,textColor=colors.HexColor('#143C34'),spaceAfter=16),
        'h2': ParagraphStyle('h2', fontName='Helvetica-Bold',fontSize=15,leading=19,textColor=colors.HexColor('#143C34'),spaceBefore=16,spaceAfter=9,keepWithNext=True),
        'h3': ParagraphStyle('h3', fontName='Helvetica-Bold',fontSize=11.5,leading=15,spaceBefore=11,spaceAfter=6,keepWithNext=True),
        'body': ParagraphStyle('body',fontName='Helvetica',fontSize=9.4,leading=13.4,spaceAfter=7,splitLongWords=True,allowWidows=0,allowOrphans=0),
        'small': ParagraphStyle('small',fontName='Helvetica',fontSize=8,leading=11,spaceAfter=5,splitLongWords=True),
    }
    story=[]
    for block in re.split(r'\n\s*\n', md.strip()):
        block=block.strip()
        if block == '---PAGE---':
            story.append(PageBreak());continue
        if block.startswith('# '):
            story.append(Paragraph(text_inline(block[2:]),styles['h1']));continue
        if block.startswith('## '):
            story.append(Paragraph(text_inline(block[3:]),styles['h2']));continue
        if block.startswith('### '):
            story.append(Paragraph(text_inline(block[4:]),styles['h3']));continue
        if block.startswith('- '):
            for line in block.splitlines():
                story.append(Paragraph(text_inline(line),styles['body']))
            continue
        style='small' if block.startswith(('Source:','Evidence reference:','Frozen identity:')) else 'body'
        story.append(Paragraph(text_inline(block).replace('\n','<br/>'),styles[style]))
    def footer(c, doc):
        c.saveState()
        w,h=A4
        c.setStrokeColor(colors.HexColor('#CAD6D1'));c.setLineWidth(.5);c.line(48,h-37,w-48,h-37)
        c.setFont('Helvetica',8);c.setFillColor(colors.HexColor('#46564F'))
        c.drawString(48,h-29,'XGR NETWORK  |  SECURITY REVIEW  |  06 NOV 2026')
        c.drawString(48,29,audit_id)
        c.drawRightString(w-48,29,str(doc.page))
        c.restoreState()
    class StableCanvas(canvas.Canvas):
        def __init__(self,*args,**kwargs):
            kwargs['invariant']=1
            super().__init__(*args,**kwargs)
    doc=SimpleDocTemplate(str(target),pagesize=A4,rightMargin=48,leftMargin=48,topMargin=55,bottomMargin=49,
                          title=short_title,author='XGR Network - AI-assisted security review',pageCompression=1)
    doc.build(story,onFirstPage=footer,onLaterPages=footer,canvasmaker=StableCanvas)

NODE_TEXT = '''# XGR node v3.5.0\nBLS possession security delta review

**Review ID:** XGR-POP-2026-11-06-v1.0.0. **Date:** 6 November 2026. AI-assisted source/execution review by OpenAI GPT-6 Astra Pro. Solana is excluded. This companion is separate from the XITA finding count.

## 1. Opinion and exact boundary

**CONDITIONAL GO within the reviewed possession delta.** The known legacy rogue-key admission cause is verified remediated on the frozen source. No additional Critical or High vulnerability was demonstrated in the examined possession admission, migration and validator-selection paths. This statement is not a proof that no bug exists, a whole-node audit, an accredited external certificate or a per-host binary attestation.

The reviewed target is xgr-node a84c82737dc3ca195192a96498eab0e170f8bb5a. The possession baseline is 0d9aca695c49784da64736d78620cc1bba4f7daa. The security source/tag commit is b3717a44b5ec5faa19fabdd88bd4b91f54659983; the later target adds documentation. The broader Interchain comparison begins at 51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671 and includes nine commits/65 changed paths. The complete inventory is supplied; inventory is not a numerical line-coverage claim.

The Mainnet gate at height 12,586,649 is already activated. Testnet height 6,613,834 is recorded in the canonical release documentation, not newly exercised on public Testnet here. This review does not authorize a new activation height, replacement manifest, repeated migration, restaking, database reset or rollback to a pre-v3.5.0 node. Normal operation must retain the canonical configuration and proven-key selection.

## 2. Threat model and known cause

The original defect concerned aggregation of consensus BLS keys admitted without proof that the registrant possessed the corresponding secret. The reviewed fix requires a possession proof at key registration/rotation, authenticates existing keys through the migration manifest, and applies the proven-key restriction to normal and fallback/cached consensus selection. Merely patching the public registration function would not be sufficient if legacy keys or fallback snapshots could bypass admission.

The review therefore followed key material from proof creation through canonical encoding, on-chain verification/storage, pre-transaction migration, epoch selection, historical parent seals and a fresh node importing the fork. It also checked that the unrelated Interchain proof domain is not substituted for a staking proof. No production attack transaction was submitted. New unresolved exploit recipes would remain protected; the current public record describes controls and evidence without claiming unrestricted exploit completeness.

## 3. Signature and replay boundaries

The proof digest binds XGR_STAKING_BLS_POP_V1, the chain identifier, staking contract address, validator address, public-key hash and registration nonce. The wallet/ECDSA authority and BLS secret remain distinct. Another address, chain, contract, key or used nonce cannot legitimately reuse the proof under these checks. Fresh crypto, contract, CLI and manifest regressions exercise malformed/missing/wrong-context proof rejection and valid ordinary signatures.

Canonical point conversion and verification reject invalid lengths, noncanonical encodings, invalid subgroup/infinity cases covered by the checked tests. The independent legacy aggregate-forgery regression and ordinary-signature controls provide targeted evidence for the original repair. This is an application-level review of the repository's encoding/verifier usage, not a new mathematical proof of the underlying pairing library. The exact dependency and source identities are retained with the frozen repositories.

Source: crypto/staking_pop.go; contracts/staking/StakingV2.sol; consensus/ibft/blspop/manifest.go; consensus/ibft/blspop/rogue_key_test.go; consensus/ibft/blspop/aggregate_review_test.go.

## 4. Manifest authenticity and complete coverage

The migration manifest uses strict versioned canonical JSON and canonical public key/proof representations, deterministic ordering and duplicate rejection. Digest equality alone is not sufficient: runtime validation also compares the evidence with the parent-state registered inventory and the canonical signing snapshot. The reviewed implementation requires exact coverage, including needed historical snapshot keys; it does not silently accept a quorum-only subset or reduce the quorum when evidence is missing.

Size/key-count bounds prevent unbounded configuration decoding in the reviewed path. Missing, extra, duplicated, malformed or mismatched evidence fails closed. Canonical configuration remains necessary for restart and replay even after the on-chain proof marker is present. Offline verification checks proof/encoding/digest; it must not be described as independently proving parent-state inventory without that state.

Source: consensus/ibft/blspop/manifest.go; chain/params.go; consensus/ibft/staking_pop.go; state/staking_pop.go; command/ibft/blspop/.

## 5. State transition and storage compatibility

One fork gate jointly activates the reviewed staking runtime, migration and proof-enforced admission. The shared pre-transaction hook executes on proposal and import. The reviewed transition checks its expected legacy state/runtime before applying the deterministic migration, and keeps later validation fail-closed. The appended state is distinct from the existing staking/delegation layout: verified address/key history, registration nonces and the manifest marker are added without replacing existing stake ownership.

The pinned build reproduced the generated ABI, creation/runtime bytecode and storage layout. The legacy prefix and recursively resolved structure layout checks passed. The reviewed runtime is 11,627 bytes with SHA-256 120acc0e54f2af48adcb1518186f39d9a93244a52087927cdf554e7c8cf3f864. Fresh Solidity execution and Go/storage agreement tests cover proof recording, nonce replay, migration idempotence and preservation of stake/balance state. These finite tests do not enumerate every possible mapping state.

Source: state/staking_pop.go; state/executor.go; contracts/staking/pop_artifact.go; contracts/staking/pop-artifact/StakingV2PoP.json; scripts/build-staking-pop.mjs; state/staking_pop_contract_test.go.

## 6. Consensus selection and historical import

The activation boundary derives signing authority from the appropriate parent view rather than allowing a proposed post-state to authorize itself. Proven-key checks cover normal selection, fallback paths and cached signing sets. ParentCommittedSeals use the rules of the parent's signed height, preserving validation of pre-fork history across the transition. The legacy registration selector is not an accepted post-fork fallback.

Fresh tests exercised activation before/on/after epoch boundaries, restart behavior, cached snapshots, manifest coverage and historical access. The isolated integration test used four validators plus an observer, restarted a validator and synchronized a fresh sixth node from Genesis through the fork. Every participating node agreed at the sampled activation height. This is stronger than a single process accepting its own block but is not a full adversarial network campaign or a fresh Mainnet replay.

Source: consensus/ibft/staking_pop.go; consensus/ibft/fork/manager.go; validators/store/contract/fetcher.go; consensus/ibft/ibft.go; e2e/staking_pop_fork_e2e_test.go.

## 7. Validator join and operational compatibility

The join CLI detects the reviewed runtime, queries chain ID and the live nonce, creates the proof using the existing local BLS identity and submits the proof-bearing registration. Unknown runtime identity and failed proof registration fail closed instead of reverting to an unproven registration call. A new validator does not edit the historical migration manifest. Existing migrated validators do not need to join again or restake for this fork.

Successful transaction submission is not the same as confirmed registration or active-set eligibility. If a stake transaction succeeded but registration did not, operators must inspect the existing identity/state/receipts rather than generate new keys or duplicate stake blindly. No live join was performed by this audit. The existing chain's support/epoch rules remain outside any implied new admission guarantee.

Source: command/ibft/join/join.go; command/ibft/join/staking_pop_test.go; command/ibft/blspop/; docs/security/v3.5.0-rollout.md.

## 8. Fresh execution evidence

E-02 is a new execution of bash scripts/validate-v3.5.0.sh on the exact target, not merely a historical CI screenshot. Go 1.23.11, the pinned npm/solc 0.8.30 build, 19 selected package groups and the complete Go build passed. The package list includes chain, crypto, staking artifacts/helpers, state/precompiles, contract validator fetcher, IBFT/fork/signer/manifest, proof/join CLI and Interchain core/EVM/runtime/verification integration.

TestStakingPoP_FourValidatorSingleForkAndFreshSync passed in 77.06 seconds. At isolated activation height 35 the recorded block hash is 0x3aa709ba2640b7a2fb55b5b3a87cea7240db5a165a53c41085739c73ea27335e and state root is 0x762aff52f766767c7829dca5d6c35d2a3c04d02d3306499cdd0e48cf4b26b3f8. These hashes identify this ephemeral test execution; another valid fresh devnet need not produce identical values. Agreement within a run is the tested invariant.

E-04 separately repeats JSON-RPC, Interchain runtime and possession/manifest packages three times; all pass. The isolated fork test disables Interchain workers before construction and uses loopback endpoints/ephemeral identities. No production keys, transfers, deployment or service restart are involved. Broader unrelated whole-repository end-to-end suites were not newly executed and are not claimed covered.

## 9. Read-only Mainnet observations

E-05 queried both configured XGR RPC endpoints using an explicit read-only method allowlist. Both report xgrchain/v3.5.0/linux-amd64/go1.23.11. Both expose the exact 11,627-byte staking runtime hash above and the migration marker 0x98803459ccdbbf1a8b89d8c44c95081661ebdeb3e037eb0c144126e74ec5d735. They agree on block and state hashes at 12,586,648, 12,586,649 and 12,587,000. Full values and query timestamps are in evidence/read-only-deployments.json.

This is a fresh observation of the queried canonical RPC views, not an independent physical-host attestation. The two URLs can share infrastructure. The earlier canonical release document records five migration keys, per-key proof/nonces and selected unchanged stake/delegation state across the fork; those broader November 5 measurements are retained as documented prior observations, not silently presented as freshly repeated here.

## 10. Installed binary identity qualification

The canonical release record identifies source/tag b3717a44b5ec5faa19fabdd88bd4b91f54659983 and published asset SHA-256 e11e4398cb0e7757fc2b788f1dde177bd00758329ec52bbc1579f8655604e96e, with Go 1.23.12. The fresh endpoint client strings instead report Go 1.23.11, matching the test toolchain. This does not demonstrate a consensus vulnerability: the observed runtime, marker and sampled history agree. It does mean that the exact installed executable cannot be equated with the documented release asset on the strength of a version string alone.

A targeted existing executable checksum/embedded-commit inventory would resolve this traceability question. No restart, rollback, new migration or new transaction is justified by the missing host digest alone. The source opinion and positive runtime observations remain scoped to what was actually checked.

## 11. Interchain separation and retained limits

Staking possession and Registry V3/Direct-BLS membership are separate cryptographic domains. This release does not imply new XITA router contracts, new signature wire encodings or Solana support. The test-only interchainRuntimeDisabled option prevents worker construction in isolated tests; it is not another chain fork gate. Configuration/digest consistency remains operationally important on every node.

The companion review does not close XITA availability/trust findings by association with a successful consensus fix. External RPC trust, worker shutdown bounds, durable recovery handoff and optional sponsorship lifecycle remain separately classified in the XITA report. Likewise, green XITA contract tests do not prove the possession migration on arbitrary production history.

## 12. Acceptance and remaining evidence

The known rogue-key cause is recorded as VERIFIED / RESOLVED for the reviewed source, supported by fresh rejection, ordinary-key, context-binding, state and fork/import evidence. No additional reportable Critical or High cause was demonstrated in the reviewed possession delta. This is a targeted evidence-based conclusion, not a guarantee or an independent audit firm's certificate.

Continue only with the canonical already activated configuration and compatible proven-key enforcement. Retain manifests, keys, datadirs and normal backup/release controls. Resolve installed executable identity through existing host checks where required. Reporter disclosure/advisory closure/rewards remain separate actions and were not performed. No new risk acceptance, production enablement or infrastructure mutation was made by this audit.
'''

LEGACY_NOTES = {
 'M-01':'Native-finality and wallet source-verification enforcement remains present; changed BSC/finality configuration is reviewed separately. Fresh chain-finality/gas-sponsor tests pass; prior actual-entrypoint negatives remain inherited.',
 'M-02':'Pinned native finality, revisitable indexed delivery state and UI reversal controls remain. Fresh indexer/finality tests pass; native deferred principal is a distinct F-09 issue.',
 'M-03':'The only Direct-message signing boundary still has synchronization checks before expensive work and immediately before signing. Changed checkpoint and IBFT integration does not bypass those checks; fresh runtime/IBFT tests pass.',
 'M-06':'The discovery hint lease/rotation/invalid-hint controls remain unchanged and fresh runtime tests pass. New bounded unknown-route storage is separately verified under F-32.',
 'L-02':'Dynamic bounded exact-gift gas estimation remains, rather than a fixed 21,000 gas assumption. Fresh gas-sponsor tests pass; unsupported recipients still fail closed.',
 'N-02':'The message verifier still selects the intended dispatch before its bound topic checks and requires a unique matching operation. Fresh EVM package tests pass on unchanged verification source.',
 'N-05':'The original two-hop stage admission remains eligible from the paid source operation, rather than requiring a child grant first. Fresh stage tests pass; interruption/outcome problems remain separately tracked.',
 'N-07':'Sorted chain admission locks and aggregate outstanding liability/payout-gas reservation remain. Fresh funding/commitment tests pass; conservative overlap is separately F-18.',
 'N-08':'Confirmed payout state remains gated by native finality in initial and recovery paths. Provisional spendable projection remains distinct and is separately F-34.',
 'N-10':'Validated wallet-keyed source hints are restored on reconnect and remain separate from canonical authorization. Fresh hint/pending tests pass; catalog-fixture drift is separately F-14.',
 'N-12':'Promise-bearing intent/commitment selection still precedes the candidate limit. Fresh stage tests pass and original actual-PostgreSQL starvation evidence remains inherited; provider waits remain F-08.'
}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--interchain',required=True);ap.add_argument('--node',required=True)
    ap.add_argument('--evidence',required=True);ap.add_argument('--out',required=True)
    args=ap.parse_args()
    here=Path(__file__).resolve().parent;out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    roots={'xgr-interchain':Path(args.interchain).resolve(),'xgr-node':Path(args.node).resolve()}
    evidence=Path(args.evidence).resolve();data=readj(here/'assessment-data.json')
    # Correct a transcription-only path in the initial adjudication record.
    for item in data['findings']:
        if item['id']=='F-38':item['paths']=['services/onboarding/creator-chain-proof.mjs']
    for repo,root in roots.items():
        assert git(root,'rev-parse','HEAD')==data['targets'][repo]
    previous=roots['xgr-interchain']/PREVIOUS
    old=readj(previous/'finding-details.json');oldmap={x['id']:x for x in old}
    findings=[];comparisons=[]
    for item in data['findings']:
        prior=oldmap.get(item['id'],{})
        rec=dict(item)
        rec['title']=item.get('title',prior.get('title'))
        rec['prior_severity']=prior.get('current_severity','NEW')
        rec['prior_disposition']=prior.get('disposition','NEW')
        rec['historical_severity']=prior.get('historical_severity',item['severity'])
        rec['original_cause']=item.get('cause',prior.get('original_cause',''))
        rec['new_finding']=not bool(prior)
        refs=prior.get('track_assessment',{}).get('source_refs') or parse_refs(prior.get('source_refs',''))
        refs=list(refs)+[{'path':p} for p in item.get('paths',[])]
        rec['source_refs']=source_refs(refs,roots,data)
        comparisons.append({'id':rec['id'],'dependencies':rec['source_refs']})
        findings.append(rec)
    counts=dict(collections.Counter(x['severity'] for x in findings))
    for s in data['expected_counts']:counts.setdefault(s,0)
    assert counts==data['expected_counts'],counts
    assert len(findings)==39 and len(old)==35
    fmap={x['id']:x for x in findings}
    writej(out/'assessment-data.json',data);writej(out/'finding-details.json',findings)
    writej(out/'finding-statistics.json',{'current':counts,'total':39,'previous':{'Medium':14,'Low':12,'Informational':2,'RESOLVED':7,'Critical':0,'High':0},'new_ids':['F-36','F-37','F-38','F-39'],'newly_resolved':['F-06','F-32','F-33'],'downgraded_not_closed':['F-04'],'counting':'Unique current XITA causes; no duplicate historical occurrences or companion legacy cause added.'})
    fields=['id','title','prior_severity','severity','prior_disposition','status','new_finding','assessment','evidence','limits','remediation']
    csv_write(out/'findings.csv',findings,fields)
    evout=out/'evidence';evout.mkdir(exist_ok=True)
    writej(evout/'current-source-comparison.json',comparisons)
    inv=[]
    for repo,root in roots.items():inv+=inventory(root,data['baselines'][repo],data['targets'][repo],repo)
    assert sum(x['repository']=='xgr-interchain' for x in inv)==333
    assert sum(x['repository']=='xgr-node' for x in inv)==65
    writej(out/'change-inventory.json',inv);csv_write(out/'change-inventory.csv',inv)
    for repo,root in roots.items():
        (evout/(repo+'-commits.tsv')).write_text(git(root,'log','--format=%H%x09%aI%x09%s',data['baselines'][repo]+'..'+data['targets'][repo])+'\n')
    history=list(csv.DictReader((previous/'historical-findings-matrix.csv').open()))
    assert len(history)==43
    oldfields=list(history[0]);hsrc=[]
    for row in history:
        current=fmap.get(row['v3_2_current_finding_id'])
        refs=source_refs(parse_refs(row['v3_2_source_refs']),roots,data)
        hsrc.append({'occurrence':row['audit']+'/'+row['id'],'sources':refs})
        row.update({'v3_3_audit_id':data['audit_id'],'v3_3_current_finding_id':row['v3_2_current_finding_id'],
                    'v3_3_severity':current['severity'] if current else 'RESOLVED',
                    'v3_3_disposition':current['status'] if current else 'VERIFIED / RESOLVED',
                    'v3_3_assessment':current['assessment'] if current else LEGACY_NOTES[row['id']],
                    'v3_3_evidence':current['evidence'] if current else 'Fresh source reinspection/comparison and relevant E-01/E-02 regression execution; prior custom entrypoint evidence remains inherited.',
                    'v3_3_source_refs':json.dumps(refs),'v3_3_duplicate_of':row['v3_2_duplicate_of'],
                    'v3_3_counting_note':'Historical occurrence only; not an additional current finding.'})
    csv_write(out/'historical-findings-matrix.csv',history)
    # Exact preservation of all old columns is independently asserted.
    reread=list(csv.DictReader((out/'historical-findings-matrix.csv').open()))
    original=list(csv.DictReader((previous/'historical-findings-matrix.csv').open()))
    assert all(all(a[k]==b[k] for k in oldfields) for a,b in zip(original,reread))
    writej(evout/'historical-source-comparison.json',hsrc)
    (out/'prior-findings-matrix.md').write_text('# Historical reconciliation - 43 occurrences\n\nAll original columns are retained verbatim in the CSV. Repeated historical occurrences do not add unique findings.\n\n'+'\n\n'.join('### '+r['audit']+'/'+r['id']+' - '+(r['v3_3_current_finding_id'] or 'legacy-only resolved cause')+'\n\n'+r['v3_3_severity']+' / '+r['v3_3_disposition']+'\n\n'+r['v3_3_assessment'] for r in history)+'\n')
    # Copy only public existing test logs and observed summaries, never dependencies or private repros.
    copies=[('interchain-fresh','xita-test-results.json','xita-test-results.json'),
            ('node-fresh','node-validation.log','node-validation.log'),('node-fresh','node-validation.exit','node-validation.exit'),
            ('node-repeat','node-repeat.log','node-repeat.log'),('supplement','restricted-roles.json','restricted-roles.json'),
            ('supplement','restricted-roles.log','restricted-roles.log'),('supplement','read-only-deployments.json','read-only-deployments.json')]
    for group,name,dest in copies:shutil.copy2(evidence/group/name,evout/dest)
    if (evidence/'solidity.log').exists():shutil.copy2(evidence/'solidity.log',evout/'solidity.log')
    if (evidence/'canonical-activation.md').exists():shutil.copy2(evidence/'canonical-activation.md',evout/'canonical-activation.md')
    if (evidence/'input-artifacts.json').exists():shutil.copy2(evidence/'input-artifacts.json',evout/'input-artifacts.json')
    shutil.copytree(evidence/'interchain-fresh/tests',evout/'tests',dirs_exist_ok=True)
    runs=readj(evout/'xita-test-results.json');results=runs['results']
    assert len(results)==173 and sum(x['exit_code']==0 for x in results)==165
    assert {x['path'] for x in results if x['exit_code']!=0}=={x['path'] for x in data['failure_triage']}
    writej(out/'test-failure-triage.json',data['failure_triage'])
    live=readj(evout/'read-only-deployments.json');assert live['receiptCount']==101 and len(live['checks'])==202
    assert collections.Counter(x['status'] for x in live['checks'])=={'verified':114,'unavailable':88}
    assert (evout/'node-validation.exit').read_text().strip()=='0'
    writej(evout/'protected-evidence-reference.json',{'phase_a_master_sha256':data['phase_a_master_sha256'],'files':data['private_evidence'],'availability':'Operator-confidential conversation evidence, not public CI/repository artifacts. Hashes establish identity, not external escrow or access for third parties.','public_derivative':'phase-a-publication.md','limits':'Unresolved executable triggers are deliberately not published.'})
    for name in ['scope-and-baselines.json','phase-a-seal.md']:
        shutil.copy2(here/name,out/name)
    (out/'phase-a-publication.md').write_text('# Phase A public derivative\n\nThe original source-first master was sealed before detailed historical reconciliation. Original SHA-256: '+data['phase_a_master_sha256']+'.\n\nThis public derivative is intentionally not byte-identical to the protected master. Prior finding summaries were already known, so the review was not genuinely blind. Four new candidates were retained and classified as F-36 through F-39. Positive controls and retained limits are distinguished in the full reports. The executable new negative fixtures remain operator-confidential.\n')
    sources='\n\n'.join('Source: '+repo+' baseline '+data['baselines'][repo]+'; target '+target for repo,target in data['targets'].items())
    evidence_text='''# Verification and evidence ledger

## Evidence classes

Fresh execution, fresh source proof, inherited evidence, read-only deployment observation and unverified installed-state claims are separate. A positive test is not an exhaustive proof; a reproduced negative is a demonstrated defect, not a fix. Missing evidence is not automatically a source vulnerability.

## E-01 - Broad isolated XITA regression execution

Run 42189607123 on exact source 33a4e37cf48c509b83c67d8007c246ff2838c606. The supplied JSON contains 173 test-file executions: 165 exit zero, eight fail. Every log is retained under evidence/tests. Disposable PostgreSQL 16 and test-only dependencies were used. Node was v24.22.2. No fixture was patched to force green status. See test-failure-triage.json for all eight failures. Some package fixtures use mocks; do not equate their count with production transactions.

## E-02 - Fresh node validation

Run 42189607123, exact target a84c82737dc3ca195192a96498eab0e170f8bb5a. scripts/validate-v3.5.0.sh returned zero: reproducible staking artifacts/layout, 19 selected package groups, full Go build and the isolated fork/restart/fresh-sync test. Go 1.23.11 and pinned Solidity 0.8.30. evidence/node-validation.log and node-validation.exit retain the outcome.

## E-03 - Restricted PostgreSQL roles

Run 42191493460. Actual monitor queries and exact production readiness SQL run as restricted roles. Missing intent-read readiness is detected before repair; all nine checks pass after the documented narrow migration. Required joined reads work, immutable debt UPDATE/DELETE remain denied and unrelated role promotion fails. This is not a live host migration attestation or a new paid transfer.

## E-04 - Repeated recovery and possession regressions

Run 42191493460: go test -p 2 -count=3 -timeout=5m ./jsonrpc ./interchain/runtime ./consensus/ibft/blspop. All three packages pass the repeated run. Retained log: evidence/node-repeat.log. Repetition increases confidence in the exercised cases; it does not prove the remaining F-20 persistence branch safe.

## E-05 - Read-only deployment and activation observations

101 retained deployment receipt records, two configured endpoints per record: 202 observations, 114 verified, 88 unavailable due to HTTP 403/429, zero demonstrated mismatches. XGR: 58 verified; Base: 20 verified/16 unavailable; Arbitrum: 18/18; BSC: 0/36; Optimism: 18/18. BSC's positive finalized-head observation is not substituted for unavailable receipt/runtime checks. Endpoint URLs do not prove physical independence.

Both XGR endpoints report v3.5.0, the same 11,627-byte reviewed staking runtime, the expected migration marker and matching sampled block/state hashes around activation. Exact results/timestamps are in evidence/read-only-deployments.json. No transfer, payout, deployment, signing request or service restart was performed. Public RPC access failures do not by themselves justify a source NO-GO.

## E-06 - Fresh Solidity build and tests

Run 42189607043, job 127798101246, synthetic merge 0106b46e5e9d4cd4e016f18cf669679f20d35b48. Product source is unchanged from the frozen target; only audit instrumentation/documentation differs. 111 tests across 17 suites pass, zero fail/skip. Includes eight Creator tests, Direct-BLS replay/signature controls, native backing/claims, fees and two-hop accounting. Solidity 0.8.24, Foundry 1.9.0, 82-source import closure and trusted constructor/runtime checks pass. This green suite does not override E-01's eight failing test files.

## E-07 - Independent private negative cases

Local Node v22.16.0 executions used the real frozen Creator registration/operator/verification/rendering code with controlled RPC/mail/time dependencies. Four unique causes are recorded as F-36 to F-39; two queue-validation variants count once. No real transaction was broadcast. The original source-first master and fixture/result hashes are in protected-evidence-reference.json. Detailed unresolved inputs are withheld from the public package, so third-party rerun access is not claimed. Operator copies remain separate.

## Source and historical evidence

Complete inventories cover 333 Interchain paths and 65 node paths, including 117 historical audit-publication paths in the Interchain delta. Classification is not a line-by-line coverage percentage. Current/historical source-comparison files retain exact blob identities; 43 historical occurrences keep every previous CSV column unchanged. Prior custom execution traces are inherited unless a fresh test is explicitly identified. The v3.5.0 release document was obtained by exact blob cef98a7e6ae16646a9291cbf0d56b746a41d6c4d; it does not attest every current installed binary.

## Reproduction and artifact integrity

The public builder and assessment data reproduce the report structure, matrices and PDFs from exact source/evidence inputs. Run build_reports.py with --interchain, --node, --evidence and --out paths after supplying the declared input directories. It performs no chain or production writes. ReportLab 4.4.9 and standard PDF fonts are used; no font files are distributed. archive-manifest.json binds the actual generated bytes; the manifest cannot hash itself. evidence-public.zip contains public existing execution evidence, not the protected new attack fixtures. verify_artifacts.py verifies local hashes and counts.
'''
    (out/'verification.md').write_text(evidence_text)
    (out/'test-matrix.md').write_text('# Test matrix and interpretation\n\n'+ '\n\n'.join('### '+x['path']+'\n\n'+x['classification']+'. '+x['explanation'] for x in data['failure_triage'])+'\n\nThe full 173-file result matrix is evidence/xita-test-results.json. Node and Solidity execution scopes are in verification.md. No production attack or transaction was used.\n')
    decisions='# Separate operating decisions\n\nThese opinions apply only to the exact frozen source and observed evidence. They neither change production nor accept new policy risks for the operator. Missing host evidence alone is not a NO-GO.\n\n'+'\n\n'.join('## '+x['scope']+'\n\n**'+x['decision']+'**\n\n'+x['basis'] for x in data['decisions'])+'\n'
    (out/'launch-decision.md').write_text(decisions)
    remediation='''# Remediation sequence and acceptance

## Priority sequence

1. Correct Creator per-item validation/isolation (F-36) without discarding uncertain deployments. Require healthy sibling progress through a permanently failing request and restart.
2. Complete paid-obligation outcomes and bounded/fair read work (F-19/F-08). Separate new admission from old-debt service. Never compensate by automatic late gifts, liability deletion or blind nonce replacement.
3. Finish durable recovery handoff (F-20), explicit native pending-claim presentation/support (F-09), and bounded admission/discovery/shutdown (F-03/F-17/F-21/F-29).
4. Preserve the verified F-06/F-32/F-33 repairs and install narrow role migrations through normal authorized operations. Correct all eight stale/misaligned test fixtures and CI discovery (F-14), retaining security negatives.
5. Address Creator retention/provenance (F-37/F-38), remaining admin/projection/observer Low findings, then the presentation/assurance tasks. No contract redeployment follows automatically from an Informational compiler gap.

Each change requires a separate reviewed product commit and fresh positive/negative regression evidence on that commit. This audit only records the remedies; it does not implement or deploy them.
'''
    for x in findings:remediation+='\n## '+x['id']+' - '+x['severity']+' / '+x['status']+'\n\n'+x['remediation']+'\n'
    (out/'remediation.md').write_text(remediation)
    report='''# XITA Direct-BLS\nComprehensive security delta re-audit v3.3.0

**Audit ID:** XITA-DBLS-2026-11-06-v3.3.0. **Date:** 6 November 2026. **Reviewer:** OpenAI GPT-6 Astra Pro, AI-assisted security assessment. Solana is completely excluded.

## 1. Executive opinion

The current unique-cause register contains **0 Critical, 0 High, 11 Medium, 15 Low, 3 Informational and 10 resolved causes: 39 entries in total**. Zero Critical/High means none was demonstrated within this review's scope and evidence, not a guarantee of absence. The separate v3.5.0 legacy consensus cause is not mixed into the XITA count.

Three prior causes are newly verified resolved: F-06 restricted-role dependencies, F-32 unverified request-storage retention, and F-33 the asynchronous post-timeout payout effect. F-04 is downgraded from Medium to Low because retry/failure isolation improved, but is not closed. F-20 remains Medium with a narrower persistence residual. Four new Creator causes are added: one Medium availability defect, two Low recovery/provenance defects and one Informational presentation inconsistency. Historical occurrences are reconciled without duplication.

The source opinion remains CONDITIONAL GO for restricted self-funded core transfers. Unrestricted unattended sponsorship is not approved because bounded all-chain servicing and controlled paid-obligation outcomes remain incomplete, not because the now-fixed timeout/role causes are still open. Public unattended Creator intake has a separately demonstrated queue-isolation availability defect. Correctly deployed token ownership and on-chain mint controls were not shown compromised. The node companion has positive targeted possession/fork evidence, subject to its stated limits.

## 2. Baselines, method and exclusions

The audit freezes product revisions before review. Interchain adds 151 commits/333 changed paths to the preceding source baseline; 117 paths are audit publication and 216 are non-audit changes. Node adds nine commits/65 paths. The API's earlier 300-file page was not treated as a complete inventory; full local Git comparison supplies the record. Unchanged dependencies reachable from changed trust boundaries are included where relevant. Documentation-only release updates do not become new tested product code.

'''+sources+'''

The source-first Phase A was sealed before detailed historical reconciliation, with original SHA-256 24618adefa6ac2955c45de21a3121e49fd84cadb333b6d8c6613ff0b2779c320. Prior finding summaries were already present in the conversation, so the process was not genuinely blind. This is an AI-assisted review, not an independent external audit firm's certificate or a claim of independence from AI-assisted prior development. The public Phase A derivative intentionally differs from the protected master and identifies that provenance.

No Solana branch, program, address format, route or deployment is evaluated. No product fixes, Mainnet transactions, payouts, deployments, configuration changes or service restarts are performed. Writes are limited to audit documentation, isolated evidence tooling and publication. New unresolved executable reproductions remain protected; public evidence contains only publication-safe findings and previously public regression/observation material.

## 3. Reviewed trust boundaries and positive controls

The review traces source operation/asset/route/fee evidence into Direct-BLS authorization, current validator-set binding, destination verification and native/synthetic/collateral accounting. Replay across message, route, destination and ISM is covered by the contract tests and reviewed unchanged authorization dependencies. The separate staking possession change does not replace Registry V3 membership proof requirements.

BSC uses the runtime finalized policy and Optimism the configured safe policy, with receipt-pinned registry/source activation identities and no fallback to latest merely to obtain progress. Admin status promotion is separately assessed under F-22; it must not be conflated with the stronger runtime signing policy. Shared external RPC infrastructure remains a trust dependency, not a cryptographic light-client proof.

Sponsorship review covers quote/intent reservations, immutable liabilities, restricted database roles, prepared signed transaction identity, timeout/read/effect separation, two-hop promise servicing, provisional/final receipt state and monitoring. Creator review covers public registration/email confirmation, private storage/retention, PNG normalization, queue/nonce/budget ownership, shared sponsor-wallet guards, child-token verification, feature/owner authority and the separation between token creation and Interchain route approval.

Node review separately follows proof domain/nonce binding, canonical manifest decoding and exact coverage, staking storage/runtime migration, parent-state signing authority, fallback/cached selection, historical parent seals, join CLI and isolated fresh synchronization. Complete inventories and source-reference matrices are supplied; they are not a formal coverage percentage or exhaustive symbolic proof.

## 4. Execution, observations and interpretation

The fresh broad XITA run executes 173 test files: 165 pass and eight fail. All eight are triaged individually rather than suppressed. The fresh Solidity run passes 111 tests across 17 suites, including Creator authority/caps, Direct-BLS/replay, native claim backing and two-hop accounting. The node validation passes 19 selected package groups, reproducible artifact/layout checks, a full build and a four-validator fork/restart/fresh-import test. JSON-RPC, runtime and possession packages also pass three repeated runs.

Actual restricted PostgreSQL role tests establish the narrow F-06 repair while debt mutation stays denied. Independent local Creator negatives use real application code with controlled RPC/mail/time effects and zero real broadcasts. A positive ordinary path is retained so an invalid fixture is not mistaken for evidence of a general outage. Exact logs, environments, result matrices and protected fixture identities are enumerated in verification.md.

Read-only production evidence covers 101 retained receipt records at two configured endpoints each: 114 verified observations, 88 unavailable from the CI network, and zero demonstrated mismatches. BSC receipt/runtime verification was unavailable; a positive finalized head is not substituted for that missing evidence. Both XGR endpoints agree on the reviewed staking runtime, migration marker and sampled block/state identities around the already activated fork. Missing host/role/journal evidence remains a targeted assurance question, not an invented vulnerability or blanket NO-GO reason.

## 5. Operating decisions

'''
    report+='\n\n'.join('### '+x['scope']+'\n\n**'+x['decision']+'**. '+x['basis'] for x in data['decisions'])
    report+='\n\n## 6. Complete current finding register\n\nSeverity and disposition are distinct. RESOLVED identifies a removed original cause; PARTIALLY_MITIGATED retains the residual. ACCEPTED_RISK carries only the prior explicitly bounded acceptance. Source fixes and actual installation are not silently equated.\n\n'
    for x in findings:
        report+='### '+x['id']+' - '+x['title']+'\n\n'
        report+='**Current:** '+x['severity']+' / '+x['status']+'. **Previous:** '+x['prior_severity']+' / '+x['prior_disposition']+'.\n\n'
        report+='**Original cause / boundary.** '+x['original_cause']+'\n\n'
        report+='**Current assessment.** '+x['assessment']+'\n\n'
        report+='**Evidence.** '+x['evidence']+'\n\n'
        report+='**Limits.** '+x['limits']+'\n\n'
        report+='**Smallest appropriate action.** '+x['remediation']+'\n\n'
        for ref in x['source_refs'][:5]:report+='Source: '+ref['repository']+' @ '+ref['target'][:12]+' / '+ref['path']+'.\n\n'
    report+='''## 7. Historical reconciliation

All 35 preceding current entries are reassessed and all 43 historical occurrences are retained in historical-findings-matrix.csv. Every old column is preserved byte-for-byte at the CSV cell level; v3_3 columns append current decisions, evidence and source identities. Legacy-only resolved occurrences remain distinct from new current F-IDs. Duplicate historical reports do not add unique causes to the severity totals. The readable companion matrix provides the per-occurrence rationale.

Inherited original reproductions are not silently called fresh tests. Exact unchanged blob identities support carrying controls forward; changed integrations are reviewed on the target. Where only a source proof establishes a remaining branch, particularly F-20, that evidence type is explicit. Green package results do not override a demonstrated reachable source residual.

## 8. Priorities and evidence needed for closure

First repair public Creator queue isolation and validation, keeping uncertain deployment identity durable. Complete sponsorship fair/bounded read work and operator-owned paid-obligation outcomes before claiming unrestricted autonomy. Finish durable recovery handoff and native pending-principal presentation/support. Preserve the three newly verified repairs, then correct the eight test-fixture/coverage failures without weakening security assertions. Full per-finding acceptance actions are in remediation.md.

No new operator risk acceptance is inferred. Where an installed operating decision depends on missing data, obtain existing sanitized service revision, actual restricted-role checks, unresolved-liability age/outcome summaries and executable hashes before drawing an adverse host conclusion. A new paid Mainnet test, new signature, worker restart, contract redeployment or discarded debt is not required merely to improve the report's appearance.

## 9. Limitations, disclosure and conclusion

This review combines fresh finite execution, manual source reasoning, inherited evidence and scoped read-only observations. It is not formal verification, an exhaustive fuzzer campaign, a full third-party infrastructure audit or a guarantee of secure deployment. No production state database, private validator key or full host inventory was accessed. Public third-party reproducibility of the new unresolved cases is intentionally limited by responsible disclosure; the operator receives protected identities separately.

The evidence supports genuine improvement without a clean-bill-of-health shortcut: three original causes are closed, one is downgraded, several partial fixes retain narrower residuals, and the newly expanded Creator surface contributes four distinct causes. Core token authorization/backing controls and the targeted v3.5.0 possession repair have positive evidence. Autonomous service availability and complete paid-obligation handling still require the stated corrective work and operating decisions.

## Appendix A. Evidence references

Read verification.md for E-01 through E-07, exact execution runs, environments and limits. evidence-public.zip and archive-manifest.json bind the actual public evidence bytes. Public source URLs and exact target/blob identities for every finding are in finding-details.json and evidence/current-source-comparison.json. Existing historical audit directories remain unchanged.
'''
    (out/'report.md').write_text(report)
    (out/'node-v3.5.0-review.md').write_text(NODE_TEXT)
    pdf(report,out/'report.pdf','XITA comprehensive security delta re-audit',data['audit_id'])
    pdf(NODE_TEXT,out/'node-v3.5.0-review.pdf','XGR v3.5.0 possession security delta',data['companion_id'])
    shutil.copy2(__file__,out/'build_reports.py')
    (out/'README.md').write_text('# XITA security delta and XGR v3.5.0 companion review\n\n'+data['audit_id']+' | '+data['companion_id']+' | 6 November 2026\n\n**Solana excluded.** AI-assisted source/execution review, not an externally accredited certificate.\n\nCurrent XITA register: **0 Critical, 0 High, 11 Medium, 15 Low, 3 Informational, 10 resolved; 39 unique entries**. Fresh targeted node evidence verifies the known possession repair; no additional Critical/High was demonstrated in that reviewed delta.\n\nRead [report.pdf](report.pdf), [report.md](report.md), [node companion PDF](node-v3.5.0-review.pdf), [node companion Markdown](node-v3.5.0-review.md), [operating decisions](launch-decision.md), [remediation](remediation.md), [verification](verification.md), [findings](findings.csv) and [historical matrix](historical-findings-matrix.csv).\n\nCore self-funded: CONDITIONAL GO. Unrestricted unattended sponsorship: NO-GO. Unattended Creator availability: NO-GO pending the reproduced queue isolation fix. Separate staffed/controlled scopes have explicit conditions, not automatic production enablement.\n\nThree newly resolved causes: F-06/F-32/F-33. F-04 is downgraded, not closed; F-20 remains partially mitigated. Four new Creator causes: F-36 through F-39.\n\nThe actual PDF and public evidence ZIP are bound by archive-manifest.json. Protected new reproductions are not in the public ZIP. Prior dated audits are unchanged. Publication does not alter product source or production.\n')
    (out/'verify_artifacts.py').write_text('import hashlib,json,pathlib\nr=pathlib.Path(__file__).resolve().parent\nm=json.loads((r/"archive-manifest.json").read_text())\nfor x in m["files"]:\n p=r/x["path"];assert p.is_file(),p;assert hashlib.sha256(p.read_bytes()).hexdigest()==x["sha256"],p\ns=json.loads((r/"finding-statistics.json").read_text());assert s["total"]==39;assert sum(s["current"].values())==39\nprint("Verified",len(m["files"]),"artifact hashes and 39-entry statistics")\n')
    zip_tree(out,out/'evidence-public.zip',[p for p in evout.rglob('*') if p.is_file()])
    manifest={'audit_id':data['audit_id'],'sources':data['targets'],'scope':'Actual public bytes; excludes the manifest itself and outside publication ZIP.','files':[]}
    for p in sorted(out.rglob('*')):
        if p.is_file() and p.name not in ['archive-manifest.json','publication-package.zip']:
            manifest['files'].append({'path':p.relative_to(out).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())})
    writej(out/'archive-manifest.json',manifest)
    subprocess.run(['python3',str(out/'verify_artifacts.py')],check=True)
    print(json.dumps({'counts':counts,'files':len(manifest['files']),'pdf_sha256':sha((out/'report.pdf').read_bytes()),'node_pdf_sha256':sha((out/'node-v3.5.0-review.pdf').read_bytes())},indent=2))

if __name__=='__main__':main()
