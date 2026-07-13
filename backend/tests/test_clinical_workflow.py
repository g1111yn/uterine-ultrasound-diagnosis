import asyncio
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.batch import get_batch_status, list_batch_jobs, router as batch_router
from app.api.cases import get_case, submit_judgment
from app.models.db import Base, BatchJob, Case, CaseImage, Judgment, Prediction, User, get_db
from app.models.schemas import (
    CLASS_ZH,
    JUDGMENT_CLASS_ZH,
    JudgmentIn,
    VALID_JUDGMENT_CLASSES,
)
from app.services.batch_pipeline import (
    _batch_without_work_error,
    _begin_immediate_batch,
    _TaskResultGate,
    _completed_task_record,
    _fail_batch_without_work,
    _fail_running_batch_on_timeout,
    _start_serial_batch_worker,
    cancel_batch,
    submit_batch,
)
from app.services.inference_queue import InferenceQueue, TaskRecord
from app.services.report_pdf import generate_report_pdf
from app.services import auth


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

    def test_judgment_accepts_an_omitted_optional_recommendation(self):
        case = Case(case_id="case-no-recommendation", patient_no="p-optional", clinical_text="", doctor_id=self.user.user_id)
        self.db.add(case)
        self.db.commit()

        with patch("app.api.cases.audit.log_event"):
            response = asyncio.run(submit_judgment(
                case.case_id,
                JudgmentIn(final_class="normal"),
                self._request(),
                self.db,
                self.user,
            ))

        self.assertEqual(response.judgment.recommendation, "")
        persisted = self.db.query(Judgment).filter(Judgment.case_id == case.case_id).one()
        self.assertEqual(persisted.recommendation, "")

    def test_judgment_accepts_a_null_optional_recommendation(self):
        case = Case(case_id="case-null-recommendation", patient_no="p-null", clinical_text="", doctor_id=self.user.user_id)
        self.db.add(case)
        self.db.commit()

        with patch("app.api.cases.audit.log_event"):
            response = asyncio.run(submit_judgment(
                case.case_id,
                JudgmentIn(final_class="polyp", recommendation=None),
                self._request(),
                self.db,
                self.user,
            ))

        self.assertEqual(response.judgment.recommendation, "")

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

    def test_pdf_separates_model_and_physician_class_labels(self):
        case = SimpleNamespace(
            case_id="case-report",
            patient_no="p-report",
            created_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
            doctor_id=self.user.user_id,
            check_project="",
            clinical_text="",
        )
        prediction = SimpleNamespace(
            predicted_class="endometrial_cancer",
            confidence=0.9,
            aggregation_strategy="mean",
            image_count=1,
            model_version="test",
            prob_normal=0.05,
            prob_cancer=0.9,
            prob_polyp=0.05,
        )

        for final_class, expected_label in (
            ("endometrial_cancer", "疑似子宫内膜癌"),
            ("indeterminate", "无法判断 / 需进一步检查"),
        ):
            captured_rows = []
            judgment = SimpleNamespace(
                final_class=final_class,
                recommendation="biopsy",
                judged_at=datetime(2026, 7, 12, tzinfo=timezone.utc),
                doctor_id=self.user.user_id,
                note="",
            )

            from app.services import report_pdf
            original_info_table = report_pdf._info_table

            def capture_info_table(rows):
                captured_rows.append(rows)
                return original_info_table(rows)

            with patch("app.services.report_pdf._info_table", side_effect=capture_info_table):
                generate_report_pdf(case, prediction, judgment, images=[])

            row_values = dict(row for rows in captured_rows for row in rows)
            self.assertEqual(row_values["预测分类"], "子宫内膜癌")
            self.assertEqual(row_values["最终诊断"], expected_label)

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

    def test_closed_result_gate_rejects_late_callback(self):
        gate = _TaskResultGate()
        self.assertIsNone(gate.wait_and_close(timeout=0.01))

        self.assertFalse(gate.accept(object()))

    def test_real_queue_cancelled_queued_task_never_executes(self):
        inference_queue = InferenceQueue()
        getter_calls = []
        completed = []
        task = inference_queue.submit_per_image(
            "queued-cancel",
            priority=5,
            image_bytes_getter=lambda: getter_calls.append(True) or b"image",
            on_complete=completed.append,
        )

        self.assertTrue(inference_queue.cancel(task.task_id))
        self.assertEqual(task.status, "cancelled")
        self.assertIn("cancel", task.error.lower())
        self.assertEqual(completed, [task])

        inference_queue.start()
        time.sleep(0.05)
        inference_queue.stop()
        self.assertEqual(getter_calls, [])

    def test_real_queue_running_task_reports_it_cannot_be_cancelled(self):
        inference_queue = InferenceQueue()
        inference_started = threading.Event()
        release_inference = threading.Event()
        completed = threading.Event()

        def blocking_predict(*args, **kwargs):
            inference_started.set()
            release_inference.wait(timeout=5)
            return self._inference_result()

        with patch("app.services.inference_queue.inferencer.predict", side_effect=blocking_predict):
            task = inference_queue.submit_per_image(
                "running-cancel",
                priority=5,
                image_bytes_getter=lambda: b"image",
                on_complete=lambda record: completed.set(),
            )
            inference_queue.start()
            self.assertTrue(inference_started.wait(timeout=2))
            self.assertFalse(inference_queue.cancel(task.task_id))
            self.assertEqual(task.status, "running")
            release_inference.set()
            self.assertTrue(completed.wait(timeout=2))
            inference_queue.stop()

    def test_timeout_failure_and_progress_use_one_commit(self):
        job = BatchJob(
            job_id="batch-atomic-timeout",
            user_id=self.user.user_id,
            status="running",
            total_patients=2,
            total_images=2,
        )
        self.db.add(job)
        self.db.commit()

        with patch.object(self.db, "commit", wraps=self.db.commit) as commit:
            self.assertTrue(_fail_running_batch_on_timeout(
                self.db,
                job.job_id,
                "图像推理超时",
            ))

        self.assertEqual(commit.call_count, 1)
        self.db.refresh(job)
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "图像推理超时")
        self.assertEqual(job.completed_images, 1)
        self.assertEqual(job.completed_patients, 1)
        self.assertEqual(job.failed_patients, 1)

    def test_timeout_does_not_mark_case_failed_after_cancellation_wins(self):
        job = BatchJob(
            job_id="batch-cancelled-before-timeout",
            user_id=self.user.user_id,
            status="cancelled",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-cancelled-before-timeout",
            patient_no="p-cancelled",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        self.db.add_all([job, case])
        self.db.commit()

        transitioned = _fail_running_batch_on_timeout(
            self.db,
            job.job_id,
            "图像推理超时",
            case_id=case.case_id,
        )

        self.assertFalse(transitioned)
        self.db.refresh(case)
        self.assertEqual(case.batch_error, "")

    @staticmethod
    def _inference_result():
        return SimpleNamespace(
            prob_normal=0.8,
            prob_cancer=0.1,
            prob_polyp=0.1,
            predicted_class="normal",
            confidence=0.8,
            gradcam_path="",
            inference_ms=10,
            model_version="test",
        )

    def test_timed_out_image_fails_batch_stops_work_and_ignores_late_callback(self):
        job = BatchJob(
            job_id="batch-timeout",
            user_id=self.user.user_id,
            status="running",
            total_patients=2,
            total_images=2,
        )
        first_case = Case(
            case_id="case-timeout",
            patient_no="p-timeout",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        second_case = Case(
            case_id="case-never-started",
            patient_no="p-never-started",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        self.db.add_all([job, first_case, second_case])
        self.db.commit()
        session_factory = sessionmaker(bind=self.engine)
        real_queue = InferenceQueue()

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
                patch("app.services.batch_pipeline.threading.Thread", InlineThread),
                patch("app.services.batch_pipeline.queue", real_queue),
                patch("app.services.batch_pipeline.BATCH_IMAGE_TIMEOUT_SECONDS", 0.01),
                patch("app.services.batch_pipeline.generate_task_id", return_value="real-timeout-task"),
            ):
                _start_serial_batch_worker(
                    job.job_id,
                    [
                        (first_case.case_id, first_case.check_project, first_case.clinical_text, [{"id": 1, "image_path": image_path.name}]),
                        (second_case.case_id, second_case.check_project, second_case.clinical_text, [{"id": 2, "image_path": image_path.name}]),
                    ],
                    "mean",
                )

            timed_out_task = real_queue.get("real-timeout-task")
            self.assertIsNotNone(timed_out_task)
            self.assertEqual(timed_out_task.status, "cancelled")
            real_queue.start()
            time.sleep(0.05)
            real_queue.stop()
            self.assertEqual(timed_out_task.status, "cancelled")
            self.assertIsNone(timed_out_task.result)

        self.db.expire_all()
        updated = self.db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
        self.assertEqual(updated.completed_images, 1)
        self.assertEqual(updated.completed_patients, 1)
        self.assertEqual(updated.failed_patients, 1)
        self.assertEqual(updated.succeeded_patients, 0)
        self.assertEqual(updated.status, "failed")
        self.assertIn("超时", updated.error_message)
        self.assertEqual(self.db.query(Prediction).count(), 0)

    def test_cancellation_during_last_image_is_not_overwritten_by_completion(self):
        job = BatchJob(
            job_id="batch-cancel-race",
            user_id=self.user.user_id,
            status="running",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-cancel-race",
            patient_no="p-cancel-race",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        image = CaseImage(
            case_id=case.case_id,
            image_path="image.bin",
            image_format="jpg",
            sequence=1,
        )
        self.db.add_all([job, case, image])
        self.db.commit()
        session_factory = sessionmaker(bind=self.engine)

        class InlineThread:
            def __init__(self, *, target, **kwargs):
                self.target = target

            def start(self):
                self.target()

        def cancel_then_complete(task_id, **kwargs):
            other_db = session_factory()
            try:
                current = other_db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
                current.status = "cancelled"
                current.finished_at = datetime.now(timezone.utc)
                other_db.commit()
            finally:
                other_db.close()
            kwargs["on_complete"](TaskRecord(
                task_id=task_id,
                kind="per_image",
                priority=5,
                status="done",
                result=self._inference_result(),
            ))

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / image.image_path).write_bytes(b"image")
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.threading.Thread", InlineThread),
                patch("app.services.batch_pipeline.queue.submit_per_image", side_effect=cancel_then_complete),
            ):
                _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": image.id, "image_path": image.image_path}])],
                    "mean",
                )

        self.db.expire_all()
        updated = self.db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
        self.assertEqual(updated.status, "cancelled")
        self.assertEqual(updated.completed_patients, 0)
        self.assertEqual(self.db.query(Prediction).count(), 0)

    def test_submit_batch_counts_only_persisted_images(self):
        session_factory = sessionmaker(bind=self.engine)
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            skipped = root / "skipped.dcm"
            valid = root / "valid.jpg"
            skipped.write_bytes(b"dcm")
            valid.write_bytes(b"jpg")

            def save_image(content, filename):
                if filename.endswith(".dcm"):
                    return "skipped.dcm", "dcm", ""
                return "valid.jpg", "jpg", ""

            with (
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.BATCH_DIR", root),
                patch("app.services.batch_pipeline._safe_extract_zip"),
                patch("app.services.batch_pipeline._parse_manifest", return_value=({"p-1": ("ultrasound", "")}, [])),
                patch("app.services.batch_pipeline._collect_patient_images", return_value={"p-1": [skipped, valid]}),
                patch("app.services.batch_pipeline.save_upload_with_preview", side_effect=save_image),
                patch("app.services.batch_pipeline._start_serial_batch_worker") as start_worker,
            ):
                summary = submit_batch(b"zip", user_id=self.user.user_id, aggregation_strategy="mean")

        persisted = self.db.query(BatchJob).filter(BatchJob.job_id == summary["job_id"]).one()
        self.assertEqual(summary["total_images"], 1)
        self.assertEqual(persisted.total_images, 1)
        self.assertEqual(len(start_worker.call_args.args[1][0][3]), 1)

    def test_submit_batch_persists_reason_when_patient_has_no_usable_images(self):
        session_factory = sessionmaker(bind=self.engine)
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            unreadable = root / "unreadable.dcm"
            unreadable.write_bytes(b"dcm")

            with (
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.BATCH_DIR", root),
                patch("app.services.batch_pipeline._safe_extract_zip"),
                patch("app.services.batch_pipeline._parse_manifest", return_value=({"p-unreadable": ("ultrasound", "")}, [])),
                patch("app.services.batch_pipeline._collect_patient_images", return_value={"p-unreadable": [unreadable]}),
                patch("app.services.batch_pipeline.save_upload_with_preview", return_value=("unreadable.dcm", "dcm", "")),
            ):
                summary = submit_batch(b"zip", user_id=self.user.user_id, aggregation_strategy="mean")

        case = self.db.query(Case).filter(Case.batch_job_id == summary["job_id"]).one()
        self.assertIn("DICOM", case.batch_error)
        response = asyncio.run(get_batch_status(summary["job_id"], self.db, self.user))
        self.assertEqual(response.results[0].error, case.batch_error)

    def test_batch_status_returns_job_error_message(self):
        job = BatchJob(
            job_id="batch-failed",
            user_id=self.user.user_id,
            status="failed",
            error_message="没有有效图像",
            total_images=2,
            completed_images=1,
        )
        self.db.add(job)
        self.db.commit()

        response = asyncio.run(get_batch_status(job.job_id, self.db, self.user))

        self.assertEqual(response.error, "没有有效图像")
        self.assertEqual(response.estimated_remaining_ms, 0)

    def test_batch_job_list_shows_running_jobs_from_all_doctors(self):
        other = User(user_id="other-doctor", display_name="其他医生", password_hash="unused")
        self.db.add_all([
            other,
            BatchJob(job_id="mine-running", user_id=self.user.user_id, status="running"),
            BatchJob(job_id="mine-completed", user_id=self.user.user_id, status="completed"),
            BatchJob(job_id="other-running", user_id=other.user_id, status="running"),
        ])
        self.db.commit()

        response = asyncio.run(list_batch_jobs(
            page=1,
            page_size=20,
            status="running",
            db=self.db,
            current_user=self.user,
        ))

        self.assertEqual(response.total, 2)
        self.assertEqual(
            {item.job_id for item in response.items},
            {"mine-running", "other-running"},
        )

    def test_batch_api_exposes_internal_pending_status_as_queued(self):
        job = BatchJob(job_id="mine-pending", user_id=self.user.user_id, status="pending")
        self.db.add(job)
        self.db.commit()

        listing = asyncio.run(list_batch_jobs(
            page=1,
            page_size=20,
            status=None,
            db=self.db,
            current_user=self.user,
        ))
        detail = asyncio.run(get_batch_status(job.job_id, self.db, self.user))

        self.assertEqual(listing.items[0].status, "queued")
        self.assertEqual(detail.status, "queued")

    def test_batch_status_marks_patient_with_saved_judgment(self):
        job = BatchJob(
            job_id="batch-judged",
            user_id=self.user.user_id,
            status="completed",
            total_patients=1,
            completed_patients=1,
            succeeded_patients=1,
            total_images=1,
            completed_images=1,
        )
        case = Case(
            case_id="case-judged",
            patient_no="p-judged",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        prediction = Prediction(
            case_id=case.case_id,
            aggregation_strategy="mean",
            prob_normal=0.8,
            prob_cancer=0.1,
            prob_polyp=0.1,
            predicted_class="normal",
            confidence=0.8,
            image_count=1,
            model_version="test",
        )
        judgment = Judgment(
            case_id=case.case_id,
            final_class="normal",
            recommendation="none",
            note="",
            doctor_id=self.user.user_id,
        )
        self.db.add_all([job, case, prediction, judgment])
        self.db.commit()

        response = asyncio.run(get_batch_status(job.job_id, self.db, self.user))

        self.assertTrue(response.results[0].has_judgment)

    def test_batch_status_keeps_running_patient_pending_without_fake_error(self):
        job = BatchJob(
            job_id="batch-pending-patient",
            user_id=self.user.user_id,
            status="running",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-pending-patient",
            patient_no="p-pending",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        self.db.add_all([job, case])
        self.db.commit()

        response = asyncio.run(get_batch_status(job.job_id, self.db, self.user))
        item = response.results[0]

        self.assertIsNone(item.predicted_class)
        self.assertIsNone(item.error)
        self.assertFalse(item.has_judgment)

    def test_batch_job_list_maps_queued_filter_to_internal_pending_status(self):
        other = User(user_id="queued-other", display_name="其他医生", password_hash="unused")
        self.db.add_all([
            other,
            BatchJob(job_id="mine-queued", user_id=self.user.user_id, status="pending"),
            BatchJob(job_id="other-queued", user_id=other.user_id, status="pending"),
        ])
        self.db.commit()

        response = asyncio.run(list_batch_jobs(
            page=1,
            page_size=20,
            status="queued",
            db=self.db,
            current_user=self.user,
        ))

        self.assertEqual(response.total, 2)
        self.assertEqual(
            {item.job_id for item in response.items},
            {"mine-queued", "other-queued"},
        )
        self.assertTrue(all(item.status == "queued" for item in response.items))

    def test_batch_status_returns_persisted_patient_failure_reason(self):
        job = BatchJob(
            job_id="batch-patient-failure",
            user_id=self.user.user_id,
            status="completed",
            total_patients=1,
            completed_patients=1,
            failed_patients=1,
        )
        case = Case(
            case_id="case-patient-failure",
            patient_no="p-failed",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
            batch_error="DICOM 图像无法生成可用预览。",
        )
        self.db.add_all([job, case])
        self.db.commit()

        response = asyncio.run(get_batch_status(job.job_id, self.db, self.user))

        self.assertEqual(response.results[0].error, "DICOM 图像无法生成可用预览。")
        self.assertFalse(response.results[0].has_judgment)

    def test_failed_patient_inference_persists_the_queue_error(self):
        job = BatchJob(
            job_id="batch-inference-failure",
            user_id=self.user.user_id,
            status="running",
            total_patients=1,
            total_images=1,
        )
        case = Case(
            case_id="case-inference-failure",
            patient_no="p-inference-failure",
            check_project="ultrasound",
            clinical_text="",
            doctor_id=self.user.user_id,
            batch_job_id=job.job_id,
        )
        image = CaseImage(case_id=case.case_id, image_path="image.bin", image_format="jpg", sequence=1)
        self.db.add_all([job, case, image])
        self.db.commit()
        session_factory = sessionmaker(bind=self.engine)

        def fail_immediately(task_id, **kwargs):
            kwargs["on_complete"](TaskRecord(
                task_id=task_id,
                kind="per_image",
                priority=5,
                status="failed",
                error="模型无法读取该图像",
            ))

        class InlineThread:
            def __init__(self, *, target, **kwargs):
                self.target = target

            def start(self):
                self.target()

            def join(self, timeout=None):
                return None

            def is_alive(self):
                return False

        with tempfile.TemporaryDirectory() as tmpdir:
            (Path(tmpdir) / image.image_path).write_bytes(b"image")
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", session_factory),
                patch("app.services.batch_pipeline.queue.submit_per_image", side_effect=fail_immediately),
                patch("app.services.batch_pipeline.threading.Thread", InlineThread),
            ):
                worker = _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": image.id, "image_path": image.image_path}])],
                    "mean",
                )
                worker.join(timeout=5)
                self.assertFalse(worker.is_alive())

        self.db.expire_all()
        persisted = self.db.query(Case).filter(Case.case_id == case.case_id).one()
        self.assertEqual(persisted.batch_error, "模型无法读取该图像")

    def test_batch_job_list_rejects_non_public_status_filters(self):
        class EmptyQuery:
            def filter(self, *_args): return self
            def count(self): return 0
            def order_by(self, *_args): return self
            def offset(self, *_args): return self
            def limit(self, *_args): return self
            def all(self): return []

        fake_db = SimpleNamespace(query=lambda *_args: EmptyQuery())
        fake_user = SimpleNamespace(user_id=self.user.user_id)
        app = FastAPI()
        app.include_router(batch_router)
        app.dependency_overrides[get_db] = lambda: fake_db
        app.dependency_overrides[auth.require_user] = lambda: fake_user

        with TestClient(app) as client:
            for status in ("pending", "garbage"):
                response = client.get("/batch", params={"status": status})
                self.assertEqual(response.status_code, 422)

    def test_cancel_during_final_aggregation_has_consistent_terminal_state(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = create_engine(
                f"sqlite:///{Path(tmpdir) / 'race.db'}",
                connect_args={"check_same_thread": False, "timeout": 5},
            )
            Base.metadata.create_all(engine)
            factory = sessionmaker(bind=engine)
            db = factory()
            user = User(user_id="race-doctor", display_name="", password_hash="unused")
            job = BatchJob(
                job_id="batch-final-race",
                user_id=user.user_id,
                status="running",
                total_patients=1,
                total_images=1,
            )
            case = Case(
                case_id="case-final-race",
                patient_no="p-final-race",
                check_project="ultrasound",
                clinical_text="",
                doctor_id=user.user_id,
                batch_job_id=job.job_id,
            )
            image = CaseImage(case_id=case.case_id, image_path="image.bin", image_format="jpg", sequence=1)
            db.add_all([user, job, case, image])
            db.commit()

            aggregate_entered = threading.Event()
            release_aggregate = threading.Event()
            cancel_done = threading.Event()

            class BlockingStrategy:
                def aggregate(self, results):
                    aggregate_entered.set()
                    release_aggregate.wait(timeout=5)
                    return SimpleNamespace(
                        strategy="mean",
                        threshold=0.0,
                        prob_normal=0.8,
                        prob_cancer=0.1,
                        prob_polyp=0.1,
                        predicted_class="normal",
                        confidence=0.8,
                        image_count=1,
                    )

            def finish_immediately(task_id, **kwargs):
                kwargs["on_complete"](TaskRecord(
                    task_id=task_id,
                    kind="per_image",
                    priority=5,
                    status="done",
                    result=self._inference_result(),
                ))

            def request_cancel():
                cancel_batch(job.job_id, user_id=user.user_id)
                cancel_done.set()

            (Path(tmpdir) / image.image_path).write_bytes(b"image")
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", factory),
                patch("app.services.batch_pipeline.get_strategy", return_value=BlockingStrategy()),
                patch("app.services.batch_pipeline.queue.submit_per_image", side_effect=finish_immediately),
            ):
                _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": image.id, "image_path": image.image_path}])],
                    "mean",
                )
                self.assertTrue(aggregate_entered.wait(timeout=2))
                cancel_thread = threading.Thread(target=request_cancel)
                cancel_thread.start()
                cancel_won_before_release = cancel_done.wait(timeout=0.2)
                release_aggregate.set()
                cancel_thread.join(timeout=5)
                self.assertTrue(cancel_done.is_set())

                for _ in range(100):
                    db.expire_all()
                    terminal = db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
                    if terminal.status in ("completed", "cancelled", "failed"):
                        break
                    threading.Event().wait(0.01)

            db.expire_all()
            terminal = db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
            prediction_count = db.query(Prediction).filter(Prediction.case_id == case.case_id).count()
            if cancel_won_before_release:
                self.assertEqual(terminal.status, "cancelled")
                self.assertEqual(terminal.completed_patients, 0)
                self.assertEqual(terminal.succeeded_patients, 0)
                self.assertEqual(prediction_count, 0)
            else:
                self.assertEqual(terminal.status, "completed")
                self.assertEqual(terminal.completed_patients, 1)
                self.assertEqual(terminal.succeeded_patients, 1)
                self.assertEqual(prediction_count, 1)
            db.close()
            engine.dispose()

    def test_cancel_committed_before_final_write_lock_wins(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            engine = create_engine(
                f"sqlite:///{Path(tmpdir) / 'cancel-first.db'}",
                connect_args={"check_same_thread": False, "timeout": 5},
            )
            Base.metadata.create_all(engine)
            factory = sessionmaker(bind=engine)
            db = factory()
            user = User(user_id="cancel-first-doctor", display_name="", password_hash="unused")
            job = BatchJob(
                job_id="batch-cancel-first",
                user_id=user.user_id,
                status="running",
                total_patients=1,
                total_images=1,
            )
            case = Case(
                case_id="case-cancel-first",
                patient_no="p-cancel-first",
                check_project="ultrasound",
                clinical_text="",
                doctor_id=user.user_id,
                batch_job_id=job.job_id,
            )
            image = CaseImage(case_id=case.case_id, image_path="image.bin", image_format="jpg", sequence=1)
            db.add_all([user, job, case, image])
            db.commit()
            before_lock = threading.Event()
            release_worker = threading.Event()

            def pause_before_lock(worker_db):
                before_lock.set()
                release_worker.wait(timeout=5)
                _begin_immediate_batch(worker_db)

            def finish_immediately(task_id, **kwargs):
                kwargs["on_complete"](TaskRecord(
                    task_id=task_id,
                    kind="per_image",
                    priority=5,
                    status="done",
                    result=self._inference_result(),
                ))

            (Path(tmpdir) / image.image_path).write_bytes(b"image")
            with (
                patch("app.services.batch_pipeline.DATA_DIR", Path(tmpdir)),
                patch("app.services.batch_pipeline.SessionLocal", factory),
                patch("app.services.batch_pipeline._begin_immediate_batch", side_effect=pause_before_lock),
                patch("app.services.batch_pipeline.queue.submit_per_image", side_effect=finish_immediately),
            ):
                worker = _start_serial_batch_worker(
                    job.job_id,
                    [(case.case_id, case.check_project, case.clinical_text, [{"id": image.id, "image_path": image.image_path}])],
                    "mean",
                )
                self.assertTrue(before_lock.wait(timeout=2))
                self.assertTrue(cancel_batch(job.job_id, user_id=user.user_id))
                release_worker.set()
                worker.join(timeout=5)
                self.assertFalse(worker.is_alive())

            db.expire_all()
            terminal = db.query(BatchJob).filter(BatchJob.job_id == job.job_id).one()
            self.assertEqual(terminal.status, "cancelled")
            self.assertEqual(terminal.completed_patients, 0)
            self.assertEqual(terminal.succeeded_patients, 0)
            self.assertEqual(db.query(Prediction).filter(Prediction.case_id == case.case_id).count(), 0)
            db.close()
            engine.dispose()

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
