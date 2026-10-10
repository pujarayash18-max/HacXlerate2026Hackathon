from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, JSON, UniqueConstraint, Text
from .db import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, index=True)   # lower-case login id: empID, enrollment number, or admin/mentor id
    name = Column(String)
    pw = Column(String)                                  # PBKDF2 hash
    role = Column(String)                                # student | faculty | mentor | admin
    student_id = Column(String, nullable=True)           # for role=student
    initial_pw = Column(String, nullable=True)           # generated password, kept only until the user changes it
    must_change = Column(Boolean, default=False)
    email_sent = Column(Boolean, default=False)


class Student(Base):
    __tablename__ = "students"
    id = Column(Integer, primary_key=True)
    student_id = Column(String, unique=True, index=True)
    name = Column(String)
    branch = Column(String, index=True)
    class_code = Column(String, index=True, nullable=True)
    mentor_email = Column(String, index=True, nullable=True)
    consent = Column(Boolean, default=True)
    peer_opt_in = Column(Boolean, default=False)
    gr_number = Column(String, nullable=True, index=True)
    subjects = Column(JSON, default=list)
    email = Column(String, nullable=True)

class Snapshot(Base):
    __tablename__ = "snapshots"
    __table_args__ = (UniqueConstraint("student_pk", "semester"),)
    id = Column(Integer, primary_key=True)
    student_pk = Column(Integer, ForeignKey("students.id"), index=True)
    semester = Column(Integer)
    attendance_pct = Column(Float)
    internal_marks = Column(Float)
    quiz_avg = Column(Float)
    assignment_completion_pct = Column(Float)
    lms_logins_per_week = Column(Float)
    prior_cgpa = Column(Float)
    intervention_flag = Column(Integer, default=0)
    outcome_flag = Column(Float, nullable=True)   # 1 = failed / dropped out, 0 = fine

class Plan(Base):
    __tablename__ = "plans"
    id = Column(Integer, primary_key=True)
    student_pk = Column(Integer, ForeignKey("students.id"), index=True)
    content = Column(JSON)
    status = Column(String, default="draft")      # draft | approved
    created_by = Column(String)
    approved_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    followups = Column(JSON, default=list)

class Note(Base):
    __tablename__ = "notes"
    id = Column(Integer, primary_key=True)
    student_pk = Column(Integer, ForeignKey("students.id"), index=True)
    author = Column(String)
    text = Column(Text)
    ts = Column(DateTime, default=datetime.utcnow)

class Audit(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow)
    user_email = Column(String, index=True)
    action = Column(String)
    student_id = Column(String, nullable=True)

class Insight(Base):
    __tablename__ = "insights"
    id = Column(Integer, primary_key=True)
    title = Column(String)
    body = Column(Text)
    n = Column(Integer)
    approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Faculty(Base):
    __tablename__ = "faculty"
    id = Column(Integer, primary_key=True)
    emp_id = Column(String, unique=True, index=True)
    department = Column(String, index=True)
    name = Column(String)
    subject = Column(String, default="")
    email = Column(String, nullable=True)

class ClassRoom(Base):
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("department", "semester", "name"),)
    id = Column(Integer, primary_key=True)
    department = Column(String, index=True)
    semester = Column(Integer, index=True)
    name = Column(String)

class FacultyClass(Base):
    __tablename__ = "faculty_classes"
    faculty_id = Column(Integer, ForeignKey("faculty.id"), primary_key=True)
    class_id = Column(Integer, ForeignKey("classes.id"), primary_key=True)

class ResetRequest(Base):
    __tablename__ = "reset_requests"
    id = Column(Integer, primary_key=True)
    username = Column(String, index=True)
    role = Column(String)
    status = Column(String, default="pending")   # pending | approved | rejected
    created_at = Column(DateTime, default=datetime.utcnow)
    handled_by = Column(String, nullable=True)
    handled_at = Column(DateTime, nullable=True)
