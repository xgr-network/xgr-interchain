# Adapted from the preserved v3.0 audit renderer for the complete v3.2 report.
from pathlib import Path
import re,html,json,sys,hashlib
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,PageBreak,CondPageBreak,LongTable,TableStyle,KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from pypdf import PdfReader

HERE=Path(__file__).resolve().parent
OUT=HERE
if len(sys.argv)>1:OUT=Path(sys.argv[1]).resolve()
TEXT=(OUT/'report.md').read_text()
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/xita-audit-matplotlib')
import matplotlib
FONT=Path(matplotlib.get_data_path())/'fonts/ttf'
for name,file in [('DV','DejaVuSans.ttf'),('DV-Bold','DejaVuSans-Bold.ttf'),('DV-Oblique','DejaVuSans-Oblique.ttf'),('DVM','DejaVuSansMono.ttf')]:pdfmetrics.registerFont(TTFont(name,str(FONT/file)))
pdfmetrics.registerFontFamily('DV',normal='DV',bold='DV-Bold',italic='DV-Oblique',boldItalic='DV-Bold')
NAVY=colors.HexColor('#142C42');TEAL=colors.HexColor('#087F86');RED=colors.HexColor('#9C2937');INK=colors.HexColor('#243746');GRAY=colors.HexColor('#5B6C79');PALE=colors.HexColor('#EDF3F6')
W,H=A4;LEFT=45;RIGHT=45;TOP=57;BOTTOM=48;CONTENT=W-LEFT-RIGHT
styles={
 'body':ParagraphStyle('Body',fontName='DV',fontSize=9.6,leading=13.8,textColor=INK,spaceAfter=6.5,splitLongWords=True,allowWidows=0,allowOrphans=0),
 'h1':ParagraphStyle('Chapter',fontName='DV-Bold',fontSize=19,leading=24,textColor=NAVY,spaceBefore=7,spaceAfter=15,keepWithNext=False),
 'h2':ParagraphStyle('Section',fontName='DV-Bold',fontSize=12.2,leading=17,textColor=TEAL,spaceBefore=14,spaceAfter=8,keepWithNext=True),
 'table':ParagraphStyle('Table',fontName='DV',fontSize=7.5,leading=10.8,textColor=INK,spaceAfter=0,splitLongWords=True),
 'tablehead':ParagraphStyle('TableHead',fontName='DV-Bold',fontSize=7.5,leading=10.8,textColor=colors.white,spaceAfter=0,splitLongWords=True),
 'small':ParagraphStyle('Small',fontName='DV',fontSize=8,leading=11.7,textColor=GRAY,spaceAfter=8,splitLongWords=True),
 'bullet':ParagraphStyle('Bullet',fontName='DV',fontSize=9.6,leading=14.1,textColor=INK,leftIndent=14,bulletIndent=2,spaceAfter=6,splitLongWords=True),
 'coverkicker':ParagraphStyle('Kicker',fontName='DV-Bold',fontSize=10,leading=15,textColor=TEAL,spaceAfter=14),
 'cover':ParagraphStyle('Cover',fontName='DV-Bold',fontSize=34,leading=39,textColor=NAVY,spaceAfter=13),
 'coversub':ParagraphStyle('CoverSub',fontName='DV',fontSize=18,leading=25,textColor=NAVY,spaceAfter=18),
}
styles['meta']=ParagraphStyle('FindingMeta',parent=styles['body'],keepWithNext=True)
def inline(s):
 # Preserve destinations separately while escaping visible Markdown.
 links=[]
 def link(m):links.append((m.group(1),m.group(2)));return f'ZZLINKTOKEN{len(links)-1}ZZ'
 s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',link,s)
 s=html.escape(s.replace('<br/>','ZZLINEBREAKZZ'),quote=False).replace('ZZLINEBREAKZZ','<br/>')
 s=re.sub(r'`([^`]+)`',lambda m:'<font name="DVM" size="8">'+m.group(1)+'</font>',s)
 s=re.sub(r'\*\*([^*]+)\*\*',r'<b>\1</b>',s)
 s=re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)',r'<i>\1</i>',s)
 for i,(label,url) in enumerate(links):s=s.replace(f'ZZLINKTOKEN{i}ZZ',f'<link href="{html.escape(url,quote=True)}" color="#087F86">{html.escape(label,quote=False)}</link>')
 return s
