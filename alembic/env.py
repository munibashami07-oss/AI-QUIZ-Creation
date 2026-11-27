"""
Alembic migration environment.
Reads database credentials from app.core.config (.env) and loads all models.
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.core.database import Base
import app.models  # noqa: F401 - ensures all ORM models are registered on Base.metadata

# Alembic Config object for accessing alembic.ini logging settings.
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata used by `alembic revision --autogenerate`.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL without connecting)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode using the .env database URL."""
    connectable = create_engine(
        settings.database_url,
        poolclass=pool.NullPool,
        connect_args={"options": "-c timezone=UTC"},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
