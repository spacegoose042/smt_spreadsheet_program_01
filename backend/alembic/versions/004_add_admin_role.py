"""Add admin role to userrole enum

Revision ID: 004_add_admin_role
Revises: 003_add_auth_features
Create Date: 2025-10-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_add_admin_role'
down_revision: Union[str, None] = '003_add_auth_features'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add 'admin' to the userrole enum
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'admin'")


def downgrade() -> None:
    # Can't easily remove enum values in PostgreSQL
    # Would need to recreate the enum which is complex
    pass

