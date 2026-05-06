from sqlalchemy import create_engine, Column, String, Integer, Float, Text, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime, timezone

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(String, primary_key=True)
    patient_no = Column(String, index=True, default="")
    image_path = Column(String, nullable=False)
    image_format = Column(String, nullable=False)
    preview_path = Column(String, nullable=True, default="")
    clinical_text = Column(Text, default="")
    doctor_id = Column(String, index=True, default="default")
    batch_job_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, index=True, default=lambda: datetime.now(timezone.utc))


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, unique=True, nullable=False)
    model_version = Column(String, nullable=False)
    prob_normal = Column(Float, nullable=False)
    prob_cancer = Column(Float, nullable=False)
    prob_polyp = Column(Float, nullable=False)
    predicted_class = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    gradcam_path = Column(String, default="")
    inference_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Judgment(Base):
    __tablename__ = "judgments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, unique=True, nullable=False)
    final_class = Column(String, nullable=False)
    recommendation = Column(String, default="none")
    note = Column(Text, default="")
    doctor_id = Column(String, default="default")
    judged_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    job_id = Column(String, primary_key=True)
    total = Column(Integer, default=0)
    completed = Column(Integer, default=0)
    succeeded = Column(Integer, default=0)
    failed = Column(Integer, default=0)
    status = Column(String, default="pending")
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    finished_at = Column(DateTime, nullable=True)
    doctor_id = Column(String, default="default")
