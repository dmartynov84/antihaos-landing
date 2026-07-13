#!/usr/bin/env python3
"""Реальні unit-тести для compute_reconciliation_verdict() (§18) --
чиста функція, тестується без ADMIN_TOKEN/мережі. python3 -m unittest
tools/__tests__/test_reconcile.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ops_cli import compute_reconciliation_verdict


class TestReconciliationVerdict(unittest.TestCase):
    def test_healthy_when_everything_clean(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 10, "drift_detected": 0, "unknown_schema_version": 0},
            {"deadLetterCount": 0, "staleCount": 0, "duplicateCandidateCounts": {"support_request": 0}},
        )
        self.assertEqual(verdict, "HEALTHY")
        self.assertEqual(reasons, [])

    def test_failed_on_unknown_schema_version(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 10, "drift_detected": 0, "unknown_schema_version": 1},
            {"deadLetterCount": 0, "staleCount": 0, "duplicateCandidateCounts": {}},
        )
        self.assertEqual(verdict, "FAILED")
        self.assertTrue(any("unknown schema_version" in r for r in reasons))

    def test_failed_on_dead_letter(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 10, "drift_detected": 0, "unknown_schema_version": 0},
            {"deadLetterCount": 3, "staleCount": 0, "duplicateCandidateCounts": {}},
        )
        self.assertEqual(verdict, "FAILED")
        self.assertTrue(any("dead_letter" in r for r in reasons))

    def test_degraded_on_drift_alone(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 8, "drift_detected": 2, "unknown_schema_version": 0},
            {"deadLetterCount": 0, "staleCount": 0, "duplicateCandidateCounts": {}},
        )
        self.assertEqual(verdict, "DEGRADED")

    def test_degraded_on_stale_alone(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 10, "drift_detected": 0, "unknown_schema_version": 0},
            {"deadLetterCount": 0, "staleCount": 1, "duplicateCandidateCounts": {}},
        )
        self.assertEqual(verdict, "DEGRADED")

    def test_degraded_on_duplicate_candidates(self):
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 10, "drift_detected": 0, "unknown_schema_version": 0},
            {"deadLetterCount": 0, "staleCount": 0, "duplicateCandidateCounts": {"support_request": 2, "refund_request": 0}},
        )
        self.assertEqual(verdict, "DEGRADED")

    def test_failed_takes_priority_over_degraded_signals(self):
        # unknown schema (FAILED) + stale (окремо було б DEGRADED) -> перемагає FAILED
        verdict, reasons = compute_reconciliation_verdict(
            {"in_sync": 5, "drift_detected": 1, "unknown_schema_version": 1},
            {"deadLetterCount": 0, "staleCount": 1, "duplicateCandidateCounts": {}},
        )
        self.assertEqual(verdict, "FAILED")


if __name__ == "__main__":
    unittest.main()
