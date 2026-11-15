"""Render assessor-authored PR419 addendum and retain independently checked evidence.
No findings are inferred from a green CI result. No product or production writes.
"""
import argparse, hashlib, json, re, shutil, tarfile, tempfile, zipfile
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab import rl_config
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
rl_config.invariant = 1

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write_json(p, value): p.write_text(json.dumps(value, indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
def rich(s):
    s=escape(s)
    s=re.sub(r'`([^`]+)`',r'<font name="Courier" size="8.2">\1</font>',s)
    s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
    return s

def render(md, pdf):
    navy=colors.HexColor('#172F45'); muted=colors.HexColor('#496174')
    styles=getSampleStyleSheet()
    body=ParagraphStyle('ReportBody',fontName='Helvetica',fontSize=9.6,leading=13.5,spaceAfter=5,textColor=navy,splitLongWords=True,allowWidows=0,allowOrphans=0)
    title=ParagraphStyle('ReportTitle',parent=body,fontName='Helvetica-Bold',fontSize=21,leading=25,spaceAfter=12,keepWithNext=True)
    h2=ParagraphStyle('ReportH2',parent=body,fontName='Helvetica-Bold',fontSize=13,leading=17,spaceBefore=12,spaceAfter=7,keepWithNext=True)
    h3=ParagraphStyle('ReportH3',parent=h2,fontSize=10.5,leading=14,spaceBefore=8)
    refstyle=ParagraphStyle('ReportReference',parent=body,fontSize=8,leading=10.5,spaceAfter=2)
    cell=ParagraphStyle('ReportCell',parent=body,fontSize=8.5,leading=11.5,spaceAfter=0)
    head=ParagraphStyle('ReportCellHead',parent=cell,fontName='Helvetica-Bold',textColor=colors.white)
    story=[];lines=md.splitlines();i=0;width=A4[0]-104
    while i<len(lines):
        line=lines[i].strip()
        if not line: i+=1;continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                cells=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[-: ]+',x or '-') for x in cells):rows.append(cells)
                i+=1
            n=len(rows[0]); widths=([width*.32,width*.68] if n==2 else [width*.135,width*.285,width*.58])
            t=Table([[Paragraph(rich(c),head if k==0 else cell) for c in row] for k,row in enumerate(rows)],colWidths=widths,repeatRows=1,hAlign='LEFT')
            t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#F1F4F7'),colors.white]),('LINEBELOW',(0,-1),(-1,-1),.5,colors.HexColor('#D6DFE6'))]))
            story.extend([t,Spacer(1,10)]);continue
        if line.startswith('### '):story.append(Paragraph(rich(line[4:]),h3))
        elif line.startswith('## '):story.append(Paragraph(rich(line[3:]),h2))
        elif line.startswith('# '):story.append(Paragraph(rich(line[2:]),title))
        else:story.append(Paragraph(rich(line[2:] if line.startswith('- ') else line),refstyle if line.startswith('- ') else body))
        i+=1
    def decor(c,doc):
        c.saveState();c.setStrokeColor(colors.HexColor('#CAD5DF'));c.setLineWidth(.5);c.line(52,42,A4[0]-52,42)
        c.setFont('Helvetica',8);c.setFillColor(muted);c.drawString(52,29,'XITA V1 | PR419 closure addendum | 15 November 2026');c.drawRightString(A4[0]-52,29,str(doc.page))
        if doc.page>1:
            c.setFont('Helvetica',7.5);c.drawString(52,A4[1]-30,'SOURCE-FROZEN TECHNICAL REVIEW - v3.4.1')
        c.restoreState()
    SimpleDocTemplate(str(pdf),pagesize=A4,leftMargin=52,rightMargin=52,topMargin=48,bottomMargin=57,title='XITA V1 - PR419 closure addendum v3.4.1',author='AI-assisted XGR technical review',subject='F-36, F-08, F-19 and F-40 scoped post-remediation reassessment').build(story,onFirstPage=decor,onLaterPages=decor)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--evidence',required=True);args=parser.parse_args()
    root=Path(__file__).resolve().parent;e=Path(args.evidence).resolve();d=json.loads((root/'assessment-input.json').read_text())
    assert (e/'revision.txt').read_text().splitlines()[0]==d['interchain']
    results=(e/'results.tsv').read_text().splitlines()[1:];assert len(results)==12 and all(x.endswith('\t0') for x in results),results
    role=json.loads((e/'reviewer-closure.json').read_text());assert all(role['checks'].values())
    counts={'tests':0,'pass':0,'fail':0}
    for f in sorted((e/'logs').glob('*.log')):
        for key in counts:
            matches=re.findall(r'^# '+key+r' (\d+)$',f.read_text(),re.M);assert matches,(f,key);counts[key]+=int(matches[-1])
    assert counts=={'tests':83,'pass':83,'fail':0},counts
    source_refs=[];checked=0
    with tempfile.TemporaryDirectory() as tmp:
        with tarfile.open(e/'source.tar.gz') as t:t.extractall(tmp,filter='data')
        src=Path(tmp)/'interchain'
        for line in (e/'tree.txt').read_text().splitlines():
            meta,path=line.split('\t');mode,kind,expected=meta.split()
            if kind!='blob':continue
            data=(src/path).read_bytes();actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert actual==expected,path;checked+=1
        for line in (e/'changed-paths.txt').read_text().splitlines():
            status,path=line.split('\t');assert path.startswith('services/'),path
            source_refs.append({'path':path,'change':status,'sha256':sha(src/path)})
    assert checked==1327 and len(source_refs)==11
    dest=root/'evidence';dest.mkdir(exist_ok=True)
    for name in ['logs','results.tsv','summary.txt','toolchain.txt','revision.txt','changed-paths.txt','pr419.patch','collected-at.txt','reviewer-closure.json','reviewer-closure.log']:
        p=e/name
        if p.is_dir():shutil.copytree(p,dest/name,dirs_exist_ok=True)
        else:shutil.copy2(p,dest/name)
    write_json(dest/'creator-closure.json',d['local_results']['creator']);write_json(dest/'sponsor-closure.json',d['local_results']['sponsor'])
    write_json(root/'source-integrity.json',{'frozen_commit':d['interchain'],'tracked_blobs_checked':checked,'mismatches':[],'changed_paths':source_refs})
    write_json(root/'finding-details.json',d['findings']);write_json(root/'finding-statistics.json',d['statistics']);write_json(root/'protected-evidence-reference.json',d['protected_packet'])
    write_json(root/'evidence-summary.json',{'ci':d['ci'],'measured_tap':counts,'independent_sql_replay':role['checks'],'source_integrity':{'blobs':checked,'mismatches':0},'auditor_harness_issues':d['harness_issues'],'other_findings':'Inherited from v3.4.0, not a fresh all-cause review','production_access':False})
    decisions='''# Scoped operating decisions after PR419

F-36 is VERIFIED RESOLVED for original invalid-item/publication failure isolation. F-40 is VERIFIED RESOLVED at the tested source/schema boundary; migration 018 and its role grants were not independently inspected in production. F-08 remains PARTIALLY MITIGATED because stored-transaction recovery still serializes chains, despite the verified fresh-send repair. F-19 remains PARTIALLY MITIGATED for both outcome policy and current-state handling. F-20 closure is inherited on unchanged node v3.5.1.

Core self-funded permissionless transfers retain the prior CONDITIONAL GO within its existing restrictions. No new node release or contract redeployment is required by PR419 or this audit. The Creator F-36 blocker is removed, but F-37/F-38 are not waived. Unrestricted unattended sponsorship is not approved while F-08/F-19 and inherited F-17 remain. Staffed bounded service operation requires explicit accepted responsibilities and preservation of uncertain obligations. UI/email maintenance is not classified as a contract exploit.

No new finding ID, source modification, production transaction, service restart or database migration is introduced by this publication. Missing operational access is an evidence limit, not an assumed production failure.
'''
    (root/'launch-decision.md').write_text(decisions)
    (root/'README.md').write_text('# PR419 closure addendum v3.4.1\n\nRead [report.pdf](report.pdf) or [report.md](report.md). This is a targeted addendum to the unchanged v3.4.0 report, not a software release. F-36 and F-40 source/schema causes close; F-08 and F-19 remain partially mitigated. Node v3.5.1 is unchanged.\n\nEvidence is retained in `evidence/`, decisions in `launch-decision.md`, targeted status changes in `finding-details.json`, inherited inventory arithmetic in `finding-statistics.json`, and the public hash manifest in `archive-manifest.json`. Detailed unresolved synthetic fixtures are separately supplied to the operator; their checksum is recorded in `protected-evidence-reference.json`.\n\nRebuild the authored report with ReportLab 4.4.9 and Python 3.13: `python build_reports.py --evidence <verified-artifact-directory>`. Findings are assessor-authored; the script validates evidence and formats it, not automatically deciding closure from CI.\n')
    (root/'verification.md').write_text('# Verification record\n\nFrozen source: `'+d['interchain']+'`. All '+str(checked)+' tracked Git blobs matched the archived tree. The eleven affected test files passed '+str(counts['tests'])+' TAP tests; the additional historical-to-current SQL attribution replay passed under the actual restricted role. Run '+str(d['ci']['run_id'])+', artifact '+str(d['ci']['artifact_id'])+', artifact SHA256 `'+d['ci']['artifact_sha256']+'`.\n\nSource/PDF evidence is separate from production installation. No production database or wallet operation was used. Only audit files may be committed. Prior audit directories must remain byte-identical.\n\nInitial harness-only failures (wrong safety-guard database name; CommonJS PostgreSQL import) are retained in `evidence-summary.json`. The final collector corrected only its own setup. Broader eight failing historical test files from v3.4.0 were not reclassified by this targeted run.\n')
    render((root/'report.md').read_text(),root/'report.pdf')
    # Preserve public evidence independent of expiring CI artifacts.
    with zipfile.ZipFile(root/'evidence-public.zip','w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(dest.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(root).as_posix())
    files=[p for p in sorted(root.rglob('*')) if p.is_file() and p.name!='archive-manifest.json' and '__pycache__' not in p.parts]
    write_json(root/'archive-manifest.json',{'scope':'Public report/evidence integrity, not a claim of production closure','files':[{'path':p.relative_to(root).as_posix(),'size':p.stat().st_size,'sha256':sha(p)} for p in files]})
    print(json.dumps({'files':len(files),'tap':counts,'blob_matches':checked,'pdf_sha256':sha(root/'report.pdf')}))
if __name__=='__main__':main()
