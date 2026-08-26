#!/usr/bin/env python3
"""Unit tests for scripts/build.py."""
import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import build


def day_record(date, **kw):
    rec = {
        "date": date,
        "calories": 0.0,
        "protein": 0.0,
        "fat": 0.0,
        "carb": 0.0,
        "fiber": 0.0,
        "meals": {},
    }
    rec.update(kw)
    return rec


class TestBuildBase(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmpdir)
        self.days_dir = Path(self.tmpdir) / "days"
        self.days_dir.mkdir(parents=True, exist_ok=True)
        self.data_path = Path(self.tmpdir) / "intake.json"
        self.foods_path = Path(self.tmpdir) / "foods.json"
        self.cfg_path = Path(self.tmpdir) / "config.json"
        self._orig = (build.DAYS_DIR, build.DATA, build.FOODS, build.CFG)
        build.DAYS_DIR = str(self.days_dir)
        build.DATA = str(self.data_path)
        build.FOODS = str(self.foods_path)
        build.CFG = str(self.cfg_path)
        self.addCleanup(self._restore)

    def _restore(self):
        build.DAYS_DIR, build.DATA, build.FOODS, build.CFG = self._orig

    def _write_day(self, name, data):
        path = self.days_dir / name
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return path

    def _write(self, name, data):
        path = Path(self.tmpdir) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        return path


class TestMergeDays(TestBuildBase):
    def test_merge_days_sorted_by_filename(self):
        self._write_day("2026-08-10.json", day_record("2026-08-10"))
        self._write_day("2026-08-03.json", day_record("2026-08-03"))
        self._write_day("2026-08-05.json", day_record("2026-08-05"))
        merged = build.merge_days()
        self.assertEqual([d["date"] for d in merged], ["2026-08-03", "2026-08-05", "2026-08-10"])

    def test_merge_days_rejects_filename_mismatch(self):
        self._write_day("2026-08-03.json", day_record("2026-08-04"))
        with self.assertRaises(SystemExit):
            build.merge_days()

    def test_merge_days_rejects_non_object(self):
        # day 文件内容是 JSON 标量/数组时，应干净地 fail，而非抛 AttributeError
        self._write_day("2026-08-03.json", "not-an-object")
        with self.assertRaises(SystemExit):
            build.merge_days()

    def test_merge_days_rejects_empty_dir(self):
        with self.assertRaises(SystemExit):
            build.merge_days()

    def test_merge_days_content_preserved(self):
        recs = [
            day_record("2026-08-03", calories=1515, protein=142.2,
                       meals={"午餐": {"foods": [{"name": "米饭(熟)", "amount": "250g"}]}}),
            day_record("2026-08-04", note="计划"),
        ]
        for r in recs:
            self._write_day(f"{r['date']}.json", r)
        self.assertEqual(build.merge_days(), recs)


class TestWriteIntake(TestBuildBase):
    def test_write_intake_dry_run_does_not_write(self):
        data = [day_record("2026-08-03")]
        build.write_intake(data, dry_run=True)
        self.assertFalse(self.data_path.exists())

    def test_write_intake_writes_when_missing(self):
        data = [day_record("2026-08-03")]
        build.write_intake(data, dry_run=False)
        with open(self.data_path, encoding="utf-8") as f:
            self.assertEqual(json.load(f), data)

    def test_write_intake_skips_when_semantically_equal(self):
        data = [day_record("2026-08-03")]
        # 预置一份语义相同、但格式不同（无尾随换行）的聚合
        self.data_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        build.write_intake(data, dry_run=False)
        with open(self.data_path, encoding="utf-8") as f:
            raw = f.read()
        self.assertFalse(raw.endswith("\n"), "语义一致时不应重写落盘（幂等跳过）")