def P(s,style='body'):return Paragraph(inline(s),styles[style])
def cols(head):
 n=len(head)
 if head[0]=='Current residual severity':return [.68,.32]
 if head[0]=='Technical disposition':return [.68,.32]
 if head[0]=='Repository / branch':return [.24,.38,.38]
 if head[0]=='Operating scope':return [.25,.22,.53]
 if head[0]=='Changed path':return [.39,.61]
 if head[0]=='Historical artifact path':return [.44,.56]
 if head[0]=='ID' and n==4:return [.08,.14,.23,.55]
 if head[0]=='ID / priority':return [.13,.20,.67]
 if head[0]=='Category':return [.17,.34,.49]
 if head[0]=='Historical occurrence':return [.20,.10,.13,.25,.32]
 if head[0]=='No.':return [.07,.235,.15,.14,.405]
 if head[0]=='Method / track':return [.23,.25,.52]
 if head[0]=='Independent candidate':return [.23,.23,.54]
 if n==2:return [.28,.72]
 if n==3:return [.22,.26,.52]
 if n==4:return [.20,.19,.24,.37]
 if n==5:return [.12,.19,.16,.18,.35]
 return [1/n]*n
def make_table(lines):
 raw=[[c.strip() for c in line.strip().strip('|').split('|')] for line in lines]
 raw=[r for r in raw if not all(re.fullmatch(r':?-{3,}:?',c or '') for c in r)]
 head=raw[0];data=[[P(c,'tablehead' if i==0 else 'table') for c in row] for i,row in enumerate(raw)]
 t=LongTable(data,colWidths=[CONTENT*x for x in cols(head)],repeatRows=1,hAlign='LEFT',splitByRow=1,splitInRow=0)
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),0.8,TEAL),('LINEBELOW',(0,1),(-1,-1),0.25,colors.HexColor('#D7E1E6'))]))
 return t
