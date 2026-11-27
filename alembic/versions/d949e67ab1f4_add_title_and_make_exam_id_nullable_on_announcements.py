"""add title and make exam_id nullable on announcements

Revision ID: d949e67ab1f4
Revises: c849e67ab1f3
Create Date: 2026-11-27 15:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd949e67ab1f4'
down_revision: Union[str, None] = 'c849e67ab1f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('announcements', sa.Column('title', sa.String(length=200), server_default=sa.text("''"), nullable=False))
    op.alter_column('announcements', 'exam_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column('announcements', 'exam_id', existing_type=sa.Integer(), nullable=False)
    op.drop_column('announcements', 'title')