class TestBuildValidation(TestBuildBase):
    def test_validate_meals_sums_match_top_level(self):
        foods = {
            "米饭(熟)": {"per": 100, "kcal": 110, "protein": 2.0, "fat": 0.32, "carb": 25.5, "fiber": 0},
            "鸡腿肉(生,去皮去骨)": {"per": 100, "kcal": 119, "protein": 19.7, "fat": 4.5, "carb": 0, "fiber": 0},
        }
        record = {
            "date": "2026-08-03",
            "calories": 429.0,
            "protein": 52.7,
            "fat": 12.12,
            "carb": 63.8,
            "fiber": 0.0,
            "meals": {
                "午餐": {
                    "foods": [
                        {"name": "鸡腿肉(生,去皮去骨)", "amount": "258g", "calories": 307.0, "protein": 50.8, "fat": 11.6, "carb": 0, "fiber": 0},
                        {"name": "米饭(熟)", "amount": "250g", "calories": 122.0, "protein": 2.9, "fat": 0.52, "carb": 63.8, "fiber": 0},
                    ]
                }
            }
        }
        # Top-level does not equal meal sum -> should fail
        with self.assertRaises(SystemExit):
            build.validate_meals(record, foods, 0)

    def test_validate_meals_passes_when_consistent(self):
        foods = {
            "鸡腿肉(生,去皮去骨)": {"per": 100, "kcal": 119, "protein": 19.7, "fat": 4.5, "carb": 0, "fiber": 0},
        }
        record = {
            "date": "2026-08-03",
            "calories": 307.0,
            "protein": 50.8,
            "fat": 11.6,
            "carb": 0,
            "fiber": 0,
            "meals": {
                "午餐": {
                    "foods": [
                        {"name": "鸡腿肉(生,去皮去骨)", "amount": "258g", "calories": 307.0, "protein": 50.8, "fat": 11.6, "carb": 0, "fiber": 0},
                    ]
                }
            }
        }
        # Should not raise
        build.validate_meals(record, foods, 0)

    def test_validate_targets_flags_deficit(self):
        data = [
            {"date": "2026-08-03", "calories": 1500, "protein": 140, "fat": 30, "carb": 170, "fiber": 12}
        ]
        cfg = {"tdee": 2400, "weightKg": 70, "targets": {"deficitMaxPct": 25}}
        # Should only warn, not fail
        build.validate_targets(data, cfg)

    def test_validate_water_sums_match_top_level(self):
        record = {
            "date": "2026-08-20",
            "water": 1660,
            "waters": [
                {"type": "矿泉水", "amount": 830},
                {"type": "矿泉水", "amount": 830},
            ],
        }
        build.validate_water(record, 0)  # should not raise

    def test_validate_water_mismatch_fails(self):
        record = {"date": "2026-08-20", "water": 1600, "waters": [{"type": "矿泉水", "amount": 830}]}
        with self.assertRaises(SystemExit):
            build.validate_water(record, 0)

    def test_validate_water_waters_without_top_water_fails(self):
        record = {"date": "2026-08-20", "waters": [{"type": "矿泉水", "amount": 830}]}
        with self.assertRaises(SystemExit):
            build.validate_water(record, 0)

    def test_validate_water_legacy_water_without_waters_warns_only(self):
        record = {"date": "2026-08-20", "water": 1660}
        build.validate_water(record, 0)  # should not raise

    def test_validate_water_missing_type_fails(self):
        record = {"date": "2026-08-20", "water": 830, "waters": [{"amount": 830}]}
        with self.assertRaises(SystemExit):
            build.validate_water(record, 0)

    def test_load_rejects_missing_fields(self):
        # 记录缺顶层字段（calories 等）时 load() 应失败
        self._write_day("2026-08-03.json", {"date": "2026-08-03"})
        self._write("foods.json", {"foods": {}})
        self._write("config.json", {"tdee": 2400})
        with self.assertRaises(SystemExit):
            build.load()

    def test_load_merges_days(self):
        self._write_day("2026-08-03.json", day_record("2026-08-03"))
        self._write_day("2026-08-04.json", day_record("2026-08-04"))
        self._write("foods.json", {"foods": {}})
        self._write("config.json", {"tdee": 2400, "weightKg": 70, "targets": {}})
        data, foods, cfg = build.load()
        self.assertEqual([d["date"] for d in data], ["2026-08-03", "2026-08-04"])


if __name__ == "__main__":
    unittest.main()
