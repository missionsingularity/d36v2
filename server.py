"""Singularity local training workspace. Standard-library server and SQLite store."""
from __future__ import annotations
import hashlib, json, mimetypes, os, re, secrets, sqlite3, time, zipfile, io, html
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from docx import Document as WordDocument
from openpyxl import Workbook
from pptx import Presentation
from pptx.util import Inches, Pt
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT=Path(__file__).resolve().parent
PKG=ROOT/'Singularity_D36V2_Implementation'/'Singularity_D36V2_Implementation'
FIX=PKG/'fixtures'; DOCS=PKG/'source-records'; DB=ROOT/'singularity-training.sqlite3'
PORT=int(os.environ.get('PORT','8000'))
def now(): return datetime.now(timezone.utc).isoformat()
def fixture(name): return json.loads((FIX/name).read_text(encoding='utf-8'))

def db():
    c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); return c
def init_db():
    c=db(); c.executescript('''
    CREATE TABLE IF NOT EXISTS offices(id TEXT PRIMARY KEY,name TEXT,location TEXT,parent_id TEXT,classification TEXT DEFAULT 'training');
    CREATE TABLE IF NOT EXISTS people(id TEXT PRIMARY KEY,name TEXT,designation TEXT,office_id TEXT,role TEXT,manager_id TEXT,classification TEXT DEFAULT 'training');
    CREATE TABLE IF NOT EXISTS pensions(id TEXT PRIMARY KEY,name TEXT,office_id TEXT,district TEXT,department TEXT,unresolved INTEGER,stage TEXT,issue TEXT,late_objection INTEGER,visible_before_retirement INTEGER,potential_match INTEGER,manual_review INTEGER,owner_id TEXT,as_of TEXT,case_id TEXT,details TEXT,modified_at TEXT);
    CREATE TABLE IF NOT EXISTS grievances(id TEXT PRIMARY KEY,proposal_id TEXT,received TEXT,status TEXT,disposed TEXT,atr_date TEXT,outcome_verified INTEGER,owner_id TEXT,data TEXT);
    CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,title TEXT,version INTEGER,path TEXT,anchor TEXT,location TEXT,passage TEXT,sha256 TEXT,classification TEXT,proposal_id TEXT,content TEXT);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,proposal_id TEXT,timestamp TEXT,actor_id TEXT,action TEXT,decision TEXT,external_disclosure_confirmed INTEGER,classification TEXT,data TEXT);
    CREATE TABLE IF NOT EXISTS knowledge(id TEXT PRIMARY KEY,state TEXT,data TEXT);
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,title TEXT,case_id TEXT,assignee_id TEXT,due_date TEXT,status TEXT,priority TEXT,evidence TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,title TEXT,kind TEXT,case_id TEXT,content TEXT,version INTEGER,status TEXT,created_by TEXT,created_at TEXT,classification TEXT);
    CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,target_id TEXT,target_version INTEGER,reviewer_id TEXT,state TEXT,reason TEXT,created_at TEXT,decided_at TEXT,created_by TEXT);
    CREATE TABLE IF NOT EXISTS audit_new(id TEXT PRIMARY KEY,actor_id TEXT,action TEXT,resource_id TEXT,outcome TEXT,created_at TEXT,details TEXT);
    CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,status TEXT,purpose TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,actor_id TEXT,created_at TEXT);
    CREATE TABLE IF NOT EXISTS scope_grants(actor_id TEXT,resource_id TEXT,operation TEXT,reason TEXT,PRIMARY KEY(actor_id,resource_id,operation));
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT,role TEXT,body TEXT,citations TEXT,created_at TEXT);
    CREATE TABLE IF NOT EXISTS document_versions(id TEXT PRIMARY KEY,document_id TEXT,version INTEGER,content TEXT,created_at TEXT,created_by TEXT);
    ''')
    if c.execute('SELECT COUNT(*) FROM pensions').fetchone()[0]==0:
      offices=fixture('offices.json'); people=fixture('people.json'); pens=fixture('pensions.json'); grvs=fixture('grievances.json'); manifest=fixture('source_manifest.json'); audits=fixture('audit_events.json')
      c.executemany('INSERT INTO offices(id,name,location,parent_id) VALUES(:id,:name,:location,:parent_id)',offices)
      c.executemany('INSERT INTO people(id,name,designation,office_id,role,manager_id) VALUES(:id,:name,:designation,:office_id,:role,:manager_id)',people)
      for p in pens:
        c.execute('INSERT INTO pensions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(p['id'],p['pensioner_name'],p['office_id'],p['district'],p['department'],int(bool(p['unresolved'])),p['stage'],p['issue'],int(bool(p.get('late_objection'))),int(bool(p.get('visible_before_retirement'))),int(bool(p.get('potential_clarification_match'))),int(bool(p.get('manual_review'))),p.get('owner_id'),p['as_of'],p.get('case_id'),json.dumps(p,ensure_ascii=False),None))
      for g in grvs:c.execute('INSERT INTO grievances VALUES(?,?,?,?,?,?,?,?,?)',(g['id'],g['proposal_id'],g['received'],g['status'],g.get('disposed'),g.get('atr_date'),int(g.get('outcome_verified',False)),g.get('owner_id'),json.dumps(g)))
      for d in manifest:
        source_path=PKG/d['path']; raw=source_path.read_bytes(); content=raw.decode('utf-8'); got=hashlib.sha256(raw).hexdigest()
        if got!=d['sha256']:raise ValueError(f"Source checksum mismatch: {d['id']}")
        c.execute('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?,?)',(d['id'],d['title'],d['version'],d['path'],d['anchor'],d['logical_location'],d['passage'],got,d['classification'],d.get('proposal_id'),content))
      for a in audits:c.execute('INSERT INTO audit VALUES(?,?,?,?,?,?,?,?,?)',(a['id'],a.get('proposal_id'),a['timestamp'],a['actor_id'],a['action'],a['decision'],int(a.get('external_disclosure_confirmed',False)),a.get('classification','training'),json.dumps(a)))
      for k in fixture('knowledge_changes.json'):c.execute('INSERT INTO knowledge VALUES(?,?,?)',(k['id'],k['state'],json.dumps(k)))
      c.commit()
    c.executemany('INSERT OR IGNORE INTO scope_grants VALUES(?,?,?,?)',[
      ('P06','PEN-NGN-2026-041','read','Fictional casebook dealing assignment'),
      ('P06','PEN-NGN-2026-041','write','Prepare drafts and proposed tasks for casebook workflow'),
      ('P06','PEN-NGN-2026-058','read','Fictional casebook correction proposal'),
      ('P06','PEN-NGN-2026-058','write','Prepare proposed verification correction for review'),
    ])
    cols={r[1] for r in c.execute('PRAGMA table_info(conversations)')}
    if 'owner_id' not in cols:c.execute('ALTER TABLE conversations ADD COLUMN owner_id TEXT')
    c.commit()
    c.close()
def audit(actor,action,res,outcome='recorded',details=''):
    c=db(); c.execute('INSERT INTO audit_new VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),actor,action,res,outcome,now(),details)); c.commit(); c.close()
def actor_for(h):
    t=h.headers.get('Cookie',''); m=re.search(r'(?:^|; )sg_training_session=([^;]+)',t)
    if not m:return None
    c=db(); r=c.execute('SELECT actor_id FROM sessions WHERE token=?',(m.group(1),)).fetchone(); c.close(); return r['actor_id'] if r else None
def role_for(actor):
    c=db(); r=c.execute('SELECT role FROM people WHERE id=?',(actor,)).fetchone(); c.close(); return r['role'] if r else None
def allowed(actor,operation,case_id=None):
    role=role_for(actor)
    if not role:return False
    if operation=='audit':return role in ('leadership','supervisor','audit_officer')
    if operation=='approve':return role in ('leadership','supervisor','head_of_office')
    if operation=='metadata':return True
    if operation in ('read','write'):
      c=db(); p=c.execute('SELECT owner_id,office_id FROM pensions WHERE id=?',(case_id,)).fetchone() if case_id else None
      person=c.execute('SELECT office_id FROM people WHERE id=?',(actor,)).fetchone(); c.close()
      if role=='system_admin':return operation=='read' and case_id is None
      if not p:return role in ('leadership','supervisor','audit_officer') if operation=='read' else False
      if role in ('leadership','supervisor','audit_officer'):return True
      c=db(); grant=c.execute('SELECT 1 FROM scope_grants WHERE actor_id=? AND resource_id=? AND operation=?',(actor,case_id,operation)).fetchone();c.close()
      if grant:return True
      if role=='head_of_office':return actor==p['owner_id'] or (person and person['office_id']==p['office_id'])
      return actor==p['owner_id'] and role in ('pension_assistant','grievance_officer','staff','directorate_officer')
    return False
def rows(sql,args=()):
    c=db(); out=[dict(r) for r in c.execute(sql,args).fetchall()]; c.close(); return out
def case_record(cid):
    r=rows('SELECT * FROM pensions WHERE id=?',(cid,)); return json.loads(r[0]['details']) if r else None
def sources_for(query='',case_id=None):
    c=db(); allr=[dict(r) for r in c.execute('SELECT id,title,version,anchor,location,passage,sha256,proposal_id,content FROM sources')]; c.close()
    words=[w for w in re.findall(r'[\w-]{3,}',query.lower()) if w not in {'what','how','why','show','find','about','case','please','pension','current','status','summarize','prepare','review','record','records','draft','the','for','and'}]
    selected=[]
    for d in allr:
      hay=(d['title']+' '+d['passage']+' '+d['content']).lower()
      if case_id and d['proposal_id']==case_id:selected.append(d); continue
      score=sum(w in hay for w in words)
      if score:selected.append(d)
    selected.sort(key=lambda d:(d['proposal_id']!=case_id if case_id else False,d['id']))
    return selected
def tool_answer(query,actor):
    q=query.lower(); found=rows('SELECT id,name,details FROM pensions');
    exact=None
    for p in found:
      d=json.loads(p['details'])
      if p['id'].lower() in q or p['name'].lower() in q or (d.get('case_id') and d['case_id'].lower() in q):exact=p;break
    cid=exact['id'] if exact else None
    if cid and not allowed(actor,'read',cid):audit(actor,'case.read',cid,'denied');return {'answer':'Access to this training case is outside the current officer scope.','citations':[],'steps':[{'label':'Scope check','state':'denied'}]}
    docs=sources_for(query,cid); citations=[{'id':d['id'],'title':d['title'],'version':d['version'],'anchor':d['anchor'],'location':d['location'],'passage':d['passage']} for d in docs]
    if '186' in q or 'cohort' in q or 'backlog' in q or 'other pension' in q or 'unresolved' in q:
      allp=[json.loads(x['details']) for x in found]; un=[x for x in allp if x['unresolved']]; issues={}
      for x in un:issues[x['issue']]=issues.get(x['issue'],0)+1
      ho=sum(x['stage']=='head_of_office' for x in un); late=[x for x in un if x['issue']=='service_verification' and x['late_objection']]; visible=sum(bool(x['visible_before_retirement']) for x in late)
      answer=f"The training registry contains {len(allp)} pension records as of 24 November 2026. {len(un)} are unresolved; {ho} of those are at Head of Office stage. Unresolved issues: service verification {issues.get('service_verification',0)}, missing documents {issues.get('missing_documents',0)}, clarification {issues.get('clarification',0)}, other {issues.get('other',0)}. {len(late)} service-verification objections were raised after retirement; {visible} were visible before retirement. These are record counts, not legal eligibility findings."
      table={'headers':['Measure','Count'],'rows':[['Registry records',len(allp)],['Unresolved',len(un)],['Head of Office among unresolved',ho],['Service verification',issues.get('service_verification',0)],['Missing documents',issues.get('missing_documents',0)],['Clarification',issues.get('clarification',0)],['Other',issues.get('other',0)],['Late service objections',len(late)],['Visible before retirement',visible]]}
    elif 'audit' in q or 'access history' in q or 'disclos' in q or 'security review' in q:
      events=rows("SELECT * FROM audit WHERE proposal_id='PEN-NGN-2026-041' AND timestamp >= '2026-08-01'"); denied=[x for x in events if x['decision'] in ('denied','blocked')]; actors={x['actor_id'] for x in events if x['decision']=='allowed'}; leaked=sum(x['external_disclosure_confirmed'] for x in events)
      answer=f"The reviewed training logs contain {len(events)} events involving {len(actors)} actors, {len(denied)} denied or blocked operations, and {leaked} confirmed successful external disclosures. A denied or blocked event records a control outcome; it does not establish intent or exclude activity outside these logs."
      table={'headers':['Measure','Count'],'rows':[['Events since 1 Aug 2026',len(events)],['Distinct actors',len(actors)],['Denied or blocked',len(denied)],['Confirmed external disclosures',leaked]]}
      docs=sources_for('audit logs security external export',None); citations=[{'id':d['id'],'title':d['title'],'version':d['version'],'anchor':d['anchor'],'location':d['location'],'passage':d['passage']} for d in docs]
    elif 'clarification' in q or 'knowledge' in q or 'rule change' in q:
      pps=[json.loads(x['details']) for x in found]; krows=rows("SELECT data FROM knowledge WHERE id='KB-CHANGE-2026-0037'"); change=json.loads(krows[0]['data']) if krows else {}
      matches=[p for p in pps if p.get('potential_clarification_match')]; manual=[p for p in pps if p.get('manual_review')]
      answer=f"The indexed 20 November clarification is a fictional training source and remains unverified. Its issuing authority, signature, effective date and compatibility with the governing pension rules are not verified. The supplied impact fixture lists {len(change.get('potential_case_ids',matches))} potential case matches; {len(change.get('manual_review_case_ids',manual))} case is flagged for manual review. No pension case or authoritative knowledge entry has been changed. Publication remains blocked pending verification and authorised approval."
      table={'headers':['Review control','Status'],'rows':[['Source indexed','Complete'],['Potential case matches',len(change.get('potential_case_ids',matches))],['Manual review cases',len(change.get('manual_review_case_ids',manual))],['Issuing authority','Not verified'],['Signature','Not verified'],['Effective date','Not verified'],['Rule compatibility','Not verified'],['Publication approval','Not approved']]}
      docs=sources_for('DOC-017 clarification extraordinary leave',None); citations=[{'id':d['id'],'title':d['title'],'version':d['version'],'anchor':d['anchor'],'location':d['location'],'passage':d['passage']} for d in docs]
    elif exact:
      d=json.loads(exact['details']);
      if exact['id']=='PEN-NGN-2026-041':answer='The supplied records place this proposal at the Head of Office stage as of 24 November 2026. The claimed service is 388 months versus 382 months in the verification record, a six-month discrepancy corresponding to extraordinary leave from July through December 2004. The leave sanction order is not present, so the record does not establish how that period should be treated. The proposal is not recorded as forwarded; PPO issuance and payment are not established. The next procedural step shown by the records is to obtain the leave sanction order and a verified service statement from the Head of Office. No legal entitlement determination is made.'
      elif exact['id']=='PEN-NGN-2026-058':answer='A training record proposes completing service verification based on a 19 November 2026 document. Head of Office review remains pending. The proposal is unapproved and no downstream case status change is authorised by the supplied record.'
      else:answer=f"The case record identifies {d['pensioner_name']} in {d['district']} with current recorded stage {d.get('stage','not specified').replace('_',' ')} and issue category {d.get('issue','not specified').replace('_',' ')}. The displayed values are training records and do not constitute a legal or payment determination."
      if 'grievance' in q or '01192' in q or '01874' in q:
        gs=rows('SELECT * FROM grievances WHERE proposal_id=?',(exact['id'],)); answer+=' Linked grievance history: '+('; '.join(f"{g['id']} received {g['received']}, status {g['status']}"+(f", administratively disposed {g['disposed']}" if g['disposed'] else '')+f", outcome verified: {'yes' if g['outcome_verified'] else 'no'}" for g in gs))+'. Administrative disposal is not evidence of substantive pension settlement.'
      table=None
    else:
      answer='I searched the available training records using your wording. The sources below are the matching records; review the cited passages for the exact supported facts. I cannot answer beyond the supplied records, and this local workspace has no connected language model.'
      table=None
    audit(actor,'search.retrieve',cid or 'workspace','allowed',query[:160]);
    return {'answer':answer,'citations':citations,'table':table if 'table' in locals() else None,'steps':[{'label':'Retrieve scoped records','state':'complete'},{'label':'Calculate from local records','state':'complete'} if table else {'label':'Summarise matching evidence','state':'complete'}]}

def xml(s): return html.escape(str(s),quote=True)
def make_docx(title,body):
  doc=WordDocument();doc.add_heading(title,0)
  for line in body.splitlines():doc.add_paragraph(line)
  out=io.BytesIO();doc.save(out);return out.getvalue()
def make_xlsx(title,table):
  wb=Workbook();ws=wb.active;ws.title=title[:31];ws.append(table['headers'])
  for row in table['rows']:ws.append(row)
  ws.freeze_panes='A2';ws.auto_filter.ref=ws.dimensions
  for col in ws.columns:
    letter=col[0].column_letter; ws.column_dimensions[letter].width=min(44,max(14,max(len(str(c.value or '')) for c in col)+2))
  for cell in ws[1]:cell.font=cell.font.copy(bold=True,color='FFFFFF');cell.fill=__import__('openpyxl').styles.PatternFill('solid',fgColor='2457A6')
  out=io.BytesIO();wb.save(out);return out.getvalue()
def make_pdf(title,body):
  from reportlab.lib.units import inch
  out=io.BytesIO();doc=SimpleDocTemplate(out,pagesize=letter,rightMargin=0.7*inch,leftMargin=0.7*inch,topMargin=0.7*inch,bottomMargin=0.7*inch);styles=getSampleStyleSheet();story=[Paragraph(xml(title),styles['Title']),Spacer(1,12)]
  for line in body.splitlines():story.append(Paragraph(xml(line) or '&nbsp;',styles['BodyText']));story.append(Spacer(1,5))
  story.append(Spacer(1,12));story.append(Paragraph('<b>TRAINING DATA — NOT AN OFFICIAL GOVERNMENT DOCUMENT</b>',styles['Italic']));doc.build(story);return out.getvalue()
def make_pptx(title,body):
  prs=Presentation();slide=prs.slides.add_slide(prs.slide_layouts[1]);slide.shapes.title.text=title;tf=slide.placeholders[1].text_frame;tf.clear()
  for i,line in enumerate(body.splitlines()):
    p=tf.paragraphs[0] if i==0 else tf.add_paragraph();p.text=line;p.font.size=Pt(17)
  note=slide.shapes.add_textbox(Inches(.5),Inches(6.9),Inches(9),Inches(.3));note.text_frame.text='TRAINING DATA — NOT AN OFFICIAL GOVERNMENT DOCUMENT';note.text_frame.paragraphs[0].font.size=Pt(9)
  out=io.BytesIO();prs.save(out);return out.getvalue()

class Handler(BaseHTTPRequestHandler):
  def log_message(self,fmt,*args): print('%s - %s'%(self.address_string(),fmt%args))
  def send(self,code,obj,ctype='application/json; charset=utf-8',headers=None):
    data=obj if isinstance(obj,bytes) else (json.dumps(obj,ensure_ascii=False).encode() if ctype.startswith('application/json') else str(obj).encode())
    self.send_response(code); self.send_header('Content-Type',ctype); self.send_header('Content-Length',str(len(data))); self.send_header('X-Content-Type-Options','nosniff'); self.send_header('Cache-Control','no-store')
    for k,v in (headers or {}).items():self.send_header(k,v)
    self.end_headers();self.wfile.write(data)
  def body(self):
    n=int(self.headers.get('Content-Length','0'))
    if n>1_000_000:raise ValueError('Request too large')
    return json.loads(self.rfile.read(n) or b'{}')
  def json(self,code,obj,headers=None):self.send(code,obj,headers=headers)
  def do_GET(self):
    path=urlparse(self.path).path; actor=actor_for(self)
    if path=='/api/session':
      if not actor:
        token=secrets.token_urlsafe(32); actor='P06';c=db();c.execute('INSERT INTO sessions VALUES(?,?,?)',(token,actor,now()));c.commit();c.close();self.json(200,{'actor':self.person(actor),'mode':'local training persona'}, {'Set-Cookie':f'sg_training_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'})
      else:self.json(200,{'actor':self.person(actor),'mode':'local training persona'})
      return
    if path.startswith('/api/') and not actor:self.json(401,{'error':'A local training session is required.'});return
    if path=='/api/bootstrap':
      ps=[p for p in rows('SELECT * FROM pensions ORDER BY id') if allowed(actor,'read',p['id'])]; visible_ids={json.loads(p['details'])['id'] for p in ps}
      docs=[d for d in rows('SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources ORDER BY id') if not d['proposal_id'] or allowed(actor,'read',d['proposal_id'])]
      grvs=[dict(x,**json.loads(x['data'])) for x in rows('SELECT * FROM grievances') if x['proposal_id'] in visible_ids]
      tasks=[t for t in rows('SELECT * FROM tasks ORDER BY created_at DESC') if t['assignee_id']==actor or not t['case_id'] or t['case_id'] in visible_ids]
      documents=[d for d in rows('SELECT id,title,kind,case_id,version,status,created_by,created_at FROM documents ORDER BY created_at DESC') if not d['case_id'] or d['case_id'] in visible_ids]
      doc_ids={d['id'] for d in documents};approvals=[a for a in rows('SELECT * FROM approvals ORDER BY created_at DESC') if a['target_id'] in doc_ids]
      self.json(200,{'pensions':[json.loads(p['details']) for p in ps],'sources':docs,'people':rows('SELECT * FROM people ORDER BY name'),'offices':rows('SELECT * FROM offices ORDER BY name'),'grievances':grvs,'tasks':tasks,'documents':documents,'approvals':approvals,'connections':rows('SELECT * FROM connections'),'knowledge':rows('SELECT * FROM knowledge'),'stats':{'pensions':len(ps),'unresolved':sum(json.loads(p['details'])['unresolved'] for p in ps),'source_documents':len(docs)}});return
    if path=='/api/conversations':
      conv=rows('SELECT id,title,created_at,updated_at FROM conversations WHERE owner_id=? ORDER BY updated_at DESC LIMIT 50',(actor,)); self.json(200,{'items':conv});return
    if path.startswith('/api/conversations/'):
      cid=path.rsplit('/',1)[1]; conv=rows('SELECT * FROM conversations WHERE id=? AND owner_id=?',(cid,actor))
      if not conv:self.json(404,{'error':'Conversation not found'});return
      self.json(200,{'conversation':conv[0],'messages':rows('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at',(cid,))});return
    if path.startswith('/api/source/'):
      sid=path.rsplit('/',1)[1]; s=rows('SELECT * FROM sources WHERE id=?',(sid,));
      if not s:self.json(404,{'error':'Source not found'});return
      if s[0]['proposal_id'] and not allowed(actor,'read',s[0]['proposal_id']):audit(actor,'source.open',sid,'denied');self.json(403,{'error':'Access denied'});return
      audit(actor,'source.open',sid);self.json(200,s[0]);return
    if path=='/api/apps':self.json(200,{'apps':[{'id':x,'name':x,'status':'local training adapter' if x in ('Pensions','Grievances','Files','Knowledge','Work','Approvals','Analytics','Audit') else 'unavailable','live':False} for x in ['Pensions','Grievances','Files','Knowledge','Approvals','Work','Analytics','Audit','Meetings','Reports','Kritagyata','eOffice','CPGRAMS','NIC Email','Directorate of Pension','Accountant General (A&E)','Treasury','Service Book','Employee Records','Legacy Register','Leave Archive']]});return
    if path=='/api/audit':
      if not allowed(actor,'audit'):audit(actor,'audit.list','workspace','denied');self.json(403,{'error':'Audit scope restricted'});return
      audit(actor,'audit.list','workspace');self.json(200,{'items':rows('SELECT * FROM audit ORDER BY timestamp DESC'),'actions':rows('SELECT * FROM audit_new ORDER BY created_at DESC')});return
    if path=='/api/search':
      q=parse_qs(urlparse(self.path).query).get('q',[''])[0].lower(); ps=rows('SELECT * FROM pensions'); matches=[]
      for p in ps:
       d=json.loads(p['details']); hay=(json.dumps(d,ensure_ascii=False)).lower()
       if q and q in hay and allowed(actor,'read',d['id']):matches.append(d)
      self.json(200,{'items':matches[:50],'count':len(matches)});return
    if path=='/api/download/export-registry':
      if not allowed(actor,'read'):self.json(403,{'error':'Registry export is outside your scope'});return
      ps=rows('SELECT * FROM pensions'); cohort=[json.loads(p['details']) for p in ps if json.loads(p['details'])['unresolved']]
      table={'headers':['Proposal ID','Pensioner','District','Stage','Issue','Owner','As of'],'rows':[[p['id'],p['pensioner_name'],p['district'],p['stage'],p['issue'],p.get('owner_id',''),p['as_of']] for p in cohort]}
      blob=make_xlsx('Unresolved registry',table);audit(actor,'registry.export','pension-registry','created',f'{len(cohort)} records');self.send(200,blob,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':'attachment; filename="unresolved-pension-registry.xlsx"'});return
    if path.startswith('/api/download/'):
      did=path.rsplit('/',1)[1]; d=rows('SELECT * FROM documents WHERE id=?',(did,));
      if not d:self.json(404,{'error':'Document not found'});return
      if d[0]['case_id'] and not allowed(actor,'read',d[0]['case_id']):audit(actor,'document.export',did,'denied');self.json(403,{'error':'Access denied'});return
      fmt=parse_qs(urlparse(self.path).query).get('format',['docx'])[0].lower(); body=d[0]['content']; table=None
      if fmt=='docx':b=make_docx(d[0]['title'],body);ct='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      elif fmt=='pdf':b=make_pdf(d[0]['title'],body);ct='application/pdf'
      elif fmt=='xlsx':b=make_xlsx(d[0]['title'],{'headers':['Field','Value'],'rows':[[str(i+1),line] for i,line in enumerate(body.splitlines())]});ct='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      elif fmt=='pptx':b=make_pptx(d[0]['title'],body);ct='application/vnd.openxmlformats-officedocument.presentationml.presentation'
      else:self.json(400,{'error':'Unsupported format'});return
      audit(actor,'document.export',did,'created',fmt);self.send(200,b,ct,{'Content-Disposition':f'attachment; filename="{re.sub(r"[^A-Za-z0-9_-]","_",d[0]["title"])}.{fmt}"'});return
    self.static(path)
  def person(self,pid):
    x=rows('SELECT * FROM people WHERE id=?',(pid,));return x[0] if x else None
  def static(self,path):
    rel='index.html' if path=='/' else path.lstrip('/');
    if rel not in {'index.html','style.css','app.js'}:self.send(404,'Not found','text/plain');return
    f=(ROOT/rel).resolve()
    self.send(200,f.read_bytes(),mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  def do_POST(self):
    actor=actor_for(self); path=urlparse(self.path).path
    if not actor:self.json(401,{'error':'A local training session is required.'});return
    try:b=self.body()
    except Exception as e:self.json(400,{'error':str(e)});return
    if path=='/api/ask':self.json(200,tool_answer(str(b.get('query',''))[:1000],actor));return
    if path=='/api/conversations':
      cid='CV-'+secrets.token_hex(6).upper();title=str(b.get('title','New conversation'))[:120];c=db();c.execute('INSERT INTO conversations(id,title,created_at,updated_at,owner_id) VALUES(?,?,?,?,?)',(cid,title,now(),now(),actor));c.commit();c.close();self.json(201,{'id':cid,'title':title});return
    if path.startswith('/api/conversations/') and path.endswith('/messages'):
      cid=path.split('/')[-2];role=str(b.get('role',''));body=str(b.get('body',''))[:10000]
      if role not in ('user','assistant') or not rows('SELECT id FROM conversations WHERE id=? AND owner_id=?',(cid,actor)):self.json(404,{'error':'Conversation not found'});return
      mid='MSG-'+secrets.token_hex(8);c=db();c.execute('INSERT INTO messages VALUES(?,?,?,?,?,?)',(mid,cid,role,body,json.dumps(b.get('citations',[])),now()));c.execute('UPDATE conversations SET updated_at=? WHERE id=?',(now(),cid));c.commit();c.close();self.json(201,{'id':mid});return
    if path=='/api/actor':
      pid=str(b.get('person_id','')); p=self.person(pid)
      if not p:self.json(400,{'error':'Unknown training persona'});return
      tok=re.search(r'(?:^|; )sg_training_session=([^;]+)',self.headers.get('Cookie',''))
      if tok:
       c=db();c.execute('UPDATE sessions SET actor_id=? WHERE token=?',(pid,tok.group(1)));c.commit();c.close()
      self.json(200,{'actor':p,'mode':'local training persona'});return
    if path=='/api/task':
      cid=str(b.get('case_id',''))
      if cid and not allowed(actor,'write',cid):audit(actor,'task.create',cid,'denied');self.json(403,{'error':'Task assignment is outside the current officer scope'});return
      tid='TSK-'+secrets.token_hex(5).upper(); c=db();c.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',(tid,str(b.get('title','Verification follow-up'))[:180],cid,b.get('assignee_id',actor),str(b.get('due_date','')), 'prepared',str(b.get('priority','normal')),'[]',now(),now()));c.commit();c.close();audit(actor,'task.create',tid,'prepared',cid);self.json(201,{'id':tid,'status':'prepared'});return
    if path=='/api/document':
      cid=str(b.get('case_id',''))
      if cid and not allowed(actor,'write',cid):audit(actor,'document.create',cid,'denied');self.json(403,{'error':'Draft creation is outside the current officer scope'});return
      did='DRF-'+secrets.token_hex(5).upper();title=str(b.get('title','Case review note'))[:180];content=str(b.get('content',''))[:50000]+'\n\nTRAINING DATA — NOT AN OFFICIAL GOVERNMENT DOCUMENT'; c=db();c.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)',(did,title,str(b.get('kind','draft')),cid,content,1,'draft',actor,now(),'training'));c.execute('INSERT INTO document_versions VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),did,1,content,now(),actor));c.commit();c.close();audit(actor,'document.create',did,'prepared',cid);self.json(201,{'id':did,'version':1,'status':'draft'});return
    if path=='/api/approval':
      target=str(b.get('target_id','')); version=int(b.get('version',0)); reviewer=str(b.get('reviewer_id','P09')); d=rows('SELECT * FROM documents WHERE id=?',(target,))
      if not d or version!=d[0]['version']:self.json(409,{'error':'The approval must reference the current saved draft version'});return
      if not allowed(actor,'write',d[0]['case_id']):self.json(403,{'error':'Not authorised to submit this draft'});return
      aid='APR-'+secrets.token_hex(5).upper();c=db();c.execute('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?)',(aid,target,version,reviewer,'submitted','',now(),None,actor));c.execute('UPDATE documents SET status=? WHERE id=?',('submitted',target));c.commit();c.close();audit(actor,'approval.submit',aid,'awaiting review',target);self.json(201,{'id':aid,'state':'submitted','version':version});return
    if path.startswith('/api/approval/'):
      aid=path.rsplit('/',1)[1]; state=str(b.get('decision','')); reason=str(b.get('reason',''))[:1000]
      if not allowed(actor,'approve'):audit(actor,'approval.decide',aid,'denied');self.json(403,{'error':'This training persona cannot approve'});return
      if state not in ('approved','returned','rejected'):self.json(400,{'error':'Decision must be approved, returned or rejected'});return
      c=db();a=c.execute('SELECT * FROM approvals WHERE id=?',(aid,)).fetchone()
      if not a or a['state']!='submitted':c.close();self.json(409,{'error':'Approval is no longer pending'});return
      if a['created_by']==actor:c.close();audit(actor,'approval.decide',aid,'denied','separation of duties');self.json(403,{'error':'The submitter cannot decide their own request'});return
      c.execute('UPDATE approvals SET state=?,reason=?,decided_at=? WHERE id=?',(state,reason,now(),aid));c.execute('UPDATE documents SET status=? WHERE id=? AND version=?',(state,a['target_id'],a['target_version']));c.commit();c.close();audit(actor,'approval.decide',aid,state,a['target_id']);self.json(200,{'id':aid,'state':state,'version':a['target_version']});return
    if path=='/api/connection/request':
      app=str(b.get('app',''))[:100];cid='CON-'+hashlib.sha256(app.encode()).hexdigest()[:12];c=db();c.execute('INSERT OR REPLACE INTO connections VALUES(?,?,?,?)',(cid,'requested',str(b.get('purpose',''))[:500],now()));c.commit();c.close();audit(actor,'connection.request',cid,'requested',app);self.json(201,{'id':cid,'status':'requested','live':False});return
    self.json(404,{'error':'No such operation'})
  def do_PATCH(self):
    actor=actor_for(self);path=urlparse(self.path).path
    if not actor:self.json(401,{'error':'A local training session is required.'});return
    try:b=self.body()
    except Exception as e:self.json(400,{'error':str(e)});return
    if path.startswith('/api/case/'):
      cid=path.rsplit('/',1)[1]
      if not allowed(actor,'write',cid):audit(actor,'case.update',cid,'denied');self.json(403,{'error':'Case update outside your scope'});return
      cur=case_record(cid)
      if not cur:self.json(404,{'error':'Case not found'});return
      for k in ('stage','issue','owner_id'):
        if k in b:cur[k]=b[k]
      c=db();c.execute('UPDATE pensions SET stage=?,issue=?,owner_id=?,details=?,modified_at=? WHERE id=?',(cur.get('stage'),cur.get('issue'),cur.get('owner_id'),json.dumps(cur,ensure_ascii=False),now(),cid));c.commit();c.close();audit(actor,'case.propose_change',cid,'prepared','training record updated through local adapter');self.json(200,{'id':cid,'status':'updated'});return
    if path.startswith('/api/document/'):
      did=path.rsplit('/',1)[1];docs=rows('SELECT * FROM documents WHERE id=?',(did,));
      if not docs:self.json(404,{'error':'Draft not found'});return
      old=docs[0]
      if int(b.get('base_version',-1))!=old['version']:self.json(409,{'error':'Stale document version'});return
      if not allowed(actor,'write',old['case_id'])