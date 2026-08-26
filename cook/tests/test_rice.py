#!/usr/bin/env python3
"""Unit tests for scripts/rice.py."""
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import rice


class TestComputeRice(unittest.TestCase):
    def test_raw_equals_cooked_over_factor(self):
        # 旧方案（250/200，4天）：总熟重 1800g → 生重 ≈ 783g
        plan = rice.compute_rice(250, 200, days=4, factor=2.3)
        self.assertAlmostEqual(plan["total_cooked"], 1800.0)
        self.assertAlmostEqual(plan["total_raw"], 1800 / 2.3, places=4)
        self.assertEqual(round(plan["total_raw"]), 783)

    def test_old_plan_breakdown(self):
        # 旧方案拆分应与周报(weekly-20260803.md)一致：548/157/78
        plan = rice.compute_rice(250, 200, days=4, factor=2.3)
        self.assertEqual(plan["raw_breakdown"], (548, 157, 78))

    def test_new_plan_values(self):
        # 新方案（200/150，4天）：总熟重 1400g → 生重 ≈ 609g
        plan = rice.compute_rice(200, 150, days=4, factor=2.3)
        self.assertAlmostEqual(plan["total_cooked"], 1400.0)
        self.assertEqual(round(plan["total_raw"]), 609)

    def test_new_plan_breakdown(self):
        # 新方案拆分应与周报(weekly-20260810.md)一致：426/122/61
        plan = rice.compute_rice(200, 150, days=4, factor=2.3)
        self.assertEqual(plan["raw_breakdown"], (426, 122, 61))

    def test_breakdown_sums_to_total(self):
        for lunch, dinner in ((250, 200), (200, 150), (180, 120)):
            plan = rice.compute_rice(lunch, dinner, days=4, factor=2.3)
            self.assertEqual(sum(plan["raw_breakdown"]), round(plan["total_raw"]))

    def test_markdown_row_contains_new_plan(self):
        plan = rice.compute_rice(200, 150, days=4, factor=2.3)
        row = rice.markdown_row(plan)
        self.assertIn("生重 609g（426+122+61）", row)
        self.assertIn("午餐200g / 晚餐150g（熟）", row)
        self.assertIn("熟重÷2.3=生重", row)

    def test_markdown_row_factor_is_dynamic(self):
        # 系数写入随 factor 变化，避免手算再次写反
        plan = rice.compute_rice(200, 150, days=4, factor=2.5)
        row = rice.markdown_row(plan)
        self.assertIn("生重×2.5≈熟重", row)
        self.assertIn("熟重÷2.5=生重", row)


if __name__ == "__main__":
    unittest.main()
