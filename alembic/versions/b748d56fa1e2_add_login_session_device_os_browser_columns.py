"""add login session device os browser logged_out_at columns

Revision ID: b748d56fa1e2
Revises: 0f112eafcd37
Create Date: 2026-11-27 13:51:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b748d56fa1e2'
down_revision: Union[str, None] = '0f112eafcd37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('login_sessions', sa.Column('device', sa.String(length=120), nullable=True))
    op.add_column('login_sessions', sa.Column('os_name', sa.String(length=120), nullable=True))
    op.add_column('login_sessions', sa.Column('browser', sa.String(length=120), nullable=True))
    op.add_column('login_sessions', sa.Column('logged_out_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('login_sessions', 'logged_out_at')
    op.drop_column('login_sessions', 'browser')
    op.drop_column('login_sessions', 'os_name')
    op.drop_column('login_sessions', 'device')
