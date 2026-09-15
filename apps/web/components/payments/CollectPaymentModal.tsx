'use client';

import { Formik, Form } from 'formik';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { apiError } from '@/lib/apiError';
import { formatINR } from '@/lib/money';
import { useUpdatePaymentMutation } from '@/store/api';
import { PaymentModeField, type CounterPaymentMode } from './PaymentModeField';

/**
 * Take the money for a bill that has already been raised.
 *
 * Settling is a separate act from billing: the bill exists from the moment the
 * appointment is booked, and this is the desk saying the money is now in hand.
 * It records *how* alongside the status, because a day-report that says ₹300
 * was collected but not whether it went in the drawer or through a card machine
 * cannot be reconciled against either.
 *
 * `online` is deliberately not offered. A Razorpay payment settles itself when
 * the gateway signature checks out — marking one paid by hand here would be the
 * desk asserting a fact about money it never handled.
 */
export function CollectPaymentModal({
  open,
  onClose,
  paymentId,
  amount,
  patientName,
  defaultMode = 'cash',
  allowDiscount = false,
}: {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  amount: number;
  patientName?: string;
  /** How the booking said it would be paid, pre-selected so the common case is
   *  one click. The desk can still change it — what was intended at booking and
   *  what actually happened at the counter are different facts. */
  defaultMode?: CounterPaymentMode;
  /** Injectable bills only — lets the desk knock an amount off `amount`
   *  before collecting. The server rejects a discount on any other
   *  payment_type, so this must only be passed true for one. */
  allowDiscount?: boolean;
}) {
  const [updatePayment] = useUpdatePaymentMutation();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <DialogTitle className="font-semibold text-slate-900">Collect Payment</DialogTitle>
        </div>

        <Formik
          initialValues={{ mode: defaultMode, discount: 0 }}
          enableReinitialize
          onSubmit={async (values, { setSubmitting }) => {
            const discount = allowDiscount ? Number(values.discount) || 0 : 0;
            try {
              await updatePayment({
                id: paymentId,
                body: {
                  status: 'completed',
                  paymentMethod: values.mode,
                  ...(discount > 0 ? { discount } : {}),
                },
              }).unwrap();
              toast.success(`Collected ${formatINR(amount - discount, { paise: false })}`);
              onClose();
            } catch (err) {
              toast.error(apiError(err, 'Could not record the payment'));
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ values, setFieldValue, isSubmitting }) => {
            const discount = allowDiscount ? Number(values.discount) || 0 : 0;
            const due = Math.max(0, amount - discount);
            return (
            <Form>
              <div className="px-6 py-5 space-y-5">
                <div className="flex items-baseline justify-between bg-slate-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-xs text-slate-500">Amount due</p>
                    {patientName && <p className="text-sm text-slate-700 mt-0.5">{patientName}</p>}
                  </div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatINR(due, { paise: false })}
                  </p>
                </div>

                {allowDiscount && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">Discount</label>
                    <input
                      type="number"
                      min={0}
                      max={amount}
                      step="0.01"
                      value={values.discount}
                      disabled={isSubmitting}
                      onChange={(e) => {
                        const raw = e.target.value === '' ? 0 : Number(e.target.value);
                        setFieldValue('discount', Math.min(Math.max(raw, 0), amount));
                      }}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                    <p className="text-xs text-slate-500">
                      Knocked off {formatINR(amount, { paise: false })} before collection.
                    </p>
                  </div>
                )}

                <PaymentModeField
                  allowOnline={false}
                  value={values.mode}
                  onChange={(mode) => setFieldValue('mode', mode)}
                  label="Collected By"
                  disabled={isSubmitting}
                  note="Records the payment as collected. The day-report reconciles against this."
                />
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition disabled:opacity-60"
                >
                  {isSubmitting ? <Spinner size="sm" label="Recording…" /> : 'Mark Paid'}
                </button>
              </div>
            </Form>
            );
          }}
        </Formik>
      </DialogContent>
    </Dialog>
  );
}
