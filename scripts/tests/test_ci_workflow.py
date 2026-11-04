import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / '.github' / 'workflows' / 'ci.yml'


def load():
    return yaml.safe_load(WORKFLOW.read_text(encoding='utf-8'))


def run_lines(job):
    return '\n'.join(step.get('run', '') for step in job['steps'])


class CiWorkflow(unittest.TestCase):
    def setUp(self):
        self.wf = load()
        # PyYAML reads the key `on` as the boolean True.
        self.triggers = self.wf.get('on', self.wf.get(True))

    def test_runs_on_pull_requests_and_on_pushes_to_master(self):
        self.assertIn('pull_request', self.triggers)
        self.assertEqual(self.triggers['push']['branches'], ['master'])

    def test_has_a_backend_and_a_frontend_job(self):
        self.assertEqual(set(self.wf['jobs']), {'backend', 'frontend'})

    def test_backend_tests_run_on_a_postgres_service(self):
        job = self.wf['jobs']['backend']
        self.assertIn('postgres', job['services'])
        self.assertIn('DATABASE_URL', job['env'])

    def test_backend_runs_every_check(self):
        text = run_lines(self.wf['jobs']['backend'])
        for needle in ('ruff check', 'pip-audit', 'check --deploy', 'pytest'):
            self.assertIn(needle, text)

    def test_backend_coverage_gate_is_80_percent(self):
        self.assertIn('--cov-fail-under=80', run_lines(self.wf['jobs']['backend']))

    def test_frontend_runs_every_check(self):
        text = run_lines(self.wf['jobs']['frontend'])
        for needle in ('npm ci', 'npm run lint', 'tsc --noEmit', 'npm run test', 'npm run build', 'npm audit'):
            self.assertIn(needle, text)

    def test_frontend_audit_covers_production_packages_at_moderate_or_above(self):
        text = run_lines(self.wf['jobs']['frontend'])
        self.assertIn('--omit=dev', text)
        self.assertIn('--audit-level=moderate', text)

    def test_actions_are_pinned_to_a_version(self):
        for job in self.wf['jobs'].values():
            for step in job['steps']:
                if 'uses' in step:
                    self.assertRegex(step['uses'], r'@v\d+$')

    def test_jobs_cannot_write_to_the_repository(self):
        self.assertEqual(self.wf['permissions'], {'contents': 'read'})

    def test_a_newer_push_cancels_the_run_before_it(self):
        self.assertTrue(self.wf['concurrency']['cancel-in-progress'])
