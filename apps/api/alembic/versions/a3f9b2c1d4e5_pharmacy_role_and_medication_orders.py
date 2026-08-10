"""pharmacy role and medication orders

Adds the pharmacist role, inventory tracking tables, medication orders, and
all permissions needed to gate each action. Also grants doctor and nurse the
new medication-order permissions they need.

Revision ID: a3f9b2c1d4e5
Revises: c60b8a3f27e5
Create Date: 2026-08-10 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f9b2c1d4e5'
down_revision: Union[str, None] = 'd1a4f8c62b93'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# New permissions
# code, label, description, resource, action, module, supports_scope, sort_order
# ---------------------------------------------------------------------------
NEW_PERMISSIONS = [
    ('inventory.read', 'View inventory', 'See stock levels and movements.', 'inventory', 'read', 'pharmacy', False, 355),
    ('inventory.manage', 'Manage inventory', 'Restock, adjust, and expire stock.', 'inventory', 'manage', 'pharmacy', False, 356),
    ('medication_orders.read', 'View medication orders', 'See in-hospital medication orders.', 'medication_orders', 'read', 'pharmacy', False, 357),
    ('medication_orders.manage', 'Manage medication orders', 'Create and cancel medication orders.', 'medication_orders', 'manage', 'pharmacy', False, 358),
    ('medication_orders.dispense', 'Dispense medication orders', 'Mark orders as dispensed.', 'medication_orders', 'dispense', 'pharmacy', False, 359),
    ('medication_orders.administer', 'Administer medication', 'Record medication as administered.', 'medication_orders', 'administer', 'pharmacy', False, 360),
]

# ---------------------------------------------------------------------------
# New role
# ---------------------------------------------------------------------------
NEW_ROLE = {
    'code': 'pharmacist',
    'label': 'Pharmacist',
    'description': 'Manages medicine catalog, inventory, dispenses orders.',
    'is_platform': False,
    'sort_order': 60,
    'home_path': '/dashboard',
}

# ---------------------------------------------------------------------------
# Grants
# (role_code, permission_code, scope)
# ---------------------------------------------------------------------------
NEW_GRANTS = [
    # pharmacist
    ('pharmacist', 'medicines.read', 'all'),
    ('pharmacist', 'medicines.manage', None),
    ('pharmacist', 'inventory.read', 'all'),
    ('pharmacist', 'inventory.manage', None),
    ('pharmacist', 'medication_orders.read', 'all'),
    ('pharmacist', 'medication_orders.manage', None),
    ('pharmacist', 'medication_orders.dispense', None),
    ('pharmacist', 'prescriptions.read', 'all'),
    # doctor
    ('doctor', 'medication_orders.manage', None),
    ('doctor', 'medication_orders.read', 'own'),
    # nurse
    ('nurse', 'medication_orders.read', 'all'),
    ('nurse', 'medication_orders.administer', None),
    # superadmin gets everything without scope
    ('superadmin', 'inventory.read', 'all'),
    ('superadmin', 'inventory.manage', None),
    ('superadmin', 'medication_orders.read', 'all'),
    ('superadmin', 'medication_orders.manage', None),
    ('superadmin', 'medication_orders.dispense', None),
    ('superadmin', 'medication_orders.administer', None),
]


def upgrade() -> None:
    # ── Extend medicines table ────────────────────────────────────────────────
    op.add_column('medicines', sa.Column('lot_number', sa.String(), server_default='', nullable=True))
    op.add_column('medicines', sa.Column('expiry_date', sa.String(), server_default='', nullable=True))
    op.add_column('medicines', sa.Column('reorder_level', sa.Integer(), server_default='10', nullable=True))
    op.add_column('medicines', sa.Column('location', sa.String(), server_default='', nullable=True))
    op.add_column('medicines', sa.Column('unit', sa.String(), server_default='', nullable=True))

    # ── medication_orders ────────────────────────────────────────────────────
    op.create_table(
        'medication_orders',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('appointment_id', sa.String(), nullable=False),
        sa.Column('patient_id', sa.String(), nullable=False),
        sa.Column('doctor_id', sa.String(), nullable=False),
        sa.Column('medicine_id', sa.String(), nullable=True),
        sa.Column('medicine_name', sa.String(), server_default='', nullable=True),
        sa.Column('dosage', sa.String(), server_default='', nullable=True),
        sa.Column('route', sa.String(), server_default='', nullable=True),
        sa.Column('frequency', sa.String(), server_default='', nullable=True),
        sa.Column('duration', sa.String(), server_default='', nullable=True),
        sa.Column('instructions', sa.Text(), server_default='', nullable=True),
        sa.Column('status', sa.String(), server_default='pending', nullable=True),
        sa.Column('notes', sa.Text(), server_default='', nullable=True),
        sa.Column('ordered_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_medication_orders_hospital_id'), 'medication_orders', ['hospital_id'])
    op.create_index(op.f('ix_medication_orders_patient_id'), 'medication_orders', ['patient_id'])
    op.create_index(op.f('ix_medication_orders_appointment_id'), 'medication_orders', ['appointment_id'])

    # ── inventory_movements ──────────────────────────────────────────────────
    op.create_table(
        'inventory_movements',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('hospital_id', sa.String(), nullable=False),
        sa.Column('medicine_id', sa.String(), nullable=False),
        sa.Column('movement_type', sa.String(), nullable=False),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('lot_number', sa.String(), server_default='', nullable=True),
        sa.Column('expiry_date', sa.String(), server_default='', nullable=True),
        sa.Column('reference_id', sa.String(), server_default='', nullable=True),
        sa.Column('performed_by', sa.String(), nullable=False),
        sa.Column('notes', sa.Text(), server_default='', nullable=True),
        sa.Column('created_at', sa.String(), nullable=False),
        sa.ForeignKeyConstraint(['hospital_id'], ['hospitals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_inventory_movements_hospital_id'), 'inventory_movements', ['hospital_id'])
    op.create_index(op.f('ix_inventory_movements_medicine_id'), 'inventory_movements', ['medicine_id'])

    # ── permissions ──────────────────────────────────────────────────────────
    permissions = sa.table(
        'permissions',
        sa.column('code', sa.String),
        sa.column('label', sa.String),
        sa.column('description', sa.String),
        sa.column('resource', sa.String),
        sa.column('action', sa.String),
        sa.column('module', sa.String),
        sa.column('supports_scope', sa.Boolean),
        sa.column('sort_order', sa.Integer),
    )
    op.bulk_insert(permissions, [
        {
            'code': code, 'label': label, 'description': description,
            'resource': resource, 'action': action, 'module': module,
            'supports_scope': supports_scope, 'sort_order': sort_order,
        }
        for code, label, description, resource, action, module, supports_scope, sort_order in NEW_PERMISSIONS
    ])

    # ── pharmacist role ───────────────────────────────────────────────────────
    roles = sa.table(
        'roles',
        sa.column('code', sa.String),
        sa.column('label', sa.String),
        sa.column('description', sa.String),
        sa.column('is_platform', sa.Boolean),
        sa.column('sort_order', sa.Integer),
        sa.column('home_path', sa.String),
    )
    op.bulk_insert(roles, [NEW_ROLE])

    # ── role_permissions grants ───────────────────────────────────────────────
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String),
        sa.column('permission_code', sa.String),
        sa.column('scope', sa.String),
    )
    op.bulk_insert(role_permissions, [
        {'role_code': role, 'permission_code': code, 'scope': scope}
        for role, code, scope in NEW_GRANTS
    ])


def downgrade() -> None:
    # Remove grants
    role_permissions = sa.table(
        'role_permissions',
        sa.column('role_code', sa.String),
        sa.column('permission_code', sa.String),
    )
    for role, code, _scope in NEW_GRANTS:
        op.execute(
            role_permissions.delete().where(
                sa.and_(
                    role_permissions.c.role_code == role,
                    role_permissions.c.permission_code == code,
                )
            )
        )

    # Remove pharmacist role
    roles = sa.table('roles', sa.column('code', sa.String))
    op.execute(roles.delete().where(roles.c.code == 'pharmacist'))

    # Remove permissions
    permissions = sa.table('permissions', sa.column('code', sa.String))
    new_perm_codes = [p[0] for p in NEW_PERMISSIONS]
    op.execute(permissions.delete().where(permissions.c.code.in_(new_perm_codes)))

    # Drop tables
    op.drop_index(op.f('ix_inventory_movements_medicine_id'), table_name='inventory_movements')
    op.drop_index(op.f('ix_inventory_movements_hospital_id'), table_name='inventory_movements')
    op.drop_table('inventory_movements')

    op.drop_index(op.f('ix_medication_orders_appointment_id'), table_name='medication_orders')
    op.drop_index(op.f('ix_medication_orders_patient_id'), table_name='medication_orders')
    op.drop_index(op.f('ix_medication_orders_hospital_id'), table_name='medication_orders')
    op.drop_table('medication_orders')

    # Remove medicine columns
    op.drop_column('medicines', 'unit')
    op.drop_column('medicines', 'location')
    op.drop_column('medicines', 'reorder_level')
    op.drop_column('medicines', 'expiry_date')
    op.drop_column('medicines', 'lot_number')
