from sqlalchemy import (
    create_engine,
    Column,
    String,
    Integer,
    Float,
    Text,
    DateTime,
    Boolean,
    ForeignKey,
    text,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.event import listens_for
from datetime import datetime, timezone

from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


@listens_for(engine, "connect")
def _sqlite_pragma(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _utcnow():
    return datetime.now(timezone.utc)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True)
    display_name = Column(String, nullable=False, default="")
    department = Column(String, nullable=False, default="")
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="doctor")  # doctor | admin
    is_active = Column(Boolean, nullable=False, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    last_login_at = Column(DateTime, nullable=True)


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    expires_at = Column(DateTime, nullable=False)
    last_active_at = Column(DateTime, nullable=False, default=_utcnow)
    ip_address = Column(String, default="")
    user_agent = Column(String, default="")


class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, index=True, nullable=False)
    ip_address = Column(String, default="")
    success = Column(Boolean, nullable=False, default=False)
    attempted_at = Column(DateTime, nullable=False, default=_utcnow, index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime, nullable=False, default=_utcnow, index=True)
    user_id = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    resource_type = Column(String, default="")
    resource_id = Column(String, default="")
    ip_address = Column(String, default="")
    user_agent = Column(String, default="")
    detail = Column(Text, default="{}")
    success = Column(Boolean, nullable=False, default=True)


class Case(Base):
    __tablename__ = "cases"

    case_id = Column(String, primary_key=True)
    patient_no = Column(String, index=True, default="")
    # check_project = 检查方式（如「经阴道三维超声」），clinical_text = 检查所见
    # BERT 实际输入是两者拼接后的整段文本，详见 app.utils.text.build_clinical_text
    check_project = Column(String, default="")
    clinical_text = Column(Text, default="")
    doctor_id = Column(String, ForeignKey("users.user_id"), index=True, nullable=False)
    batch_job_id = Column(String, ForeignKey("batch_jobs.job_id"), nullable=True, index=True)
    batch_error = Column(Text, default="")
    created_at = Column(DateTime, index=True, nullable=False, default=_utcnow)

    images = relationship(
        "CaseImage",
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="CaseImage.sequence",
    )
    prediction = relationship(
        "Prediction",
        back_populates="case",
        uselist=False,
        cascade="all, delete-orphan",
    )
    judgment = relationship(
        "Judgment",
        back_populates="case",
        uselist=False,
        cascade="all, delete-orphan",
    )


class CaseImage(Base):
    __tablename__ = "case_images"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, ForeignKey("cases.case_id"), nullable=False, index=True)
    image_path = Column(String, nullable=False)
    preview_path = Column(String, nullable=True, default="")
    image_format = Column(String, nullable=False)
    original_filename = Column(String, default="")
    file_size = Column(Integer, default=0)
    sequence = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    case = relationship("Case", back_populates="images")
    per_image_prediction = relationship(
        "PerImagePrediction",
        back_populates="image",
        uselist=False,
        cascade="all, delete-orphan",
    )


class PerImagePrediction(Base):
    __tablename__ = "per_image_predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    image_id = Column(Integer, ForeignKey("case_images.id"), unique=True, nullable=False)
    prob_normal = Column(Float, nullable=False)
    prob_cancer = Column(Float, nullable=False)
    prob_polyp = Column(Float, nullable=False)
    predicted_class = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    gradcam_path = Column(String, default="")
    inference_ms = Column(Integer, default=0)
    model_version = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)

    image = relationship("CaseImage", back_populates="per_image_prediction")


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, ForeignKey("cases.case_id"), unique=True, nullable=False)
    aggregation_strategy = Column(String, nullable=False, default="mean")
    aggregation_threshold = Column(Float, default=0.0)
    prob_normal = Column(Float, nullable=False)
    prob_cancer = Column(Float, nullable=False)
    prob_polyp = Column(Float, nullable=False)
    predicted_class = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    image_count = Column(Integer, nullable=False, default=1)
    model_version = Column(String, nullable=False)
    aggregated_at = Column(DateTime, nullable=False, default=_utcnow)

    case = relationship("Case", back_populates="prediction")


class Judgment(Base):
    __tablename__ = "judgments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String, ForeignKey("cases.case_id"), unique=True, nullable=False)
    final_class = Column(String, nullable=False)
    recommendation = Column(String, default="none")
    note = Column(Text, default="")
    doctor_id = Column(String, ForeignKey("users.user_id"), nullable=False)
    judged_at = Column(DateTime, nullable=False, default=_utcnow)

    case = relationship("Case", back_populates="judgment")


class BatchJob(Base):
    __tablename__ = "batch_jobs"

    job_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)
    total_patients = Column(Integer, default=0)
    completed_patients = Column(Integer, default=0)
    succeeded_patients = Column(Integer, default=0)
    failed_patients = Column(Integer, default=0)
    total_images = Column(Integer, default=0)
    completed_images = Column(Integer, default=0)
    status = Column(String, default="pending", index=True)
    aggregation_strategy = Column(String, default="mean")
    current_patient = Column(String, default="")
    started_at = Column(DateTime, default=_utcnow)
    finished_at = Column(DateTime, nullable=True)
    error_message = Column(Text, default="")


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    key = Column(String, primary_key=True)
    user_id = Column(String, nullable=False, index=True)
    response_json = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)


def init_schema():
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        conn.execute(text("PRAGMA journal_mode=WAL"))
        conn.commit()
    _ensure_legacy_columns()
    _seed_default_user()


def _ensure_legacy_columns():
    """Idempotently add columns introduced after the initial cases table."""
    with engine.begin() as conn:
        cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(cases)")}
        if "check_project" not in cols:
            conn.exec_driver_sql("ALTER TABLE cases ADD COLUMN check_project VARCHAR DEFAULT ''")
        if "batch_error" not in cols:
            conn.exec_driver_sql("ALTER TABLE cases ADD COLUMN batch_error TEXT DEFAULT ''")


def _seed_default_user():
    """Ensure a placeholder 'default' user exists so cases created before the
    V1.3 auth landing satisfy the FK. Replaced by real accounts once login is
    wired up.
    """
    db = SessionLocal()
    try:
        if db.query(User).filter(User.user_id == "default").first() is None:
            db.add(User(
                user_id="default",
                display_name="默认医生",
                department="妇科",
                password_hash="!disabled",
                role="doctor",
                is_active=True,
                must_change_password=True,
            ))
            db.commit()
    finally:
        db.close()
