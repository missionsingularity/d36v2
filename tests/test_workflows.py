import io
import json
import hashlib
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import server


class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.DB = Path(cls.temp.name) / 'test.sqlite3'
        server.init_db()
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.httpd.server_port}'
        cls.cookies = urllib.request.HTTPCookieProcessor()
        cls.client = urllib.request.build_opener(cls.cookies)
        cls.request(cls, 'GET', '/api/session')

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.thread.join(timeout=2)
        cls.httpd.server_close()
        cls.temp.cleanup()

    def request(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'Content-Type': 'application/json'} if data else {})
        try:
            with self.client.open(req, timeout=5) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()

    def json_request(self, method, path, body=None):
        code, _, data = self.request(method, path, body)
        return code, json.loads(data) if data else None

    def test_seed_counts_hashes_and_cohort_calculation(self):
        self.assertEqual(len(server.rows('SELECT * FROM pensions')), 186)
        self.assertEqual(len(server.rows('SELECT * FROM sources')), 18)
        expected = {x['id']:x['sha256'] for x in server.fixture('source_manifest.json')}
        actual = {x['id']:hashlib.sha256((server.PKG/x['path']).read_bytes()).hexdigest() for x in server.fixture('source_manifest.json')}
        self.assertEqual(actual, expected)
        answer = server.tool_answer('Unresolved pension registry', 'P02', 'calculate_backlog')
        self.assertIn('186 records', answer['answer'])
        self.assertIn('41 unresolved', answer['answer'])
        values = {r[0]: r[1] for r in answer['table']['rows']}
        self.assertEqual(values['Head of Office among unresolved'], 23)
        self.assertEqual(values['Service verification'], 16)
        self.assertEqual(values['Missing documents'], 10)
        self.assertEqual(values['Clarification'], 8)
        self.assertEqual(values['Other'], 7)
        self.assertEqual(values['Late service objections'], 11)
        self.assertEqual(values['Visible before retirement'], 7)

    def test_case_evidence_and_role_denial(self):
        answer = server.tool_answer('PEN-NGN-2026-041 Pranab Kumar Deka', 'P06', 'review_case')
        self.assertIn('388 months', answer['answer'])
        self.assertIn('382 months', answer['answer'])
        self.assertIn('not available', answer['answer'])
        self.assertTrue(any(x['id'] == 'DOC-002' and x['location'] == 'Original logical page 18' for x in answer['citations']))
        denied = server.tool_answer('PEN-NGN-2026-041', 'P08', 'review_case')
        self.assertEqual(denied['steps'][0]['state'], 'denied')

    def test_http_scope_and_conversation_persistence(self):
        code, boot = self.json_request('GET', '/api/bootstrap')
        self.assertEqual(code, 200)
        self.assertEqual({x['id'] for x in boot['pensions']}, {'PEN-NGN-2026-041', 'PEN-NGN-2026-058'})
        code, c = self.json_request('POST', '/api/conversations', {'title': 'Persistence check'})
        self.assertEqual(code, 201)
        self.assertEqual(self.json_request('POST', f"/api/conversations/{c['id']}/messages", {'role':'user','body':'case status'})[0], 201)
        saved = self.json_request('GET', f"/api/conversations/{c['id']}")[1]
        self.assertEqual(saved['messages'][0]['body'], 'case status')
        self.json_request('POST', '/api/actor', {'person_id':'P08'})
        restricted = self.json_request('GET', '/api/bootstrap')[1]
        self.assertEqual(restricted['pensions'], [])
        code, _ = self.json_request('GET', '/api/source/DOC-001')
        self.assertEqual(code, 403)
        self.json_request('POST', '/api/actor', {'person_id':'P06'})

    def test_grievance_and_audit_tools(self):
        g = server.tool_answer('GRV-AS-2026-01192 GRV-AS-2026-01874', 'P06', 'compare_grievances')
        self.assertIn('administrative disposal', g['answer'])
        self.assertIn('outcome verified: no', g['answer'])
        denied = server.tool_answer('PEN-NGN-2026-041 access history', 'P06', 'query_audit')
        self.assertEqual(denied['steps'][0]['state'], 'denied')
        a = server.tool_answer('PEN-NGN-2026-041', 'P12', 'query_audit')
        self.assertIn('47 events', a['answer'])
        self.assertIn('6 authorised actors', a['answer'])
        self.assertIn('2 denied or blocked', a['answer'])
        self.assertIn('0 confirmed successful external disclosures', a['answer'])

    def test_case_change_return_revise_approve_execute(self):
        pid = 'AUD-2026-11-24-00428'
        self.json_request('POST', '/api/actor', {'person_id':'P09'})
        code, result = self.json_request('POST', '/api/approval/APR-' + pid, {'decision':'returned','reason':'Please verify the source reference.'})
        self.assertEqual(code, 200)
        self.json_request('POST', '/api/actor', {'person_id':'P06'})
        code, revised = self.json_request('POST', f'/api/case-proposal/{pid}/revise', {'proposed_value':'completed'})
        self.assertEqual(code, 200)
        self.assertEqual(revised['version'], 2)
        code, approval = self.json_request('POST', '/api/approval', {'target_id':pid,'version':2})
        self.assertEqual(code, 201)
        self.json_request('POST', '/api/actor', {'person_id':'P09'})
        self.assertEqual(self.json_request('POST', f"/api/approval/{approval['id']}", {'decision':'approved','reason':'Evidence reviewed.'})[0], 200)
        self.json_request('POST', '/api/actor', {'person_id':'P02'})
        self.assertEqual(self.json_request('POST', f'/api/case-proposal/{pid}/execute', {})[0], 200)
        self.json_request('POST', '/api/actor', {'person_id':'P06'})
        case = server.case_record('PEN-NGN-2026-058')
        self.assertEqual(case['service_verification_status'], 'completed')
        self.assertEqual(len(server.rows('SELECT * FROM case_versions WHERE case_id=?', ('PEN-NGN-2026-058',))), 1)
        self.assertEqual(len(server.rows('SELECT * FROM case_proposal_versions WHERE proposal_id=?', (pid,))), 2)

    def test_task_updates_and_local_connection_request(self):
        self.json_request('POST', '/api/actor', {'person_id':'P06'})
        code, task = self.json_request('POST', '/api/task', {'title':'Verify service entry','case_id':'PEN-NGN-2026-041','assignee_id':'P09','due_date':'2026-12-01'})
        self.assertEqual(code, 201)
        self.json_request('POST', '/api/actor', {'person_id':'P09'})
        code, changed = self.json_request('PATCH', f"/api/task/{task['id']}", {'status':'in_progress'})
        self.assertEqual(code, 200)
        self.assertEqual(changed['status'], 'in_progress')
        history = self.json_request('GET', f"/api/task/{task['id']}/history")[1]['items']
        self.assertEqual(len(history), 2)
        code, connection = self.json_request('POST', '/api/connection/request', {'app':'Kritagyata','purpose':'Training connector test'})
        self.assertEqual(code, 201)
        self.assertFalse(connection['live'])
        self.assertEqual(connection['status'], 'requested')

    def test_native_document_exports(self):
        code, doc = self.json_request('POST', '/api/document', {'title':'Test export pack','case_id':'PEN-NGN-2026-041','content':'Citations: DOC-001, Original logical page 3.'})
        self.assertEqual(code, 201)
        code, approval = self.json_request('POST', '/api/approval', {'target_id':doc['id'],'version':1,'reviewer_id':'P09'})
        self.assertEqual(code, 201)
        self.json_request('POST', '/api/actor', {'person_id':'P09'})
        code, decision = self.json_request('POST', f"/api/approval/{approval['id']}", {'decision':'approved','reason':'Training export review.'})
        self.assertEqual(code, 200)
        self.assertEqual(decision['state'], 'approved')
        self.json_request('POST', '/api/actor', {'person_id':'P06'})
        code, revision = self.json_request('PATCH', f"/api/document/{doc['id']}", {'base_version':1,'content':'Revised content with citation DOC-001.'})
        self.assertEqual(code, 200)
        self.assertEqual(revision['version'], 2)
        self.assertEqual(self.json_request('POST', '/api/approval', {'target_id':doc['id'],'version':1,'reviewer_id':'P09'})[0], 409)
        code, second_approval = self.json_request('POST', '/api/approval', {'target_id':doc['id'],'version':2,'reviewer_id':'P09'})
        self.assertEqual(code, 201)
        self.json_request('POST', '/api/actor', {'person_id':'P09'})
        self.assertEqual(self.json_request('POST', f"/api/approval/{second_approval['id']}", {'decision':'approved','reason':'Revised version reviewed.'})[0], 200)
        self.json_request('POST', '/api/actor', {'person_id':'P06'})
        checks = {
            'docx': lambda b: __import__('docx').Document(io.BytesIO(b)),
            'xlsx': lambda b: __import__('openpyxl').load_workbook(io.BytesIO(b)),
            'pptx': lambda b: __import__('pptx').Presentation(io.BytesIO(b)),
        }
        for fmt, opener in checks.items():
            code, _, blob = self.request('GET', f"/api/download/{doc['id']}?format={fmt}")
            self.assertEqual(code, 200)
            self.assertTrue(zipfile.is_zipfile(io.BytesIO(blob)))
            self.assertIsNotNone(opener(blob))
        code, _, pdf = self.request('GET', f"/api/download/{doc['id']}?format=pdf")
        self.assertEqual(code, 200)
        self.assertTrue(pdf.startswith(b'%PDF-'))


if __name__ == '__main__':
    unittest.main()
