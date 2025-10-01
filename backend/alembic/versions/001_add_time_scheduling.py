"""Add shift and time-of-day scheduling tables

Revision ID: 001_add_time_scheduling
Revises: 
Create Date: 2025-10-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_add_time_scheduling'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add datetime columns to work_orders
    op.add_column('work_orders', sa.Column('calculated_start_datetime', sa.DateTime(), nullable=True))
    op.add_column('work_orders', sa.Column('calculated_end_datetime', sa.DateTime(), nullable=True))
    op.add_column('work_orders', sa.Column('wo_start_datetime', sa.DateTime(), nullable=True))
    
    # Create shifts table
    op.create_table('shifts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('line_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('shift_number', sa.Integer(), nullable=True),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('active_days', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['line_id'], ['smt_lines.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_shifts_id'), 'shifts', ['id'], unique=False)
    
    # Create shift_breaks table
    op.create_table('shift_breaks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shift_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=False),
        sa.Column('end_time', sa.Time(), nullable=False),
        sa.Column('is_paid', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(['shift_id'], ['shifts.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_shift_breaks_id'), 'shift_breaks', ['id'], unique=False)
    
    # Create line_configurations table
    op.create_table('line_configurations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('line_id', sa.Integer(), nullable=False),
        sa.Column('buffer_time_minutes', sa.Float(), nullable=True),
        sa.Column('time_rounding_minutes', sa.Integer(), nullable=True),
        sa.Column('timezone', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['line_id'], ['smt_lines.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('line_id')
    )
    op.create_index(op.f('ix_line_configurations_id'), 'line_configurations', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_line_configurations_id'), table_name='line_configurations')
    op.drop_table('line_configurations')
    op.drop_index(op.f('ix_shift_breaks_id'), table_name='shift_breaks')
    op.drop_table('shift_breaks')
    op.drop_index(op.f('ix_shifts_id'), table_name='shifts')
    op.drop_table('shifts')
    op.drop_column('work_orders', 'wo_start_datetime')
    op.drop_column('work_orders', 'calculated_end_datetime')
    op.drop_column('work_orders', 'calculated_start_datetime')

