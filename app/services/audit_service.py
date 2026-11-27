"""
Central service for immutable platform audit logging and log filtering.
"""

from typing import Any

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.models.extras import AuditLog


def log_audit_event(
    db: Session,
    action: str,
    entity_type: str,
    actor_id: int | None = None,
    entity_id: str | int | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditLog:
    """Records an audit event into the append-only audit_log table."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        metadata_json=metadata,
    )
    db.add(entry)
    db.flush()
    return entry


def list_audit_logs(
    db: Session,
    action: str | None = None,
    entity_type: str | None = None,
    actor_id: int | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[AuditLog]]:
    """Lists audit logs with optional filters."""
    query = select(AuditLog)
    count_query = select(func.count(AuditLog.id))

    if action:
        query = query.where(AuditLog.action == action)
        count_query = count_query.where(AuditLog.action == action)
    if entity_type:
        query = query.where(AuditLog.entity_type == entity_type)
        count_query = count_query.where(AuditLog.entity_type == entity_type)
    if actor_id is not None:
        query = query.where(AuditLog.actor_id == actor_id)
        count_query = count_query.where(AuditLog.actor_id == actor_id)

    total = db.scalar(count_query) or 0
    entries = list(
        db.scalars(
            query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(skip)
            .limit(limit)
        ).all()
    )
    return total, entries