class AuditDoc(BaseDocTemplate):
 def __init__(self,path):
  super().__init__(str(path),pagesize=A4,leftMargin=LEFT,rightMargin=RIGHT,topMargin=TOP,bottomMargin=BOTTOM,title='XITA Direct-BLS - Comprehensive Security Delta Re-Audit - 29 October 2026',author='OpenAI GPT-6 Astra',subject='Complete frozen-source delta audit; separate core, sponsorship and recovery decisions',pageCompression=1)
  self.bookmarks=0
  self.addPageTemplates([PageTemplate(id='Audit',frames=[Frame(LEFT,BOTTOM,CONTENT,H-TOP-BOTTOM,id='normal',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=self.draw_page)])
 def draw_page(self,c,doc):
  c.saveState()
  if doc.page>1:
   c.setStrokeColor(TEAL);c.setLineWidth(0.7);c.line(LEFT,H-37,W-RIGHT,H-37)
   c.setFont('DV-Bold',7.2);c.setFillColor(GRAY);c.drawString(LEFT,H-28,'XITA / DIRECT-BLS / SECURITY AUDIT')
   c.setFont('DV',7.2);c.drawRightString(W-RIGHT,H-28,'29 OCT 2026  |  v3.2.0')
  c.setStrokeColor(colors.HexColor('#D8E1E7'));c.setLineWidth(0.5);c.line(LEFT,34,W-RIGHT,34)
  c.setFont('DV',6.8);c.setFillColor(GRAY);c.drawString(LEFT,23,'Frozen source assessment  |  Publication-safe report')
  c.drawRightString(W-RIGHT,23,str(doc.page));c.restoreState()
 def afterFlowable(self,flowable):
  if isinstance(flowable,Paragraph) and flowable.style.name in ['Chapter','Section']:
   text=flowable.getPlainText();level=0 if flowable.style.name=='Chapter' else 1
   if text=='Contents':return
   self.bookmarks+=1;key='heading-'+hashlib.sha256(text.encode()).hexdigest()[:20]
   self.canv.bookmarkPage(key)
   self.canv.addOutlineEntry(text,key,level=level,closed=level==0)
   if level==0:self.notify('TOCEntry',(0,text,self.page,key))
def body_flow(md):
 lines=md.splitlines();i=0;story=[]
 def special(line):return line.startswith(('#','|','- ')) or re.match(r'^\d+\. ',line)
 while i<len(lines):
  line=lines[i].strip()
  if not line:i+=1;continue
  if line.startswith('## '):
   if story:story.append(CondPageBreak(500))
   story.append(P(line[3:],'h1'));i+=1;continue
  if line.startswith('### '):story.append(P(line[4:],'h2'));i+=1;continue
  if line.startswith('|'):
   group=[]
   while i<len(lines) and lines[i].strip().startswith('|'):group.append(lines[i]);i+=1
   story.append(make_table(group));story.append(Spacer(1,10));continue
  number=re.match(r'^(\d+)\. (.*)$',line)
  if number:
   story.append(Paragraph(inline(number[2]),styles['bullet'],bulletText=number[1]+'.'));i+=1;continue
  if line.startswith('- '):story.append(Paragraph(inline(line[2:]),styles['bullet'],bulletText='•'));i+=1;continue
  para=[line];i+=1
  while i<len(lines) and lines[i].strip() and not special(lines[i].strip()):
   para.append(lines[i].strip());i+=1
  joined=' '.join(para)
  story.append(P(joined,'meta' if re.fullmatch(r'\*\*[^*]+\*\*',joined) else 'body'))
 return story

story=[Spacer(1,18),P('INDEPENDENT SECURITY ASSESSMENT / 29 OCTOBER 2026','coverkicker'),P('XITA<br/>Direct-BLS Interchain','cover'),P('Comprehensive security<br/>delta re-audit v3.2.0','coversub')]
cover_rows=[['OPERATING SCOPE','SOURCE DECISION'],['Self-funded core transfers','CONDITIONAL GO'],['Regular unattended sponsorship','NO-GO'],['Supervised core recovery','CONDITIONAL GO']]
cover_table=LongTable([[P(a,'tablehead' if i==0 else 'body'),P(b,'tablehead' if i==0 else 'body')] for i,(a,b) in enumerate(cover_rows)],colWidths=[CONTENT*.59,CONTENT*.41])
cover_table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY),('ROWBACKGROUNDS',(0,1),(-1,-1),[PALE,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12)]))
story += [cover_table,Spacer(1,18),P('Audit ID: **XITA-DBLS-2026-10-29-v3.2.0**'),P('35 current entries: 28 residual risks and 7 resolved causes.<br/>All 32 prior current findings and 43 historical occurrences reassessed.'),P('62 Interchain commits / 48 changed paths / zero node delta.','small'),Spacer(1,7),P('**Authorized frozen source**','small'),P('xgr-network/xgr-interchain / main<br/>5cfc095d0f02271427832ee6bbb268322f38ae2d','small'),P('xgr-network/xgr-node / XGR3.0<br/>51d92f1ab9b1ba52f62e2ff903c6ff0a7c2f5671','small'),Spacer(1,6),P('OpenAI GPT-6 Astra - AI-assisted independent assessment commissioned by the project owner. This is not a human audit-firm attestation.','small'),P('Complete English report. Private reproductions and the exact pre-history Phase A master are separately retained. Source defects, deployment observations and missing assurance are distinguished.','small'),PageBreak(),P('Contents','h1')]
toc=TableOfContents();toc.levelStyles=[ParagraphStyle('TOC',fontName='DV',fontSize=9.4,leading=15,textColor=NAVY,spaceBefore=7,leftIndent=0,firstLineIndent=0)]
story +=[toc,Spacer(1,14),P('Reading guide: section 6 re-evaluates every prior finding; section 7 assesses all ten sponsorship invariants; section 11 details the three new findings. Section 13 separates the three operating decisions. The full inventory, exact tests and archive identities accompany this report.','small'),PageBreak()]
body='## 1.'+TEXT.split('## 1.',1)[1]
story+=body_flow(body)
doc=AuditDoc(OUT/'report.pdf');doc.multiBuild(story)
reader=PdfReader(str(OUT/'report.pdf'));pages=[p.extract_text() or '' for p in reader.pages]
joined='\n'.join(pages)
source_digest=hashlib.sha256((OUT/'report.md').read_bytes()).hexdigest()
qa={'file':'report.pdf','source':'report.md','source_sha256':source_digest,'pages':len(reader.pages),'bytes':(OUT/'report.pdf').stat().st_size,'sha256':hashlib.sha256((OUT/'report.pdf').read_bytes()).hexdigest(),'text_chars':sum(map(len,pages)),'empty_pages':[i+1 for i,t in enumerate(pages) if len(t.strip())<50],'all_current_ids_present':all(f'F-{i:02d}' in joined for i in range(1,36)),'all_chapters_present':all(re.search(r'(?:^|\n)'+str(i)+r'\. ',joined) for i in range(1,16)),'visual_review':'Pending render inspection; final validation appended separately.'}
(OUT/'pdf-validation.json').write_text(json.dumps(qa,indent=2)+'\n');print(json.dumps(qa))
