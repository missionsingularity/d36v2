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
FIX=PKG/'fixtures'; DOCS=PKG/'source-records'; DB=Path(os.environ.get('SINGULARITY_DB',str(ROOT/'singularity-training.sqlite3')))
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
    CREATE TABLE IF NOT EXISTS task_events(id TEXT PRIMARY KEY,task_id TEXT,actor_id TEXT,event TEXT,details TEXT,created_at TEXT);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,title TEXT,kind TEXT,case_id TEXT,content TEXT,version INTEGER,status TEXT,created_by TEXT,created_at TEXT,classification TEXT);
    CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,target_id TEXT,target_version INTEGER,reviewer_id TEXT,state TEXT,reason TEXT,created_at TEXT,decided_at TEXT,created_by TEXT);
    CREATE TABLE IF NOT EXISTS approval_events(id TEXT PRIMARY KEY,approval_id TEXT,actor_id TEXT,event TEXT,reason TEXT,target_version INTEGER,created_at TEXT);
    CREATE TABLE IF NOT EXISTS case_proposals(id TEXT PRIMARY KEY,case_id TEXT,field TEXT,previous_value TEXT,proposed_value TEXT,source_id TEXT,requester_id TEXT,reviewer_id TEXT,version INTEGER,state TEXT,created_at TEXT,updated_at TEXT);
    CREATE TABLE IF NOT EXISTS case_proposal_versions(id TEXT PRIMARY KEY,proposal_id TEXT,version INTEGER,proposed_value TEXT,state TEXT,created_at TEXT,created_by TEXT);
    CREATE TABLE IF NOT EXISTS case_versions(id TEXT PRIMARY KEY,case_id TEXT,version INTEGER,details TEXT,created_at TEXT,created_by TEXT);
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
    change=fixture('knowledge_changes.json')[1]; cid=change['id']; aid='APR-'+cid
    c.execute('INSERT OR IGNORE INTO case_proposals VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(cid,change['proposal_id'],'service_verification_status','pending',change['proposed_verification'],change['source_id'],change['requester_id'],change['reviewer_id'],1,'submitted',now(),now()))
    c.execute('INSERT OR IGNORE INTO case_proposal_versions VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),cid,1,change['proposed_verification'],'submitted',now(),change['requester_id']))
    c.execute('INSERT OR IGNORE INTO approvals VALUES(?,?,?,?,?,?,?,?,?)',(aid,cid,1,change['reviewer_id'],'submitted','',now(),None,change['requester_id']))
    c.execute('INSERT OR IGNORE INTO approval_events VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),aid,change['requester_id'],'submitted','',1,now()))
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
      if not p:
        if operation=='read':return role in ('leadership','supervisor','audit_officer')
        if operation=='write':return role in ('leadership','supervisor','audit_officer')
        return False
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
def can_source(actor,d):
    if d.get('proposal_id'):
      return allowed(actor,'read',d['proposal_id'])
    role=role_for(actor)
    if d.get('id')=='DOC-013':return role in ('leadership','supervisor','audit_officer')
    if d.get('id')=='DOC-015':return allowed(actor,'audit')
    if d.get('id') in ('DOC-017','DOC-018'):
      return actor in ('P06','P09') or role in ('leadership','supervisor','audit_officer')
    return d.get('classification')=='training'
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
def tool_answer(query,actor,tool='search_records'):
    """Execute one registered local tool selected explicitly by the workspace action."""
    query=str(query)[:1000]; q=query.lower(); table=None; cid=None; citations=[]
    # The conversational UI sends natural language. Route broad intents to the
    # existing permission-checked tools without exposing an internal tool picker.
    if tool=='search_records':
      if any(w in q for w in ('grievance','complaint')) and any(w in q for w in ('compare','comparison','review','status','disposal','outcome')):
        tool='compare_grievances'
      elif any(w in q for w in ('audit','access log','disclosure','security event')):
        tool='query_audit'
      elif any(w in q for w in ('clarification','knowledge change','rule impact','policy impact','amendment')):
        tool='assess_policy_impact'
      elif any(w in q for w in ('my pending work','my assigned work','my tasks','my work','pending work','due dates')):
        tool='list_my_work'
      elif any(w in q for w in ('backlog','cohort','registry totals','registry count','unresolved count','pension delays')):
        tool='calculate_backlog'
      elif any(w in q for w in ('investigate','pension case','pension proposal','pensioner','service verification','why has','delay')):
        tool='review_case'
    raw_cases=rows('SELECT id,details FROM pensions ORDER BY id'); cases=[json.loads(x['details']) for x in raw_cases]
    def case_from_query():
      for p in cases:
        if p['id'].lower() in q or (p.get('case_id') and p['case_id'].lower() in q) or p['pensioner_name'].lower() in q:return p
      return None
    def case_docs(case_id):
      return [x for x in rows('SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources WHERE proposal_id=? ORDER BY id',(case_id,)) if can_source(actor,x)]
    def citation_list(ds):
      return [{'id':d['id'],'title':d['title'],'version':d['version'],'anchor':d['anchor'],'location':d['location'],'passage':d['passage']} for d in ds]
    if tool in ('review_case','get_case'):
      p=case_from_query()
      if not p:return {'answer':'Select or provide a pension proposal ID or pensioner name so I can open the scoped case record.','citations':[],'case_id':None,'steps':[{'label':'Resolve case reference','state':'needs input'}]}
      cid=p['id']
      if not allowed(actor,'read',cid):audit(actor,'case.read',cid,'denied');return {'answer':'Access to this training case is outside the current officer scope.','citations':[],'case_id':None,'steps':[{'label':'Scope check','state':'denied'}]}
      discrepancy=(p.get('claimed_service_months') or 0)-(p.get('verified_record_service_months') or 0)
      answer=f"Case {p.get('case_id') or p['id']} is recorded at {p.get('stage','stage not specified').replace('_',' ')} as of {p.get('as_of','date not supplied')}. The record lists {p.get('pensioner_name')} in {p.get('district')}. Claimed service is {p.get('claimed_service_months','not supplied')} months and verified-record service is {p.get('verified_record_service_months','not supplied')} months; the arithmetic difference is {discrepancy} months. The source record says the leave sanction order is {'available' if p.get('leave_sanction_order_available') else 'not available'}. PPO issuance: {p.get('ppo_status','not established')}; payment: {p.get('payment_status','not established')}. The records do not determine legal eligibility or the treatment of the leave period."
      table={'headers':['Case field','Recorded value'],'rows':[['Proposal',p['id']],['Pensioner',p['pensioner_name']],['Stage',p.get('stage','not specified')],['Claimed service (months)',p.get('claimed_service_months','not supplied')],['Verified-record service (months)',p.get('verified_record_service_months','not supplied')],['Difference (months)',discrepancy],['Leave sanction order',p.get('leave_sanction_order_available',False)],['PPO status',p.get('ppo_status','not established')],['Payment status',p.get('payment_status','not established')]]}
      gs=rows('SELECT id,received,status,disposed,atr_date,outcome_verified FROM grievances WHERE proposal_id=? ORDER BY received',(cid,))
      if gs:answer+=' Linked grievance records: '+ '; '.join(f"{g['id']} received {g['received']}, status {g['status']}, outcome verified {bool(g['outcome_verified'])}" for g in gs)+'. Administrative disposal is distinct from substantive resolution.'
      citations=citation_list(case_docs(cid))
    elif tool in ('compare_grievances','compare_grievance_outcome'):
      gs=rows('SELECT * FROM grievances ORDER BY received'); requested=[g for g in gs if g['id'].lower() in q]
      cid=requested[0]['proposal_id'] if requested else (case_from_query() or {}).get('id')
      if not cid:return {'answer':'Select the grievance references or related pension proposal to compare.','citations':[],'case_id':None,'steps':[{'label':'Resolve grievance references','state':'needs input'}]}
      if not allowed(actor,'read',cid):audit(actor,'grievance.compare',cid,'denied');return {'answer':'Access to the linked grievance records is outside the current officer scope.','citations':[],'case_id':None,'steps':[{'label':'Scope check','state':'denied'}]}
      related=[g for g in gs if g['proposal_id']==cid]; selected=requested or related
      if len(selected)<2:selected=related
      if len(selected)<2:return {'answer':'Fewer than two linked grievance records are available for comparison.','citations':[],'case_id':cid,'steps':[{'label':'Retrieve grievance history','state':'complete'}]}
      table={'headers':['Grievance','Received','Recorded state','Administrative disposal','ATR date','Outcome verified'],'rows':[[g['id'],g['received'],g['status'],g['disposed'] or '—',g['atr_date'] or '—','Yes' if g['outcome_verified'] else 'No'] for g in selected]}
      answer='The linked records show '+ '; '.join(f"{g['id']} was received {g['received']} and is {g['status']}"+(f" with administrative disposal recorded {g['disposed']}" if g['disposed'] else '')+f"; outcome verified: {'yes' if g['outcome_verified'] else 'no'}" for g in selected)+'. An action-taken report or administrative disposal does not by itself establish pension settlement. The current status and supporting evidence should be reviewed before any reopening recommendation; no grievance status is changed by this tool.'
      citations=citation_list(case_docs(cid))
    elif tool in ('calculate_backlog','cohort_analysis'):
      if role_for(actor) not in ('leadership','supervisor','audit_officer'):
        audit(actor,'registry.aggregate','pension-registry','denied');return {'answer':'The registry-wide cohort view is outside the current officer scope. Request an authorised aggregate report from a supervisor.','citations':[],'case_id':None,'steps':[{'label':'Scope check','state':'denied'}]}
      un=[p for p in cases if p['unresolved']]; issues={}
      for p in un:issues[p['issue']]=issues.get(p['issue'],0)+1
      ho=sum(p['stage']=='head_of_office' for p in un); late=[p for p in un if p['issue']=='service_verification' and p.get('late_objection')]; visible=sum(bool(p.get('visible_before_retirement')) for p in late)
      table={'headers':['Measure','Count'],'rows':[['Registry records',len(cases)],['Unresolved',len(un)],['Head of Office among unresolved',ho],['Service verification',issues.get('service_verification',0)],['Missing documents',issues.get('missing_documents',0)],['Clarification',issues.get('clarification',0)],['Other',issues.get('other',0)],['Late service objections',len(late)],['Visible before retirement',visible]]}
      answer=f"Calculated from the current training registry as of 24 November 2026: {len(cases)} records; {len(un)} unresolved; {ho} unresolved at Head of Office. Issue counts are service verification {issues.get('service_verification',0)}, missing documents {issues.get('missing_documents',0)}, clarification {issues.get('clarification',0)} and other {issues.get('other',0)}. {len(late)} service-verification objections were raised after retirement, and {visible} of those were visible before retirement. These are record counts and a descriptive observation, not legal eligibility findings."
      citations=citation_list([x for x in rows("SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources WHERE id='DOC-013'") if can_source(actor,x)])
    elif tool in ('query_audit','audit_review'):
      if not allowed(actor,'audit'):
        audit(actor,'audit.query','PEN-NGN-2026-041','denied');return {'answer':'Audit records are restricted to authorised audit reviewers and supervisors.','citations':[],'case_id':None,'steps':[{'label':'Audit scope check','state':'denied'}]}
      events=rows("SELECT * FROM audit WHERE proposal_id='PEN-NGN-2026-041' AND timestamp >= '2026-08-01' ORDER BY timestamp"); denied=[x for x in events if x['decision'] in ('denied','blocked')]; actors={x['actor_id'] for x in events if x['decision']=='allowed'}; leaked=sum(x['external_disclosure_confirmed'] for x in events)
      table={'headers':['Measure','Count'],'rows':[['Events since 1 Aug 2026',len(events)],['Distinct authorised actors in allowed events',len(actors)],['Denied or blocked',len(denied)],['Confirmed external disclosures',leaked]]}
      highlighted=[x for x in events if x['decision'] in ('denied','blocked')]
      people={x['id']:x for x in rows('SELECT id,name,designation FROM people')}
      actor_names=', '.join(sorted(people[x]['name'] for x in actors if x in people))
      event_text='; '.join(f"{x['timestamp']} · {people.get(x['actor_id'],{}).get('name',x['actor_id'])} · {x['action']} · {x['decision']}" for x in highlighted)
      answer=f"The reviewed training logs contain {len(events)} events involving {len(actors)} authorised actors, {len(denied)} denied or blocked operations, and {leaked} confirmed successful external disclosures. Actors with allowed events: {actor_names}. Events requiring context review: {event_text}. A denied or blocked event does not establish intent and the log does not exclude activity outside the reviewed records."
      citations=citation_list([x for x in rows("SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources WHERE id IN ('DOC-015','DOC-016')") if can_source(actor,x)])
    elif tool=='list_my_work':
      tasks=rows('SELECT id,title,case_id,due_date,status,priority FROM tasks WHERE assignee_id=? ORDER BY due_date',(actor,))
      table={'headers':['Task','Related case','Due date','Status'],'rows':[[t['title'],t['case_id'] or 'Workspace',t['due_date'] or 'Not set',t['status']] for t in tasks]}
      answer=f'You have {len(tasks)} assigned task(s) in the current workspace scope.' if tasks else 'No tasks are currently assigned to your workspace profile. This result only reflects saved local task records.'
      audit(actor,'work.list','actor:'+actor,'completed',f'{len(tasks)} assigned task(s)')
    elif tool in ('assess_policy_impact','knowledge_review'):
      ks=rows("SELECT * FROM knowledge WHERE id='KB-CHANGE-2026-0037'"); change=json.loads(ks[0]['data']) if ks else {}
      if actor not in (change.get('requester_id'),change.get('reviewer_id')) and role_for(actor) not in ('leadership','supervisor','audit_officer'):
        audit(actor,'knowledge.review','KB-CHANGE-2026-0037','denied');return {'answer':'This knowledge change is outside the current officer scope.','citations':[],'case_id':None,'steps':[{'label':'Knowledge scope check','state':'denied'}]}
      flags=[('Issuing authority',change.get('authority_verified',False)),('Signature',change.get('signature_verified',False)),('Effective date',change.get('effective_date_verified',False)),('Rule compatibility',change.get('rule_compatibility_verified',False)),('Publication approval',change.get('publication_approved',False))]
      table={'headers':['Review control','Status'],'rows':[['Potential case matches',len(change.get('potential_case_ids',[]))],['Manual review cases',len(change.get('manual_review_case_ids',[]))]]+[[label,'Verified' if ok else 'Not verified'] for label,ok in flags]}
      answer=f"Knowledge change {change.get('id')} references source {change.get('source_id')}. The training clarification remains unverified: authority, signature, effective date, rule compatibility and publication approval have not all been established. The supplied impact list contains {len(change.get('potential_case_ids',[]))} potential matches and {len(change.get('manual_review_case_ids',[]))} manual-review case. No existing pension calculation or historical decision is changed by this assessment. Publication remains blocked until verification and authorised approval."
      citations=citation_list([x for x in rows("SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources WHERE id IN ('DOC-017','DOC-018')") if can_source(actor,x)])
    else:
      terms=[w for w in re.findall(r'[\w-]{3,}',q) if w not in {'what','how','why','show','find','case','please','the','and','for','with','from','about','current'}]
      hits=[]
      for p in cases:
        if allowed(actor,'read',p['id']):
          hay=json.dumps(p,ensure_ascii=False).lower(); score=sum(w in hay for w in terms)
          if score:hits.append((score,p))
      hits.sort(key=lambda x:(-x[0],x[1]['id'])); hits=hits[:25]
      snippets=[]
      for score,p in hits[:8]:
        cid=p['id'];snippets.append(f"{p['pensioner_name']} · {cid} · {p['district']} · {p['stage'].replace('_',' ')} · {p['issue'].replace('_',' ')}")
        citations.extend(citation_list(case_docs(cid)))
      if not citations:citations=citation_list([d for d in sources_for(query) if can_source(actor,d)])
      citations=list({x['id']:x for x in citations}.values())
      answer=f"Search found {len(hits)} matching pension case record(s) within your training scope. Retrieved records:\n"+'\n'.join(snippets) if snippets else 'No matching record was found within the current officer scope. Try a proposal ID, grievance ID or a more specific name.'
      cid=hits[0][1]['id'] if len(hits)==1 else None
      table=None
    audit(actor,'tool.execute',cid or 'workspace','completed',tool+': '+query[:120])
    return {'answer':answer,'citations':citations,'case_id':cid,'table':table,'steps':[{'label':'Retrieve scoped records','state':'complete'}]+([{'label':'Calculate from local records','state':'complete'}] if table else [{'label':'Resolve source passages','state':'complete'}])}

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
  for cell in ws[1]:cell.font=__import__('openpyxl').styles.Font(bold=True,color='FFFFFF');cell.fill=__import__('openpyxl').styles.PatternFill('solid',fgColor='2457A6')
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
      docs=[d for d in rows('SELECT id,title,version,anchor,location,passage,sha256,proposal_id,classification FROM sources ORDER BY id') if can_source(actor,d)]
      grvs=[dict(x,**json.loads(x['data'])) for x in rows('SELECT * FROM grievances') if x['proposal_id'] in visible_ids]
      tasks=[t for t in rows('SELECT * FROM tasks ORDER BY created_at DESC') if t['assignee_id']==actor or not t['case_id'] or t['case_id'] in visible_ids]
      documents=[d for d in rows('SELECT id,title,kind,case_id,version,status,created_by,created_at FROM documents ORDER BY created_at DESC') if not d['case_id'] or d['case_id'] in visible_ids]
      doc_ids={d['id'] for d in documents};case_changes=[x for x in rows('SELECT * FROM case_proposals ORDER BY created_at DESC') if x['case_id'] in visible_ids and (actor in (x['requester_id'],x['reviewer_id']) or role_for(actor) in ('leadership','supervisor','audit_officer'))]; proposal_ids={x['id'] for x in case_changes}; approvals=[a for a in rows('SELECT * FROM approvals ORDER BY created_at DESC') if a['target_id'] in doc_ids or a['target_id'] in proposal_ids]
      approval_events=[e for e in rows('SELECT * FROM approval_events ORDER BY created_at DESC') if e['approval_id'] in {a['id'] for a in approvals}]
      knows=[]
      for k in rows('SELECT * FROM knowledge'):
        item=json.loads(k['data'])
        if actor in (item.get('requester_id'),item.get('reviewer_id')) or role_for(actor) in ('leadership','supervisor','audit_officer'):
          item['potential_case_ids']=[x for x in item.get('potential_case_ids',[]) if x in visible_ids]
          item['manual_review_case_ids']=[x for x in item.get('manual_review_case_ids',[]) if x in visible_ids]
          k['data']=json.dumps(item);knows.append(k)
      self.json(200,{'pensions':[json.loads(p['details']) for p in ps],'sources':docs,'people':rows('SELECT * FROM people ORDER BY name'),'offices':rows('SELECT * FROM offices ORDER BY name'),'grievances':grvs,'tasks':tasks,'documents':documents,'approvals':approvals,'approval_events':approval_events,'case_proposals':case_changes,'connections':rows('SELECT * FROM connections'),'knowledge':knows,'stats':{'pensions':len(ps),'unresolved':sum(json.loads(p['details'])['unresolved'] for p in ps),'source_documents':len(docs)}});return
    if path=='/api/conversations':
      conv=rows('SELECT id,title,created_at,updated_at FROM conversations WHERE owner_id=? ORDER BY updated_at DESC LIMIT 50',(actor,)); self.json(200,{'items':conv});return
    if path.startswith('/api/conversations/'):
      cid=path.rsplit('/',1)[1]; conv=rows('SELECT * FROM conversations WHERE id=? AND owner_id=?',(cid,actor))
      if not conv:self.json(404,{'error':'Conversation not found'});return
      self.json(200,{'conversation':conv[0],'messages':rows('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at',(cid,))});return
    if path.startswith('/api/source/'):
      sid=path.rsplit('/',1)[1]; s=rows('SELECT * FROM sources WHERE id=?',(sid,));
      if not s:self.json(404,{'error':'Source not found'});return
      if not can_source(actor,s[0]):audit(actor,'source.open',sid,'denied');self.json(403,{'error':'Access denied'});return
      audit(actor,'source.open',sid);self.json(200,s[0]);return
    if path.startswith('/api/document/') and path.endswith('/versions'):
      did=path.split('/')[-2];d=rows('SELECT * FROM documents WHERE id=?',(did,))
      if not d or (d[0]['case_id'] and not allowed(actor,'read',d[0]['case_id'])):self.json(404,{'error':'Document not found'});return
      self.json(200,{'document':{k:d[0][k] for k in ('id','title','kind','case_id','version','status','created_by','created_at')},'versions':rows('SELECT version,content,created_at,created_by FROM document_versions WHERE document_id=? ORDER BY version DESC',(did,))});return
    if path.startswith('/api/document/') and path.count('/')==3:
      did=path.rsplit('/',1)[1];d=rows('SELECT * FROM documents WHERE id=?',(did,))
      if not d or (d[0]['case_id'] and not allowed(actor,'read',d[0]['case_id'])):self.json(404,{'error':'Document not found'});return
      self.json(200,d[0]);return
    if path.startswith('/api/case-proposal/') and path.endswith('/versions'):
      pid=path.split('/')[-2]; proposal=rows('SELECT * FROM case_proposals WHERE id=?',(pid,))
      if not proposal or not allowed(actor,'read',proposal[0]['case_id']):self.json(404,{'error':'Proposal not found'});return
      self.json(200,{'items':rows('SELECT * FROM case_proposal_versions WHERE proposal_id=? ORDER BY version DESC',(pid,))});return
    if path.startswith('/api/task/') and path.endswith('/history'):
      tid=path.split('/')[-2];t=rows('SELECT * FROM tasks WHERE id=?',(tid,))
      if not t or (t[0]['case_id'] and not allowed(actor,'read',t[0]['case_id'])):self.json(404,{'error':'Task not found'});return
      self.json(200,{'items':rows('SELECT * FROM task_events WHERE task_id=? ORDER BY created_at',(tid,))});return
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
    if rel not in {'index.html','style.css','app.js','assets/brand/lotus.png'}:self.send(404,'Not found','text/plain');return
    f=(ROOT/rel).resolve()
    self.send(200,f.read_bytes(),mimetypes.guess_type(f.name)[0] or 'application/octet-stream')
  def do_POST(self):
    actor=actor_for(self); path=urlparse(self.path).path
    if not actor:self.json(401,{'error':'A local training session is required.'});return
    try:b=self.body()
    except Exception as e:self.json(400,{'error':str(e)});return
    if path=='/api/ask':
      tool=str(b.get('tool','search_records'))
      if tool not in {'search_records','review_case','get_case','compare_grievances','compare_grievance_outcome','calculate_backlog','cohort_analysis','query_audit','audit_review','assess_policy_impact','knowledge_review','list_my_work'}:self.json(400,{'error':'Unsupported workspace operation'});return
      self.json(200,tool_answer(str(b.get('query',''))[:1000],actor,tool));return
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
      assignee=str(b.get('assignee_id',actor)); due=str(b.get('due_date',''))
      ap=rows('SELECT * FROM people WHERE id=?',(assignee,))
      if not ap:self.json(400,{'error':'Select a valid officer'});return
      if due:
        try:datetime.strptime(due,'%Y-%m-%d')
        except ValueError:self.json(400,{'error':'Due date must use YYYY-MM-DD'});return
      cp=case_record(cid) if cid else None
      if cp and assignee!=cp.get('owner_id') and ap[0]['office_id']!=cp.get('office_id') and role_for(assignee) not in ('leadership','supervisor'):
        self.json(403,{'error':'Assignee is outside the case office and owner scope'});return
      tid='TSK-'+secrets.token_hex(5).upper(); c=db();c.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',(tid,str(b.get('title','Verification follow-up'))[:180],cid,assignee,due, 'prepared',str(b.get('priority','normal')),'[]',now(),now()));c.execute('INSERT INTO task_events VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),tid,actor,'prepared','Task created and assigned.',now()));c.commit();c.close();audit(actor,'task.create',tid,'prepared',cid);self.json(201,{'id':tid,'status':'prepared'});return
    if path=='/api/document':
      cid=str(b.get('case_id',''))
      if cid and not allowed(actor,'write',cid):audit(actor,'document.create',cid,'denied');self.json(403,{'error':'Draft creation is outside the current officer scope'});return
      did='DRF-'+secrets.token_hex(5).upper();title=str(b.get('title','Case review note'))[:180];content=str(b.get('content',''))[:50000]+'\n\nTRAINING DATA — NOT AN OFFICIAL GOVERNMENT DOCUMENT'; c=db();c.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?,?,?,?)',(did,title,str(b.get('kind','draft')),cid,content,1,'draft',actor,now(),'training'));c.execute('INSERT INTO document_versions VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),did,1,content,now(),actor));c.commit();c.close();audit(actor,'document.create',did,'prepared',cid);self.json(201,{'id':did,'version':1,'status':'draft'});return
    if path=='/api/approval':
      target=str(b.get('target_id','')); version=int(b.get('version',0)); d=rows('SELECT * FROM documents WHERE id=?',(target,)); change=rows('SELECT * FROM case_proposals WHERE id=?',(target,))
      if d:
        if version!=d[0]['version']:self.json(409,{'error':'The approval must reference the current saved draft version'});return
        case_id=d[0]['case_id']; reviewer=str(b.get('reviewer_id','P09'))
      elif change:
        if version!=change[0]['version'] or change[0]['state']!='prepared':self.json(409,{'error':'The proposal must be prepared at its current version before submission'});return
        case_id=change[0]['case_id'];reviewer=change[0]['reviewer_id']
      else:self.json(404,{'error':'No matching draft or proposed change'});return
      if not allowed(actor,'write',case_id):self.json(403,{'error':'Not authorised to submit this item'});return
      aid='APR-'+secrets.token_hex(5).upper();c=db();c.execute('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?)',(aid,target,version,reviewer,'submitted','',now(),None,actor));c.execute('UPDATE documents SET status=? WHERE id=?',('submitted',target));c.execute('UPDATE case_proposals SET state=?,updated_at=? WHERE id=?',('submitted',now(),target));c.execute('INSERT INTO approval_events VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),aid,actor,'submitted','',version,now()));c.commit();c.close();audit(actor,'approval.submit',aid,'awaiting review',target);self.json(201,{'id':aid,'state':'submitted','version':version});return
    if path.startswith('/api/case-proposal/') and path.endswith('/revise'):
      pid=path.split('/')[-2];c=db();p=c.execute('SELECT * FROM case_proposals WHERE id=?',(pid,)).fetchone()
      if not p:c.close();self.json(404,{'error':'Proposed change not found'});return
      if actor!=p['requester_id'] or p['state'] not in ('returned','rejected'):c.close();self.json(403,{'error':'Only the requester may revise a returned or rejected proposal'});return
      if not allowed(actor,'write',p['case_id']):c.close();self.json(403,{'error':'Case is outside your scope'});return
      value=str(b.get('proposed_value',p['proposed_value']))[:100];v=p['version']+1;c.execute('INSERT INTO case_proposal_versions VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),pid,v,value,'prepared',now(),actor));c.execute('UPDATE case_proposals SET proposed_value=?,version=?,state=?,updated_at=? WHERE id=?',(value,v,'prepared',now(),pid));c.commit();c.close();audit(actor,'case_change.revise',pid,'prepared',f'version {v}');self.json(200,{'id':pid,'version':v,'state':'prepared'});return
    if path.startswith('/api/case-proposal/') and path.endswith('/execute'):
      pid=path.split('/')[-2];c=db();p=c.execute('SELECT * FROM case_proposals WHERE id=?',(pid,)).fetchone()
      if not p:c.close();self.json(404,{'error':'Proposed change not found'});return
      if p['state']!='approved':c.close();self.json(409,{'error':'Only an approved current proposal can be executed'});return
      if actor in (p['requester_id'],p['reviewer_id']) or role_for(actor) not in ('leadership','supervisor','head_of_office'):c.close();audit(actor,'case_change.execute',pid,'denied','separate execution authority required');self.json(403,{'error':'Execution requires a separate authorised officer'});return
      if not allowed(actor,'write',p['case_id']):c.close();self.json(403,{'error':'Case is outside your execution scope'});return
      old=c.execute('SELECT details FROM pensions WHERE id=?',(p['case_id'],)).fetchone()
      if not old:c.close();self.json(404,{'error':'Case not found'});return
      current=json.loads(old['details']);vrow=c.execute('SELECT COALESCE(MAX(version),0)+1 AS v FROM case_versions WHERE case_id=?',(p['case_id'],)).fetchone();c.execute('INSERT INTO case_versions VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),p['case_id'],vrow['v'],old['details'],now(),actor));current[p['field']]=p['proposed_value'];c.execute('UPDATE pensions SET details=?,modified_at=? WHERE id=?',(json.dumps(current,ensure_ascii=False),now(),p['case_id']));c.execute('UPDATE case_proposals SET state=?,updated_at=? WHERE id=?',('executed',now(),pid));c.commit();c.close();audit(actor,'case_change.execute',pid,'executed',p['case_id']);self.json(200,{'id':pid,'state':'executed','case_id':p['case_id']});return
    if path.startswith('/api/approval/'):
      aid=path.rsplit('/',1)[1]; state=str(b.get('decision','')); reason=str(b.get('reason',''))[:1000]
      if not allowed(actor,'approve'):audit(actor,'approval.decide',aid,'denied');self.json(403,{'error':'This training persona cannot approve'});return
      if state not in ('approved','returned','rejected'):self.json(400,{'error':'Decision must be approved, returned or rejected'});return
      c=db();a=c.execute('SELECT * FROM approvals WHERE id=?',(aid,)).fetchone()
      if not a or a['state']!='submitted':c.close();self.json(409,{'error':'Approval is no longer pending'});return
      cp=c.execute('SELECT version FROM case_proposals WHERE id=?',(a['target_id'],)).fetchone()
      if cp and cp['version']!=a['target_version']:c.close();self.json(409,{'error':'This approval refers to a stale proposal version'});return
      if a['reviewer_id']!=actor:c.close();audit(actor,'approval.decide',aid,'denied','reviewer mismatch');self.json(403,{'error':'Only the assigned reviewer may decide this request'});return
      if a['created_by']==actor:c.close();audit(actor,'approval.decide',aid,'denied','separation of duties');self.json(403,{'error':'The submitter cannot decide their own request'});return
      c.execute('UPDATE approvals SET state=?,reason=?,decided_at=? WHERE id=?',(state,reason,now(),aid));c.execute('UPDATE documents SET status=? WHERE id=? AND version=?',(state,a['target_id'],a['target_version']));c.execute('UPDATE case_proposals SET state=?,updated_at=? WHERE id=? AND version=?',(state,now(),a['target_id'],a['target_version']));c.execute('INSERT INTO approval_events VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(12),aid,actor,state,reason,a['target_version'],now()));c.commit();c.close();audit(actor,'approval.decide',aid,state,a['target_id']);self.json(200,{'id':aid,'state':state,'version':a['target_version']});return
    if path=='/api/connection/request':
      app=str(b.get('app',''))[:100];cid='CON-'+hashlib.sha256(app.encode()).hexdigest()[:12];c=db();c.execute('INSERT OR REPLACE INTO connections VALUES(?,?,?,?)',(cid,'requested',str(b.get('purpose',''))[:500],now()));c.commit();c.close();audit(actor,'connection.request',cid,'requested',app);self.json(201,{'id':cid,'status':'requested','live':False});return
    self.json(404,{'error':'No such operation'})
  def do_PATCH(self):
    actor=actor_for(self);path=urlparse(self.path).path
    if not actor:self.json(401,{'error':'A local training session is required.'});return
    try:b=self.body()
    except Exception as e:self.json(400,{'error':str(e)});return
    if path.startswith('/api/task/') and path.count('/')==3:
      tid=path.rsplit('/',1)[1];c=db();t=c.execute('SELECT * FROM tasks WHERE id=?',(tid,)).fetchone()
      if not t:c.close();self.json(404,{'error':'Task not found'});return
      if (t['case_id'] and not allowed(actor,'write',t['case_id'])) or (actor!=t['assignee_id'] and role_for(actor) not in ('leadership','supervisor','head_of_office')):
        c.close();audit(actor,'task.update',tid,'denied');self.json(403,{'error':'Only the assignee or an authorised supervisor can update this task'});return
      status=str(b.get('status',t['status']))
      if status not in ('prepared','in_progress','completed','submitted_for_review','returned'):
        c.close();self.json(400,{'error':'Unsupported task status'});return
      title=str(b.get('title',t['title']))[:180];due=str(b.get('due_date',t['due_date']))
      if due:
        try:datetime.strptime(due,'%Y-%m-%d')
        except ValueError:c.close();self.json(400,{'error':'Due date must use YYYY-MM-DD'});return
      c.execute('UPDATE tasks SET title=?,due_date=?,status=?,updated_at=? WHERE id=?',(title,due,status,now(),tid));c.execute('INSERT INTO task_events VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),tid,actor,'status_changed',f'{t["status"]} -> {status}',now()));c.commit();c.close();audit(actor,'task.update',tid,status);self.json(200,{'id':tid,'status':status});return
    if path.startswith('/api/case/'):
      cid=path.rsplit('/',1)[1]
      audit(actor,'case.update',cid,'blocked','direct case mutation is disabled; use a versioned proposal and approval');self.json(409,{'error':'Direct case updates are blocked. Submit a versioned change proposal, obtain approval, then execute it separately.'});return
    if path.startswith('/api/document/'):
      did=path.rsplit('/',1)[1];docs=rows('SELECT * FROM documents WHERE id=?',(did,));
      if not docs:self.json(404,{'error':'Draft not found'});return
      old=docs[0]
      if int(b.get('base_version',-1))!=old['version']:self.json(409,{'error':'Stale document version'});return
      if not allowed(actor,'write',old['case_id']):self.json(403,{'error':'Not authorised'});return
      v=old['version']+1;content=str(b.get('content',''))[:50000]
      if 'TRAINING DATA' not in content:content+='\n\nTRAINING DATA — NOT AN OFFICIAL GOVERNMENT DOCUMENT'
      c=db()
      c.execute('UPDATE documents SET content=?,version=?,status=? WHERE id=?',(content,v,'draft',did));c.execute('INSERT INTO document_versions VALUES(?,?,?,?,?,?)',(secrets.token_hex(12),did,v,content,now(),actor));c.commit();c.close();audit(actor,'document.revise',did,'draft',f'version {v}');self.json(200,{'id':did,'version':v,'status':'draft'});return
    self.json(404,{'error':'No such operation'})

if __name__=='__main__':
  init_db();print(f'Singularity local training workspace at http://127.0.0.1:{PORT}');ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
