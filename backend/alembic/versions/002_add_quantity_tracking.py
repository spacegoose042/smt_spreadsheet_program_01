"""Add quantity tracking to completed work orders

Revision ID: 002_add_quantity_tracking
Revises: 001_add_time_scheduling
Create Date: 2025-10-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '002_add_quantity_tracking'
down_revision: Union[str, None] = '001_add_time_scheduling'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)
    
    # Add quantity tracking columns to completed_work_orders if they don't exist
    existing_columns = [c['name'] for c in inspector.get_columns('completed_work_orders')]
    
    if 'quantity_completed' not in existing_columns:
        # Add with default 0, then we can update it
        op.add_column('completed_work_orders', sa.Column('quantity_completed', sa.Integer(), nullable=True))
        # Update existing records to use actual_time_clocked_minutes as quantity (temporary)
        op.execute('UPDATE completed_work_orders SET quantity_completed = CAST(actual_time_clocked_minutes AS INTEGER) WHERE quantity_completed IS NULL')
        # Make it not nullable
        op.alter_column('completed_work_orders', 'quantity_completed', nullable=False)
    
    if 'estimated_quantity' not in existing_columns:
        op.add_column('completed_work_orders', sa.Column('estimated_quantity', sa.Integer(), nullable=True))
    
    if 'quantity_variance' not in existing_columns:
        op.add_column('completed_work_orders', sa.Column('quantity_variance', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('completed_work_orders', 'quantity_variance')
    op.drop_column('completed_work_orders', 'estimated_quantity')
    op.drop_column('completed_work_orders', 'quantity_completed')

