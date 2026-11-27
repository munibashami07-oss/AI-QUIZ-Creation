"""add registration status to users

Revision ID: c849e67ab1f3
Revises: b748d56fa1e2
Create Date: 2026-11-27 13:58:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c849e67ab1f3'
down_revision: Union[str, None] = 'b748d56fa1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('registration_status', sa.String(length=30), server_default=sa.text("'approved'"), nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'registration_status')
