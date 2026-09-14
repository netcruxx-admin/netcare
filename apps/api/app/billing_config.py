"""Default and merge logic for the hospital's printed-bill field configuration.

Stored on `HospitalProfile.bill_field_config` as a JSON blob shaped like
`resolve_bill_field_config`'s return value; a hospital that has never touched
the setting has a bare `{}` (or `None`) there, so every read goes through this
merge rather than trusting the stored shape — the admin screen only ever
writes the keys someone actually changed.

The resolved config is snapshotted onto the `Payment` row at billing time
(`bill_breakdown`, in `injection_orders.administer_injection_order` and
`lab.update_test_order`), not re-read live when a bill is reprinted — a tax
invoice has to keep showing the GST rate that was actually charged even after
the admin changes the hospital's default.
"""
from typing import Optional

DEFAULT_BILL_FIELD_CONFIG = {
    "injectable": {
        "show_serial_number": True,
        "show_name": True,
        "show_price": True,
        "show_discount": True,
        "show_total": True,
    },
    "lab": {
        "show_gst": True,
        "split_gst": False,
        "gst_rate": 18.0,
    },
}


def resolve_bill_field_config(raw: Optional[dict]) -> dict:
    raw = raw or {}
    return {
        "injectable": {**DEFAULT_BILL_FIELD_CONFIG["injectable"], **(raw.get("injectable") or {})},
        "lab": {**DEFAULT_BILL_FIELD_CONFIG["lab"], **(raw.get("lab") or {})},
    }
