import unittest

from scripts import check_content as cc

EM = "—"
EN = "–"


class LineChecks(unittest.TestCase):
    def test_clean_line_passes(self):
        self.assertEqual(cc.check_line("Track every batch from egg to cocoon."), [])

    def test_em_dash_is_flagged(self):
        self.assertTrue(cc.check_line(f"Silk {EM} made simple"))

    def test_en_dash_is_flagged(self):
        self.assertTrue(cc.check_line(f"22{EN}28 degrees"))

    def test_plain_hyphen_is_fine(self):
        self.assertEqual(cc.check_line("Log in - or create an account"), [])

    def test_marketing_filler_is_flagged_any_case(self):
        self.assertTrue(cc.check_line("A Seamless way to farm"))
        self.assertTrue(cc.check_line("We empower farmers"))
        self.assertTrue(cc.check_line("Leverage your data"))

    def test_authorship_hints_are_flagged(self):
        self.assertTrue(cc.check_line("Written by Claude"))
        self.assertTrue(cc.check_line("As an AI model, I think"))
        self.assertTrue(cc.check_line("Generated with a tool"))

    def test_words_that_only_contain_a_banned_word_pass(self):
        self.assertEqual(cc.check_line("Claudette runs the cooperative."), [])

    def test_product_ai_wording_is_allowed(self):
        self.assertEqual(cc.check_line("Spot disease from one photo with AI."), [])


class CommitMessageChecks(unittest.TestCase):
    def test_short_plain_message_passes(self):
        self.assertEqual(cc.check_commit_message("Add floating nav\n"), [])

    def test_empty_message_fails(self):
        self.assertTrue(cc.check_commit_message("\n# a comment\n"))

    def test_long_subject_fails(self):
        self.assertTrue(cc.check_commit_message("x" * 73))

    def test_subject_at_limit_passes(self):
        self.assertEqual(cc.check_commit_message("x" * 72), [])

    def test_trailer_is_rejected(self):
        msg = "Add nav\n\nCo-Authored-By: Someone Else <a@b.c>\n"
        self.assertTrue(cc.check_commit_message(msg))

    def test_dash_in_body_is_rejected(self):
        self.assertTrue(cc.check_commit_message(f"Add nav\n\nBody {EM} text\n"))

    def test_git_comment_lines_are_ignored(self):
        self.assertEqual(cc.check_commit_message(f"Add nav\n# note {EM} ignored\n"), [])

    def test_merge_and_revert_subjects_skip_length_check(self):
        self.assertEqual(cc.check_commit_message("Merge branch '" + "a" * 90 + "'"), [])
        self.assertEqual(cc.check_commit_message('Revert "' + "a" * 90 + '"'), [])


DIFF = f"""diff --git a/src/a.tsx b/src/a.tsx
--- a/src/a.tsx
+++ b/src/a.tsx
@@ -1,2 +3,3 @@
 context line
+const a = 1;
-removed {EM} line
+const b = "two {EM} dashes";
diff --git a/node_modules/x/index.js b/node_modules/x/index.js
--- a/node_modules/x/index.js
+++ b/node_modules/x/index.js
@@ -0,0 +1 @@
+vendor {EM} code
"""


class DiffParsing(unittest.TestCase):
    def test_only_added_lines_with_numbers_are_returned(self):
        rows = cc.added_lines_from_diff(DIFF)
        self.assertEqual(
            rows,
            [
                ("src/a.tsx", 4, "const a = 1;"),
                ("src/a.tsx", 5, f'const b = "two {EM} dashes";'),
            ],
        )

    def test_excluded_paths(self):
        self.assertTrue(cc.is_excluded("node_modules/x/index.js"))
        self.assertTrue(cc.is_excluded("frontend/package-lock.json"))
        self.assertTrue(cc.is_excluded("scripts/check_content.py"))
        self.assertTrue(cc.is_excluded("docs/superpowers/specs/a.md"))
        self.assertTrue(cc.is_excluded("frontend/public/logo.png"))
        self.assertTrue(cc.is_excluded("frontend/src/i18n/landing.test.ts"))
        self.assertFalse(cc.is_excluded("frontend/src/pages/LandingPage.tsx"))
        self.assertFalse(cc.is_excluded("README.md"))


if __name__ == "__main__":
    unittest.main()
