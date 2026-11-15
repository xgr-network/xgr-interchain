#!/usr/bin/env python3
"""Build the source-frozen XITA delta publication. No network or product writes.
Requires Python >=3.10 and reportlab==4.4.9. Inputs are the declared audit artifacts.
The output directory must be the new dated audit directory, never product source.
"""
from __future__ import annotations
import argparse, collections, csv, hashlib, html, json, re, shutil, zipfile
from pathlib import Path
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

rl_config.invariant = 1

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def load(p): return json.loads(Path(p).read_text(encoding='utf-8'))
def dump(p,v): Path(p).write_text(json.dumps(v,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def text(p,v): Path(p).write_text(v.rstrip()+'\n',encoding='utf-8')
def mdtable(headers,rows):
    clean=lambda x:str(x).replace('|','/').replace('\n',' ')
    return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(clean(x) for x in r)+' |' for r in rows])
def writecsv(path,fields,rows):
    with Path(path).open('w',newline='',encoding='utf-8') as h:
        w=csv.DictWriter(h,fieldnames=fields,extrasaction='ignore'); w.writeheader();w.writerows(rows)
def gitblob(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

def pdf_from_markdown(src:Path,dst:Path,subtitle:str):
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='TitleX',fontName='Helvetica-Bold',fontSize=24,leading=29,textColor=colors.HexColor('#18364B'),spaceAfter=18))
    styles.add(ParagraphStyle(name='H1X',fontName='Helvetica-Bold',fontSize=15,leading=19,textColor=colors.HexColor('#18364B'),spaceBefore=15,spaceAfter=8,keepWithNext=True))
    styles.add(ParagraphStyle(name='H2X',fontName='Helvetica-Bold',fontSize=11.5,leading=15,textColor=colors.HexColor('#18364B'),spaceBefore=12,spaceAfter=6,keepWithNext=True))
    styles.add(ParagraphStyle(name='BodyX',fontName='Helvetica',fontSize=9.6,leading=14,spaceAfter=7,splitLongWords=True))
    styles.add(ParagraphStyle(name='CellX',fontName='Helvetica',fontSize=8.5,leading=11.5,spaceAfter=0,splitLongWords=True))
    styles.add(ParagraphStyle(name='HeadCellX',parent=styles['CellX'],fontName='Helvetica-Bold',textColor=colors.white))
    styles.add(ParagraphStyle(name='CodeX',fontName='Courier',fontSize=7.8,leading=10.5,spaceAfter=8,splitLongWords=True))
    def fmt(s):
        s=html.escape(s,quote=False)
        s=re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',s)
        s=re.sub(r'`([^`]+)`',r'<font name="Courier">\1</font>',s)
        s=re.sub(r'\[([^\]]+)\]\((https?://[^)]+)\)',lambda m:'<link href="'+html.escape(m[2],quote=True)+'" color="#175D85">'+m[1]+'</link>',s)
        return s
    lines=src.read_text(encoding='utf-8').splitlines();story=[];i=0
    while i<len(lines):
        line=lines[i].strip()
        if not line:i+=1;continue
        if line=='<!-- PAGEBREAK -->':story.append(PageBreak());i+=1;continue
        if line.startswith('```'):
            i+=1;code=[]
            while i<len(lines) and not lines[i].startswith('```'):code.append(html.escape(lines[i]).replace(' ','&nbsp;'));i+=1
            story.append(Paragraph('<br/>'.join(code),styles['CodeX']));i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x.replace(' ','')) for x in row):rows.append(row)
                i+=1
            n=len(rows[0]);width=505
            if n==4:ws=[38,62,112,293]
            elif n==3:ws=[145,115,245]
            elif n==2:ws=[158,347]
            else:ws=[width/n]*n
            cells=[[Paragraph(fmt(x),styles['HeadCellX'] if ri==0 else styles['CellX']) for x in row] for ri,row in enumerate(rows)]
            t=Table(cells,colWidths=ws,repeatRows=1,hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#18364B')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F1F4F6')]),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),0.6,colors.HexColor('#18364B'))]))
            story.extend([Spacer(1,5),t,Spacer(1,10)]);continue
        if line.startswith('# '):story.append(Paragraph(fmt(line[2:]),styles['TitleX']));i+=1;continue
        if line.startswith('## '):story.append(Paragraph(fmt(line[3:]),styles['H1X']));i+=1;continue
        if line.startswith('### '):story.append(Paragraph(fmt(line[4:]),styles['H2X']));i+=1;continue
        para=[line];i+=1
        while i<len(lines) and lines[i].strip() and not lines[i].startswith(('#','|','```','<!--')):
            para.append(lines[i].strip());i+=1
        body=Paragraph(fmt(' '.join(para)),styles['BodyX'])
        if line.startswith('**') and line.endswith('**') and ' | ' in line:body.keepWithNext=True
        story.append(body)
    def page(c,doc):
        c.saveState();w,h=A4
        c.setStrokeColor(colors.HexColor('#D2DCE2'));c.line(45,h-35,w-45,h-35)
        c.setFont('Helvetica',7.5);c.setFillColor(colors.HexColor('#435D6C'))
        c.drawString(45,h-25,'XGR.NETWORK | XITA V1 | Source-frozen delta audit')
        c.drawString(45,26,subtitle);c.drawRightString(w-45,26,str(doc.page));c.restoreState()
    doc=SimpleDocTemplate(str(dst),pagesize=A4,leftMargin=45,rightMargin=45,topMargin=49,bottomMargin=44,title=src.stem,author='AI-assisted security reassessment',pageCompression=1)
    doc.build(story,onFirstPage=page,onLaterPages=page)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--interchain',required=True);ap.add_argument('--node',required=True);ap.add_argument('--evidence',required=True);ap.add_argument('--out',required=True);args=ap.parse_args()
    inter,node,ev,out=map(Path,[args.interchain,args.node,args.evidence,args.out]);out.mkdir(parents=True,exist_ok=True)
    a=load(out/'assessment-data.json');old=inter/'audits'/a['prior_directory'];prior=load(old/'finding-details.json')
    assert len(prior)==39 and len(a['updates'])==39
    evidence=out/'evidence';evidence.mkdir(exist_ok=True)
    for d in ['complete-tests-roles','node-evidence','f20-faults','read-only-production']:
        shutil.copytree(ev/d,evidence/d,dirs_exist_ok=True)
    src=evidence/'source';src.mkdir(exist_ok=True)
    for p in (ev/'source-evidence').iterdir():
        if p.is_file() and p.suffix!='.gz':shutil.copy2(p,src/p.name)
    if (ev/'artifact-provenance.json').exists():shutil.copy2(ev/'artifact-provenance.json',evidence/'artifact-provenance.json')
    if (ev/'foundry.log').exists():shutil.copy2(ev/'foundry.log',evidence/'foundry.log')
    if (ev/'collector-workflows').exists():shutil.copytree(ev/'collector-workflows',evidence/'collector-workflows',dirs_exist_ok=True)
    roots={'xgr-interchain':inter,'xgr-node':node};targets={'xgr-interchain':a['interchain_target'],'xgr-node':a['node_target']}
    findings=[];comparison={}
    for orig in prior:
        f=dict(orig);u=a['updates'][f['id']]
        f['prior_severity']=orig['severity'];f['prior_disposition']=orig['status'];f.update(u);f['new_finding']=False
        refs=[]
        for ref in orig.get('source_refs',[]):
            repo=ref['repository'].split('/')[-1];path=ref['path'];p=roots[repo]/path;data=p.read_bytes();blob=gitblob(data)
            refs.append({'repository':repo,'path':path,'target':targets[repo],'target_blob':blob,'sha256':hashlib.sha256(data).hexdigest(),'url':'https://github.com/xgr-network/'+repo+'/blob/'+targets[repo]+'/'+path})
            k=(repo,path)
            if k not in comparison:comparison[k]={'repository':repo,'path':path,'current_blob':blob,'previous_blob':ref.get('target_blob'),'unchanged':blob==ref.get('target_blob'),'findings':[],'sha256':hashlib.sha256(data).hexdigest(),'lines':len(data.splitlines())}
            comparison[k]['findings'].append(f['id'])
        f['source_refs']=refs;findings.append(f)
    nf=dict(a['new_finding']);nf.update({'prior_severity':'NEW','prior_disposition':'NEW','new_finding':True})
    nf['source_refs']=[{'repository':'xgr-interchain','path':p,'target':a['interchain_target'],'target_blob':gitblob((inter/p).read_bytes()),'sha256':sha(inter/p),'url':'https://github.com/xgr-network/xgr-interchain/blob/'+a['interchain_target']+'/'+p} for p in nf['paths']]
    findings.append(nf);byid={f['id']:f for f in findings}
    counts=collections.Counter(f['severity'] for f in findings)
    assert dict(counts)=={'RESOLVED':11,'Medium':10,'Low':16,'Informational':3},dict(counts)
    dump(out/'finding-details.json',findings);dump(out/'finding-statistics.json',{'unique_causes':40,'Critical':0,'High':0,**dict(counts),'prior_unique_causes':39,'new_causes':['F-40'],'newly_resolved':['F-20'],'note':'Severity is not disposition; F-11 accepted risk remains counted as Medium.'})
    fields=['id','title','severity','status','layer','prior_severity','prior_disposition','new_finding','assessment','evidence','remediation']
    writecsv(out/'findings.csv',fields,findings)
    with (old/'historical-findings-matrix.csv').open(newline='',encoding='utf-8') as h:
        rd=csv.DictReader(h);oldfields=rd.fieldnames;history=list(rd)
    assert len(history)==43
    appended=['v3_4_current_finding_id','v3_4_severity','v3_4_disposition','v3_4_layer','v3_4_assessment','v3_4_evidence','v3_4_counting_note']
    for row in history:
        fid=row.get('v3_3_current_finding_id') or row.get('current_finding')
        f=byid.get(fid) or {'severity':row['v3_3_severity'],'status':row['v3_3_disposition'],'layer':'Historical-only resolved occurrence','assessment':'Historical-only closure retained, not recounted as a new F-ID. '+row['v3_3_assessment'],'evidence':'E-01/E-02/E-03: relevant source boundaries and current suites checked; original dedicated negative traces remain inherited.'}
        row.update({'v3_4_current_finding_id':fid,'v3_4_severity':f['severity'],'v3_4_disposition':f['status'],'v3_4_layer':f['layer'],'v3_4_assessment':f['assessment'],'v3_4_evidence':f['evidence'],'v3_4_counting_note':'Historical occurrence retained; count once by current unique cause. F-40 is in the current register, not retroactively inserted into historical rows.'})
    writecsv(out/'historical-findings-matrix.csv',oldfields+appended,history)
    dump(evidence/'current-source-comparison.json',list(comparison.values()))
    assert len(comparison)==73 and sum(x['unchanged'] for x in comparison.values())==66
    inventory=[]
    for short,repo in [('interchain','xgr-interchain'),('node','xgr-node')]:
        for line in (ev/'source-evidence'/f'{short}-name-status.txt').read_text().splitlines():
            parts=line.split('\t');status,path=parts[0],parts[-1]
            kind='audit publication' if path.startswith('audits/') else 'workflow' if path.startswith('.github/') else 'test' if ('test.' in path or '_test.go' in path) else 'documentation' if path.endswith('.md') else 'product'
            depth='inventory only' if kind in ['audit publication','workflow','documentation'] else 'targeted source and regression review'
            inventory.append({'repository':repo,'path':path,'change':status,'classification':kind,'review_depth':depth})
    dump(out/'change-inventory.json',inventory);writecsv(out/'change-inventory.csv',list(inventory[0]),inventory)
    assert len(inventory)==248
    rows=list(csv.DictReader((ev/'complete-tests-roles/js/results.tsv').open(),delimiter='\t'))
    failed=[x['path'] for x in rows if x['exit_code']!='0'];triage=load(old/'test-failure-triage.json')
    assert len(rows)==174 and len(failed)==8 and set(failed)=={x['path'] for x in triage}
    for x in triage:x.update({'fresh_result':'FAIL','classification_limit':'Not independently treated as an exploitable protocol defect; preserve negative checks while correcting the fixture.'})
    dump(out/'test-failure-triage.json',triage)
    tap=collections.Counter()
    for p in (ev/'complete-tests-roles/js').glob('*.log'):
        for key,value in re.findall(r'^# (tests|pass|fail|skipped|cancelled) (\d+)\s*$',p.read_text(),re.M):tap[key]+=int(value)
    live=load(ev/'read-only-production/read-only-production.json');rpc_counts=collections.Counter(x['status'] for x in live['receipts']);unique=collections.defaultdict(int)
    for x in live['receipts']:
        if x['status']=='verified':unique[x['path']]+=1
    assert len(live['receipts'])==202 and rpc_counts=={'verified':119,'unavailable':83}
    metrics={'javascript_files':len(rows),'javascript_pass_files':len(rows)-len(failed),'javascript_failed_files':failed,'tap':dict(tap),'node_test_pass_events':495,'node_test_skip_events':1,'node_test_fail_events':0,'node_existing_f20_repetitions':5,'supplemental_f20_test_pass_events':10,'foundry_tests':111,'foundry_suites':17,'rpc_observations':dict(rpc_counts),'unique_receipts_verified':len(unique),'unique_receipts_both_verified':sum(n==2 for n in unique.values())}
    dump(out/'evidence-summary.json',metrics)
    dump(out/'scope-and-baselines.json',{k:a[k] for k in ['audit_id','report_version','date','interchain_target','node_target','interchain_baseline','node_baseline','prior_directory','disclosure','separation']})
    dump(out/'protected-evidence-reference.json',{'policy':a['protected_policy'],'fixtures':a['protected_fixtures'],'phase_a_original_sha256':'0a357677b235bc0b76f3c202751da59d89298fcecdefc2cac5316c70431baef1'})
    text(out/'phase-a-seal.md','# Source-first phase and evidence seal\n\nThe source-first notes were sealed before supplemental counterexamples completed. Prior conversation and finding summaries were already known; no blind-review claim is made.\n\nOriginal operator working note SHA256: `0a357677b235bc0b76f3c202751da59d89298fcecdefc2cac5316c70431baef1`. The operator archive retains those exact notes and the runnable unresolved fixtures. See protected-evidence-reference.json for individual hashes.\n\nThe current assessment is a later interpretation of that phase and fresh results, not an overwrite of the seal.')
    text(out/'phase-a-publication.md','# Source-first public observations\n\n'+a['disclosure']+'\n\nNo contract or browser source changed. Candidate concerns were post-deployment Creator failure isolation, global sponsor effect serialization and aged preflights, reviewer metadata defaults, and exact durable F-20 successor semantics. Supplemental executions E-04 and E-07 through E-10 resolved those hypotheses as described in report.md. The protected original notes remain separately hashed; this public narrative is not claimed byte-identical to them.')
    decisions='# Separate operating decisions\n\n'+a['disclosure']+'\n\n'+ '\n\n'.join('## '+d['scope']+'\n\n**'+d['decision']+'**\n\n'+d['basis'] for d in a['decisions'])
    text(out/'launch-decision.md',decisions)
    verification='# Verification and evidence limits\n\n'+ '\n\n'.join('## '+k+'\n\n'+v for k,v in a['evidence'].items())
    verification+='\n\n## Reproducibility and limitations\n\nComplete public logs, source inventories and exact hashes accompany the report. The initial JavaScript harness stopped at its first failed file due shell errexit; its partial result is not counted as a full run. The corrected all-files collector records every exit code and continues for evidence collection. Standard green CI and the evidence collector status do not override those failures.\n\n'+a['protected_policy']+'\n\nNo physical power-cut, all-node host attestation, full production load attack, exhaustive compiler equivalence, regulatory/legal opinion or complete historical economic solvency proof is claimed. RPC access failures are not code mismatches. Tests using mocked effects do not constitute mainnet transfers. The Go journal fixtures do not themselves prove cryptographic signature validity; separate current suites exercise BLS and message authentication.\n'
    text(out/'verification.md',verification)
    testtable=mdtable(['Evidence','Fresh outcome','Interpretation'],[['JavaScript complete discovery','166 / 174 files pass','Eight historical failing files; 1,035 / 1,046 TAP tests pass.'],['Node packages','495 pass; one seed skipped','Six packages; targeted scope, not whole-node EEST.'],['F-20 repeated / faults','5 + 10 passes','Missing/corrupt successor, write failure and restart exercised.'],['Foundry','111 / 111, 17 suites','Fresh unchanged-contract build and targeted security tests.'],['Receipt/runtime observations','119 / 202 verified','83 unavailable; zero mismatches; 78 unique contracts verified at least once.'],['PostgreSQL reviewer','Normal/negative role tests','Direct INSERT attribution defect reproduced as F-40.'],['Protected Creator/sponsor','Positive and negative controls','Real source paths; external effects mocked; residuals retained.']])
    text(out/'test-matrix.md','# Test matrix\n\n'+testtable+'\n\nSee verification.md and individual public evidence logs; no success count includes a failed or omitted file as passing.')
    priority='First address the demonstrated post-deployment Creator isolation residual (F-36) without redeployment; then sponsor effect liveness and current-state/outcome controls (F-08/F-19). Correct the small privileged metadata integrity gap (F-40), retain the F-20 fix, reconcile actual node rollout banners and fix the eight stale tests without weakening security assertions. These are targeted maintenance tasks, not a need for Solana or a redesign of immutable bridge contracts.'
    remediation='# Remediation and retest plan\n\n'+priority+'\n\n'
    for f in findings:remediation+='## '+f['id']+' - '+f['severity']+' / '+f['status']+'\n\n'+f.get('remediation','Retain the scoped controls and evidence.')+'\n\n'
    text(out/'remediation.md',remediation)
    register=mdtable(['ID','Severity','Disposition','Title'],[[f['id'],f['severity'],f['status'].replace('PARTIALLY_MITIGATED','PARTIAL'),f['title']] for f in findings])
    matrix=mdtable(['ID','Prior disposition','Current disposition'],[[f['id'],f['prior_disposition'],f['status']] for f in findings])
    text(out/'prior-findings-matrix.md','# Complete unique-cause reconciliation\n\n'+matrix+'\n\nForty unique causes; 43 historical occurrences remain preserved in the CSV. F-20 closes, F-36 changes from OPEN to PARTIALLY_MITIGATED, and F-40 is new Low. No duplicate Medium is added for the fresh sponsorship effect-boundary observation.')
    executive='# XITA V1 post-deployment delta audit\n\n**Report revision 3.4.0 | 15 November 2026 | Node v3.5.1**\n\n'+a['summary']+'\n\n'+mdtable(['Current classification','Unique causes'],[['Critical / High','0 / 0 demonstrated'],['Medium / Low','10 / 16'],['Informational / Resolved','3 / 11'],['Total / prior total','40 / 39']])+'\n\n'+a['disclosure']+'\n\n## 1. Executive interpretation\n\n'+a['separation']+'\n\nThe previous statement that all four remediation packages were implemented and green in CI did not establish audit closure. This review contradicts that implication where fresh counterexamples remain. The distinction matters commercially and technically: optional onboarding and fee-grant reliability still need targeted work, while no new change to the core collateral/Direct-BLS authorization rules was introduced.\n\n'+mdtable(['Finding','Current decision','Reason'],[['F-20','Verified resolved','Exact durable successor and restart/write-failure evidence.'],['F-36','Partially mitigated','Unsigned queue repaired; deployed-profile publication still blocks later work.'],['F-08','Partially mitigated','Parallel read preparation is improved; global send queue remains coupled.'],['F-19','Partially mitigated','Admission separated; review records are not fulfilled financial outcomes.'],['F-40','New Low','Privileged reviewer can supply unbound actor/time/sponsor metadata.']])+'\n\n## 2. Scope, frozen baselines and exclusions\n\n'+mdtable(['Repository','Frozen source'],[['xgr-interchain main',a['interchain_target']],['xgr-node XGR3.0 / v3.5.1',a['node_target']],['Prior Interchain target',a['interchain_baseline']],['Prior node target',a['node_baseline']]])+'\n\nThe report revision is not a new node or smart-contract release. Historical baseline: audits/'+a['prior_directory']+'. Complete change inventories contain 235 Interchain paths (222 audit-publication paths and 13 non-audit paths) and 13 Node paths. Only two Node Go files change; release workflow/notes and retirement of nine old workflows account for the remainder. No Solidity, browser, consensus, staking, genesis or Solana product change appears in this delta.\n\nThe prior register references 73 unique source dependencies: 66 retain identical Git blobs and seven change. Current source hashes and path inventories are retained. Targeted trust-boundary review and current regression execution supplement that comparison; it is not a claim to have manually audited every line of the archived repositories. Historical conclusions are explicitly inherited where no new exploit reproduction was performed.\n\nOut of scope: productive state changes, private host shell inspection, all-chain live transfer testing, exhaustive economic solvency, compiler-equivalence proof and Solana. No operator secrets were used. Missing host evidence is not promoted into a hypothetical production vulnerability or blanket NO-GO.\n\n## 3. Method and evidence\n\nSource-first notes were sealed before the supplemental counterexamples completed. Review covered changed call graphs and relevant unchanged dependencies, full test-file discovery, repeated Go recovery tests, actual least-privileged PostgreSQL behavior, controlled positive/negative JavaScript probes and read-only public runtime checks. The supplemental sponsor probe appends exports only to a temporary local copy; it does not replace the scheduler/send logic. Its source authentication is a pre-satisfied fixture, explicitly not a forged on-chain source proof.\n\n'+testtable+'\n\n## 4. Deployed-code and rollout observations\n\nAt the recorded read-only snapshot, 101 documented contract receipts were tested against two configured endpoints each. There were 119 verified endpoint observations, 83 unavailable and zero demonstrated mismatches; 78 unique receipts have at least one verification and 41 have two. These figures are not 119 different contracts and are not proof of independently controlled upstreams. BSC receipt/runtime observations were unavailable through both configured readers. HTTP 403/429 or timeout does not itself establish a contract fault.\n\n'+mdtable(['Chain','Verified observations','Unavailable observations'],[[c,sum(x['chain']==c and x['status']=='verified' for x in live['receipts']),sum(x['chain']==c and x['status']=='unavailable' for x in live['receipts'])] for c in ['xgrchain','base','arbitrum','bsc','optimism']])+'\n\nRPC1 advertised xgrchain/v3.5.1/linux-amd64/go1.23.11; RPC2 advertised v3.5.0 with the same Go banner. Both returned chain ID 1643 at adjacent sampled block heights. The official v3.5.1 artifact records Go 1.23.12 and full commit '+a['node_target']+'. Its streamed 73,288,622-byte binary SHA256 is 20b99c8946ef3f33150b566957c791fb1a15e72999ef51ac81f8af7da9211ee1 and matches the published checksum manifest. These observations qualify rollout completion, not the correctness of the F-20 source fix. Routed banners do not identify every validator process or prove that a deployed executable matches the official artifact.\n\nThe managed quote, Join and transfer-health endpoints returned HTTP 200. Join advertised public Creator availability; transfer health advertised an installed proof builder. Sponsorship advertised enabled and servicing-existing, but aggregate availability false with Base unready. This is an optional-service readiness observation at that timestamp, not evidence that core contract transfers are broken. It does not by itself attest the installed Git SHA, migration 017 or operator policy.\n\n## 5. Separate operating decisions\n\n'+ '\n\n'.join('### '+d['scope']+'\n\n**'+d['decision']+'**. '+d['basis'] for d in a['decisions'])+'\n\n## 6. Complete current finding register\n\n'+register+'\n\nSeverity and disposition are separate. ACCEPTED_RISK is not RESOLVED. Zero demonstrated Critical/High findings is limited to the reviewed sources and evidence, not a guarantee of absence across the entire system.\n\n## 7. Finding-by-finding reassessment\n\n'
    detail=[]
    for f in findings:
        refs='; '.join('['+r['repository']+'/'+r['path']+']('+r['url']+')' for r in f['source_refs'])
        part='### '+f['id']+' - '+f['title']+'\n\n**'+f['severity']+' | '+f['status']+' | '+f['layer']+'**\n\n'+f['assessment']+'\n\n**Evidence.** '+f['evidence']+'\n\n**Remediation / retained control.** '+f.get('remediation','Retain scoped controls.')+'\n\n**Frozen source.** '+refs+'\n\n'
        if f.get('limits'):part+='**Limit.** '+f['limits']+'\n\n'
        detail.append(part)
    report=executive+''.join(detail)+'## 8. Priority and acceptance criteria\n\n'+priority+'\n\nA closure retest must exercise successful and failed paths under the actual trust boundary. For Creator, show a healthy request advancing past repeated post-deployment metadata/publication errors without a second token deployment. For sponsorship, prove another destination advances while a prior send is unresolved, preserving raw transaction and nonce identity, and prove delayed fresh preflights cannot bypass current delivery policy. For reviewer history, use direct SQL under the real restricted role, not only the CLI. Preserve all paid and uncertain liabilities.\n\nSeparate an explicitly staffed operating mode from a claim of complete unattended availability. The core protocol can remain feature-frozen while these narrow application/runtime maintenance items are addressed; this report does not justify a blanket claim that every optional service is finished. No Solana extension is required to repair these causes.\n\n## 9. Evidence index and reproducibility\n\n'+ '\n\n'.join('**'+k+'.** '+v for k,v in a['evidence'].items())+'\n\n'+a['protected_policy']+'\n\n## 10. Assurance limits and references\n\nThe official bytecode receipts and release hashes are independent read-only observations. Production host checksum, full validator inventory, actual restricted database installation and an accepted staffed-outcome policy remain separate evidence. No live impairment or payment was induced. The code review is AI-assisted and shares context with earlier development; the retained executions support findings but are not an external firm certificate.\n\nOfficial PostgreSQL documentation distinguishes defaults from constraints and permits table-level INSERT to supply columns. That supports the interpretation of the actual F-40 role reproduction. Official Solidity advisories guide F-28 applicability review; no unproven advisory exposure is asserted as a deployed exploit.\n\n'+ '\n\n'.join('['+x['title']+']('+x['url']+')' for x in a['references'])+'\n'
    text(out/'report.md',report)
    node_md='# XGR-Node v3.5.1 recovery review\n\n**Companion to XITA delta audit revision 3.4.0 | 15 November 2026**\n\n'+a['disclosure']+'\n\n## 1. Frozen scope and decision\n\nReviewed node commit: `'+a['node_target']+'`. Prior audited target: `'+a['node_baseline']+'`. The F-20 product fix entered XGR3.0 in `d5e8977a0fa1059b2ccf25ecefc360c7454e39df`; later commits package the light release and remove legacy workflows. Only iln_checkpoint.go and its new F-20 test change executable/test Go content. Consensus, staking, the activated BLS proof-of-possession fork, chain configuration and XITA wire encoding are unchanged.\n\n**F-20: VERIFIED / RESOLVED for the original reviewed cause.** This is not a whole-node audit or evidence that every production node has installed v3.5.1.\n\n## 2. Original cause and corrected ownership transition\n\nThe prior caller treated a generic nil signing error as evidence that replacement recovery work existed. Ineligible signing or a non-durable already-existing state could therefore permit retirement of the old vote before a durable current-set successor was available. The new caller checks a local-signer successor in memory and in the persisted journal and compares the full authenticated message with only its validator-set epoch replaced. Fee, source/destination domains, router, gateway, registry and ISM must all remain identical.\n\nThe successor file is written and synchronized, renamed into place, and its parent directory is synchronized before success. An absent, wrong-set, wrong-route, wrong-signer, altered-fee or corrupt persisted successor cannot satisfy retirement. The old evidence is retained when replacement does not meet that gate. This preserves availability evidence; it does not grant new signing privileges or change quorum rules.\n\n## 3. Fresh execution evidence\n\n'+mdtable(['Execution','Outcome'],[['Current interchain/direct-BLS/JSON-RPC packages','495 test passes; one fuzz seed skipped; zero failures.'],['Existing F-20 repeated test','Five passes.'],['Supplemental existing + write-failure/restart tests','Five repetitions of each; ten passes.'],['Official release binary digest','Matches published SHA256 manifest.']])+'\n\nThe audit-added failure case deliberately makes the successor temporary path unwritable as a file, observes the persistence error and verifies that the original vote remains. It then removes the test-only obstruction, persists a correct successor, constructs a new Worker, recovers the journal and proves that retiring the old entry does not remove the successor. These are isolated local filesystem tests, not production fault injection. They do not simulate physical power loss, every fsync error or all possible concurrent filesystem schedules. The synthetic journal signatures are not claimed to test subgroup validity; current BLS/message suites provide separate cryptographic-path evidence.\n\n## 4. Rollout and binary provenance\n\nThe official v3.5.1 download is bound to full commit `'+a['node_target']+'`, reports Go 1.23.12 in toolchain.txt and hashes to `20b99c8946ef3f33150b566957c791fb1a15e72999ef51ac81f8af7da9211ee1` (73,288,622 bytes). The manifest and streamed binary agree.\n\nAt the recorded public snapshot, rpc1 advertised v3.5.1 and rpc2 v3.5.0; both advertised Go 1.23.11. A routed endpoint may represent a distinct backend and its banner is not an executable checksum. Consequently, complete uniform validator rollout and exact host-artifact identity are not independently attested. This is an operational verification item, not a finding that the new protocol forks or breaks consensus. Keep the existing genesis and activated PoP configuration. Do not delete vote journals or alter staking state to resolve a version discrepancy.\n\n## 5. Other node findings retained\n\n'+ '\n\n'.join('**'+byid[i]['id']+' - '+byid[i]['severity']+' / '+byid[i]['status']+'.** '+byid[i]['assessment'] for i in ['F-03','F-04','F-05','F-21','F-29','F-32'])+'\n\n## 6. Operator acceptance and limits\n\nVerify each intended node process/container version and binary hash against the official artifact using the existing rollout runbook, and confirm peer synchronization, quorum continuity and Direct-BLS journal operation. That evidence can qualify rollout without reopening the source-resolved F-20 cause. No new activation block, restaking, key rotation or contract redeployment follows from this audit.\n\nThe main report carries all 40 current causes and the historical reconciliation. Optional sponsor and Creator availability defects are not recast here as consensus or immutable-contract defects. The source conclusions are frozen even if later product maintenance or public endpoint versions change.\n'
    text(out/'node-v3.5.1-review.md',node_md)
    pdf_from_markdown(out/'report.md',out/'report.pdf','Audit revision 3.4.0 | 2026-11-15 | English source-frozen report')
    pdf_from_markdown(out/'node-v3.5.1-review.md',out/'node-v3.5.1-review.pdf','XGR-Node v3.5.1 | F-20 companion review | 2026-11-15')
    readme='# XITA V1 delta audit - 15 November 2026\n\n**Report revision 3.4.0; node release v3.5.1.**\n\n'+a['summary']+'\n\nRead [main report](report.md) / [PDF](report.pdf), [separate operating decisions](launch-decision.md), [node companion](node-v3.5.1-review.md) / [PDF](node-v3.5.1-review.pdf), [all findings](finding-details.json), [historical matrix](historical-findings-matrix.csv), [verification](verification.md), [test matrix](test-matrix.md) and [remediation](remediation.md).\n\nNo product code, production transaction or deployment is included. This publication must not be described as an independent external audit-firm certificate.\n\nRebuild: `python build_reports.py --interchain <frozen-interchain> --node <frozen-node> --evidence <declared-extracted-artifacts> --out <this-audit-directory>` with Python 3.10+ and ReportLab 4.4.9. Inputs and workflow scripts are retained by exact hash. Run `python verify_artifacts.py` to check publication integrity. The hash manifest excludes itself; no self-hash claim is made. Protected adversarial fixtures are in the separate operator archive, not in evidence-public.zip.\n'
    text(out/'README.md',readme)
    verifier='''#!/usr/bin/env python3
import csv,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'archive-manifest.json').read_text())
for row in manifest['files']:
 p=root/row['path'];assert p.is_file(),row['path'];assert p.stat().st_size==row['bytes'],row['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==row['sha256'],row['path']
f=json.loads((root/'finding-details.json').read_text());assert len(f)==40 and len({x['id'] for x in f})==40
assert next(x for x in f if x['id']=='F-20')['status']=='VERIFIED / RESOLVED'
assert all(next(x for x in f if x['id']==i)['status']=='PARTIALLY_MITIGATED' for i in ['F-08','F-19','F-36'])
with (root/'historical-findings-matrix.csv').open() as h: assert len(list(csv.DictReader(h)))==43
print('PASS: %s files, 40 unique causes, 43 preserved historical rows'%len(manifest['files']))
'''
    text(out/'verify_artifacts.py',verifier)
    with zipfile.ZipFile(out/'evidence-public.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(evidence.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(out))
    dump(out/'publication-validation.json',{'status':'generated; final rendered-PDF visual review and repository readback required','expected_findings':40,'expected_historical_rows':43,'assertions_passed':True,'product_source_modified':False,'public_evidence_contains_protected_fixtures':False})
    files=[{'path':str(p.relative_to(out)),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='archive-manifest.json']
    dump(out/'archive-manifest.json',{'algorithm':'SHA-256','self_excluded':True,'files':files})
    print(json.dumps({'counts':dict(counts),'metrics':metrics,'manifest_files':len(files)},indent=2))

if __name__=='__main__': main()
