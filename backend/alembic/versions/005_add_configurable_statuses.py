"""Add configurable statuses table

Revision ID: 005_add_configurable_statuses
Revises: 003_add_auth_features
Create Date: 2025-10-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy import text

# revision identifiers
revision = '005_add_configurable_statuses'
down_revision = '003_add_auth_features'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    
    # Create statuses table
    op.create_table('statuses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_statuses_id'), 'statuses', ['id'], unique=False)
    op.create_index(op.f('ix_statuses_name'), 'statuses', ['name'], unique=False)
    
    # Insert default statuses
    conn.execute(text("""
        INSERT INTO statuses (name, color, is_active, display_order, is_system) VALUES
        ('Clear to Build', '#17a2b8', true, 1, true),
        ('Clear to Build *', '#17a2b8', true, 2, true),
        ('Running', '#28a745', true, 3, true),
        ('2nd Side Running', '#28a745', true, 4, true),
        ('On Hold', '#ffc107', true, 5, true),
        ('Program/Stencil', '#6f42c1', true, 6, true)
    """))
    
    # Add status_id column to work_orders (nullable for now)
    op.add_column('work_orders', sa.Column('status_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_work_orders_status', 'work_orders', 'statuses', ['status_id'], ['id'])
    
    # Migrate existing status enum values to status_id
    conn.execute(text("""
        UPDATE work_orders wo
        SET status_id = s.id
        FROM statuses s
        WHERE wo.status::text = s.name
    """))
    
    # Do the same for completed_work_orders if status column exists there
    # (Adding status_id to completed_work_orders for consistency)
    op.add_column('completed_work_orders', sa.Column('status_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_completed_work_orders_status', 'completed_work_orders', 'statuses', ['status_id'], ['id'])
    
    conn.execute(text("""
        UPDATE completed_work_orders cwo
        SET status_id = s.id
        FROM statuses s
        WHERE cwo.status::text = s.name
    """))


def downgrade() -> None:
    op.drop_constraint('fk_completed_work_orders_status', 'completed_work_orders', type_='foreignkey')
    op.drop_column('completed_work_orders', 'status_id')
    op.drop_constraint('fk_work_orders_status', 'work_orders', type_='foreignkey')
    op.drop_column('work_orders', 'status_id')
    op.drop_index(op.f('ix_statuses_name'), table_name='statuses')
    op.drop_index(op.f('ix_statuses_id'), table_name='statuses')
    op.drop_table('statuses')


