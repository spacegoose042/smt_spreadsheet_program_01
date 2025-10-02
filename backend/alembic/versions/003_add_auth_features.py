"""Add authentication features - admin role and assigned line for operators

Revision ID: 003_add_auth_features
Revises: 002_add_quantity_tracking
Create Date: 2025-10-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '003_add_auth_features'
down_revision: Union[str, None] = '002_add_quantity_tracking'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # Add assigned_line_id to users if it doesn't exist
    existing_columns = [c['name'] for c in inspector.get_columns('users')]
    
    if 'assigned_line_id' not in existing_columns:
        op.add_column('users', sa.Column('assigned_line_id', sa.Integer(), nullable=True))
        op.create_foreign_key('fk_users_assigned_line', 'users', 'smt_lines', ['assigned_line_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_users_assigned_line', 'users', type_='foreignkey')
    op.drop_column('users', 'assigned_line_id')

