import unittest

import main


class TestMain(unittest.TestCase):
    def test_env_bool(self):
        self.assertTrue(main._env_bool("__MISSING__", False) is False)

    def test_council_votes(self):
        votes, reasons, approved = main._council_vote_from_price_change(0.2, True)
        self.assertIsInstance(votes, str)
        self.assertEqual(len(reasons), 5)
        self.assertIsInstance(approved, bool)


if __name__ == "__main__":
    unittest.main()

