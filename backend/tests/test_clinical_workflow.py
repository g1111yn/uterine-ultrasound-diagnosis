import asyncio
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.batch import get_batch_status
from app.api.cases import get_case, submit_judgment
from app.models.db import Base, BatchJob, Case, Judgment, Prediction, User
from app.models.schemas import (
    CLASS_ZH,
    JUDGMENT_CLASS_ZH,
    JudgmentIn,
    VALID_JUDGMENT_CLASSES,
)
from app.services.batch_pipeline import (
    _batch_without_work_error,
    _completed_task_record,
    _fail_batch_without_work,
    _start_serial_batch_worker,
)


class ClinicalWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.user = User(
            user_id="doctor-2",
            display_name="医生二",
            password_hash="unused",
        )
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def _request():
        return Request({"type": "http", "headers": [], "client": ("127.0.0.1", 1)})

    def test_indeterminate_is_valid_physician_judgment_only(self):
        self.assertIn("indeterminate", VALID_JUDGMENT_CLASSES)
        self.assertEqual(JUDGMENT_CLASS_ZH["endometrial_cancer"], "疑似子宫内膜癌")
        self.assertEqual(JUDGMENT_CLASS_ZH["indeterminate"], "无法判断 / 需进一步检查")

    def test_model_classes_do_not_include_indeterminate(self):
        self.assertNotIn("indeterminate", CLASS_ZH)

    def test_empty_patient_work_has_actionable_error(self):
        code, message = _batch_without_work_error([])
        self.assertEqual(code, "NO_VALID_IMAGES")
        self.assertIn("有效图像", message)

    def test_existing_judgment_update_records_before_and_after(self):
        case = Case(case_id="case-1", patient_no="p-1", clinical_text="", doctor_id=self.user.user_id)
        old_time = datetime(2025, 1, 2, tzinfo=timezone.utc)
        existing = Judgment(
            case_id=case.case_id,
            final_class="normal",
            recommendation="followup",
            note="old note",
            doctor_id="doctor-1",
            judged_at=old_time,
        )
        self.db.add_all([case, existing])
        self.db.commit()

        with patch("app.api.cases.audit.log_event") as log_event:
            response = asyncio.run(submit_judgment(
                case.case_id,
                JudgmentIn(final_class="indeterminate", recommendation="biopsy", note="new note"),
                self._request(),
                self.db,
                self.user,
            ))

        self.assertEqual(response.judgment.final_class, "indeterminate")
        detail = log_event.call_args.kwargs["detail"]
        self.assertEqual(detail["before"]["final_class"], "normal")
        self.assertEqual(detail["before"]["doctor_id"], "doctor-1")
        self.assertEqual(detail["after"]["final_class"], "indeterminate")
        self.assertEqual(detail["after"]["doctor_id"], "doctor-2")
        self.assertNotEqual(detail["after"]["judged_at"], detail["before"]["judged_at"])
        self.assertEqual(
            set(detail["before"]),
            {"id", "case_id", "final_class", "recommendation", "note", "doctor_id", "judged_at"},
        )
        self.assertEqual(response.judgment.judged_at.utcoffset(), timedelta(0))

    def test_new_judgment_audit_has_null_before(self):
        case = Case(case_id="case-2", patient_no="p-2", clinical_text="", doctor_id=self.user.user_id)
        self.db.add(case)
        self.db.commit()

        with patch("app.api.cases.audit.log_event") as log_event:
            asyncio.run(submit_judgment(
                case.case_id,
                JudgmentIn(final_class="polyp", recommendation="none", note=""),
                self._request(),
                self.db,
                self.user,
            ))

        detail = log_event.call_args.kwargs["detail"]
        self.assertIsNone(detail["before"])
        self.assertEqual(detail["after"]["final_class"], "polyp")

    def test_case_detail_uses_physician_judgment_label(self):
        case = Case(case_id="case-3", patient_no="p-3", clinical_text="", doctor_id=self.user.user_id)
        judgment = Judgment(
            case_id=case.case_id,
            final_class="endometrial_cancer",
            recommendation="biopsy",
            note="",
            doctor_id=self.user.user_id,
        )
        self.db.add_all([case, judgment])
        self.db.commit()

        response = asyncio.run(get_case(case.case_id, self.db, self.user))

        self.assertEqual(response.judgment.final_class_zh, "疑似子宫内膜癌")

    def test_empty_work_marks_batch_failed(self):
        job = BatchJob(job_id="batch-empty", user_id=self.user.user_id, status="running")

        self.assertTrue(_fail_batch_without_work(job, []))
        self.assertEqual(job.status, "failed")
        self.assertIsNotNone(job.finished_at)
        self.assertIn("有效图像", job.error_message)

    def test_timeout_does_not_accept_late_task_result(self):
        late_record = object()

        class TimedOutEvent:
            def wait(self, timeout):
                self.timeout = timeout
                return False

        self.assertIsNone(_completed_task_record(TimedOutEvent(), [late_record], timeout=300))

    def test_timed_out_image_advances_progress_and_fails_patient(self):
        job = BatchJob(
            job_id="batch-timeout",
            user_id=self.user.user_id,
            status="running",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-timeout",
            patient_no="p-timeout",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        self.db.add_all([job, case])
        self.db.commit()
        session_factory = sessionmaker(bind=self.engine)

        class TimedOutEvent:
            def wait(self, timeout):
                return False

            def set(self):
                pass

        class InlineThread:
            def __init__(self, *, target, **kwargs):
                self.target = target

            def start(self):
                self.target()

        with tempfile.TemporaryDirectory() as tmpdir:
            image_path = Path(tmpdir) / "image.bin"
            image_path.write_bytes(b"image")
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.threading.Event", TimedOutEvent),
                patch("app.services.batch_pipeline.threading.Thread", InlineThread),
                patch("app.services.batch_pipeline.queue.submit_per_image"),
            ):
                _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": 1, "image_path": image_path.name}])],
                    "mean",
                )

        self.db.expire_all()
        updated = self.db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
        self.assertEqual(updated.completed_images, 1)
        self.assertEqual(updated.completed_patients, 1)
        self.assertEqual(updated.failed_patients, 1)
        self.assertEqual(updated.succeeded_patients, 0)
        self.assertEqual(updated.status, "completed")
        self.assertEqual(self.db.query(Prediction).filter(Prediction.case_id == case.case_id).count(), 0)

    def test_batch_status_returns_job_error_message(self):
        job = BatchJob(
            job_id="batch-failed",
            user_id=self.user.user_id,
            status="failed",
            error_message="没有有效图像",
        )
        self.db.add(job)
        self.db.commit()

        response = asyncio.run(get_batch_status(job.job_id, self.db, self.user))

        self.assertEqual(response.error, "没有有效图像")

    def test_unexpected_worker_error_records_failure_reason(self):
        job = BatchJob(
            job_id="batch-error",
            user_id=self.user.user_id,
            status="running",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-error",
            patient_no="p-error",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        self.db.add_all([job, case])
        self.db.commit()
        session_factory = sessionmaker(bind=self.engine)

        class InlineThread:
            def __init__(self, *, target, **kwargs):
                self.target = target

            def start(self):
                self.target()

        with tempfile.TemporaryDirectory() as tmpdir:
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.threading.Thread", InlineThread),
                patch("builtins.print"),
            ):
                _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": 1, "image_path": "missing.bin"}])],
                    "mean",
                )

        self.db.expire_all()
        updated = self.db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
        self.assertEqual(updated.status, "failed")
        self.assertTrue(updated.error_message)


if __name__ == "__main__":
    unittest.main()
