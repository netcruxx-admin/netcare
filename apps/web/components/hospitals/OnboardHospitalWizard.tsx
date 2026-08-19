'use client';

// Multi-step hospital onboarding.
//
// One Formik form across eight steps rather than eight forms: the whole
// registration is submitted as a single request (POST /hospitals creates the
// tenant, its profile, its licences and its subscription in one transaction),
// so the state has to survive navigation between steps anyway.
//
// Validation is per step — the schema swaps as the user moves — because a
// single schema over the whole form would refuse to leave step 1 on account of
// step 7 being empty. See ./onboarding/config.ts.
//
// Documents are the one thing that cannot ride along in the JSON body: they are
// files, and they need a hospital id to attach to. They are collected in local
// state and uploaded immediately after the hospital comes back. An upload that
// fails does not undo the hospital — by then it exists and is usable — so those
// failures are reported as a warning on the success screen rather than as a
// failed onboarding.

import { useMemo, useState } from 'react';
import { Formik, Form, type FormikHelpers } from 'formik';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle,
  Loader2,
  X,
} from 'lucide-react';
import { apiError } from '@/lib/apiError';
import {
  useGetOnboardingMetaQuery,
  useOnboardHospitalMutation,
  useUploadHospitalDocumentMutation,
} from '@/store/api';
import {
  buildPayload,
  DOCUMENTS_STEP_INDEX,
  FIELD_STEP,
  INITIAL_VALUES,
  STEPS,
  type PendingDocument,
  type WizardValues,
} from './onboarding/config';
import {
  AdminReviewStep,
  ClinicalStep,
  ContactStep,
  DepartmentsStep,
  DocumentsStep,
  IdentityStep,
  LicencesStep,
  OperationsStep,
  RegistrationStep,
} from './onboarding/StepPanels';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

interface Result {
  name: string;
  subdomain: string;
  adminEmail: string;
  uploaded: number;
  failedUploads: string[];
}

export function OnboardHospitalWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [formError, setFormError] = useState('');
  const [category, setCategory] = useState(INITIAL_VALUES.category);

  const [onboardHospital] = useOnboardHospitalMutation();
  const [uploadDocument] = useUploadHospitalDocumentMutation();
  // Refetched per category: which licences apply is a backend rule that depends
  // on the vertical and its enabled modules.
  const { data: meta } = useGetOnboardingMetaQuery(category, { skip: !open });

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const reset = () => {
    setStep(0);
    setDocuments([]);
    setResult(null);
    setFormError('');
    setCategory(INITIAL_VALUES.category);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addDocuments = (files: FileList) =>
    setDocuments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        docType: 'other',
        licenceType: '',
        title: '',
      })),
    ]);

  const removeDocument = (key: string) =>
    setDocuments((current) => current.filter((d) => d.key !== key));

  const patchDocument = (key: string, patch: Partial<PendingDocument>) =>
    setDocuments((current) =>
      current.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );

  const submit = async (
    values: WizardValues,
    { setSubmitting, setFieldError }: FormikHelpers<WizardValues>,
  ) => {
    setFormError('');
    try {
      const detail = await onboardHospital(buildPayload(values)).unwrap();
      const hospitalId = detail.hospital.id;

      // Sequential, not parallel: these are multipart uploads to one tenant,
      // and a burst of them buys nothing but a harder failure to describe.
      const failed: string[] = [];
      for (const doc of documents) {
        try {
          await uploadDocument({
            id: hospitalId,
            file: doc.file,
            docType: doc.docType,
            licenceType: doc.licenceType,
            title: doc.title,
          }).unwrap();
        } catch {
          failed.push(doc.file.name);
        }
      }

      setResult({
        name: detail.hospital.name,
        subdomain: detail.hospital.subdomain,
        adminEmail: values.adminEmail,
        uploaded: documents.length - failed.length,
        failedUploads: failed,
      });
      onCreated?.();
    } catch (err) {
      const message = apiError(err, 'Failed to create hospital');
      // The two conflicts the server actually raises belong on the field that
      // caused them, several steps back — not as a banner on the review screen
      // where there is nothing to correct. Anything else is a banner, because
      // guessing a field from prose lands the user on the wrong one.
      const lower = message.toLowerCase();
      const field = lower.includes('subdomain')
        ? 'subdomain'
        : lower.includes('email')
          ? 'adminEmail'
          : null;
      if (field) {
        setFieldError(field, message);
        setStep(FIELD_STEP[field]);
      } else {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        {/* Header — fixed */}
        <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-brand-teal flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">Onboard a Hospital</h3>
              {!result && (
                <p className="text-xs text-slate-400">
                  Step {step + 1} of {STEPS.length} — {current.title}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-900 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="overflow-y-auto flex-1">
            <SuccessPanel result={result} onAgain={reset} onDone={handleClose} />
          </div>
        ) : (
          <Formik
            initialValues={INITIAL_VALUES}
            validationSchema={current.schema}
            // Only the last step submits; Next is a validate-and-advance.
            onSubmit={submit}
          >
            {({ isSubmitting, validateForm, setTouched, values }) => {
              const goNext = async () => {
                const errors = await validateForm();
                if (Object.keys(errors).length > 0) {
                  // Formik only shows an error once its field is touched, and
                  // nothing on a freshly-opened step has been. Marking the
                  // failing fields touched is what makes the messages appear.
                  setTouched(
                    Object.keys(errors).reduce(
                      (acc, key) => ({ ...acc, [key]: true }),
                      {},
                    ),
                    false,
                  );
                  return;
                }
                setCategory(values.category);
                // Defer the DOM swap by one event-loop tick so the browser
                // finishes the current click's mouseup before the Submit button
                // renders in the same position as the Next button.
                setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 0);
              };

              return (
                <Form className="flex flex-col min-h-0 flex-1">
                  {/* Stepper — fixed */}
                  <div className="flex-shrink-0">
                    <Stepper current={step} onJump={setStep} />
                  </div>

                  {/* Scrollable step content */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <p className="text-sm text-slate-500 mb-5">{current.blurb}</p>
                    <StepBody
                      step={step}
                      meta={meta}
                      documents={documents}
                      onAdd={addDocuments}
                      onRemove={removeDocument}
                      onChange={patchDocument}
                    />
                  </div>

                  {formError && (
                    <div className="flex-shrink-0 mx-6 mb-0 flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 px-4 py-3">
                      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <p className="text-sm text-red-600">{formError}</p>
                    </div>
                  )}

                  {/* Footer — fixed */}
                  <div className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={step === 0 ? handleClose : () => setStep((s) => s - 1)}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition"
                    >
                      {step === 0 ? 'Cancel' : (<><ArrowLeft className="w-4 h-4" /> Back</>)}
                    </button>

                    <div className="flex items-center gap-3">
                      {/* Every step past identity is optional, so skipping is
                          offered explicitly rather than left to be guessed. */}
                      {!isLast && step > 0 && (
                        <button
                          type="button"
                          onClick={() => setStep((s) => s + 1)}
                          className="text-sm text-slate-400 hover:text-slate-600 transition"
                        >
                          Skip
                        </button>
                      )}
                      {isLast ? (
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition disabled:opacity-50"
                        >
                          {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                          ) : (
                            <><Check className="w-4 h-4" /> Create Hospital</>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={goNext}
                          className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg font-semibold text-sm hover:shadow-lg transition"
                        >
                          Next <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </Form>
              );
            }}
          </Formik>
        )}
      </div>
    </div>
  );
}

function StepBody({
  step,
  meta,
  documents,
  onAdd,
  onRemove,
  onChange,
}: {
  step: number;
  meta: Parameters<typeof IdentityStep>[0]['meta'];
  documents: PendingDocument[];
  onAdd: (files: FileList) => void;
  onRemove: (key: string) => void;
  onChange: (key: string, patch: Partial<PendingDocument>) => void;
}) {
  switch (STEPS[step].id) {
    case 'identity':
      return <IdentityStep meta={meta} />;
    case 'registration':
      return <RegistrationStep meta={meta} />;
    case 'contact':
      return <ContactStep meta={meta} />;
    case 'clinical':
      return <ClinicalStep />;
    case 'licences':
      return <LicencesStep meta={meta} />;
    case 'departments':
      return <DepartmentsStep meta={meta} />;
    case 'documents':
      return (
        <DocumentsStep
          meta={meta}
          documents={documents}
          onAdd={onAdd}
          onRemove={onRemove}
          onChange={onChange}
        />
      );
    case 'operations':
      return <OperationsStep meta={meta} />;
    default:
      return <AdminReviewStep meta={meta} documents={documents} />;
  }
}

/** The rail. Completed steps are clickable so a user can go back and check
 *  something without losing their place; ahead-of-you steps are not, because
 *  jumping forward would skip the validation that gates them. */
function Stepper({ current, onJump }: { current: number; onJump: (step: number) => void }) {
  const items = useMemo(() => STEPS.map((s, i) => ({ ...s, index: i })), []);
  return (
    <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-100 overflow-x-auto">
      {items.map((item) => {
        const done = item.index < current;
        const active = item.index === current;
        return (
          <button
            key={item.id}
            type="button"
            disabled={!done}
            onClick={() => onJump(item.index)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition ${
              active
                ? 'bg-cyan-50 text-cyan-700 font-semibold'
                : done
                  ? 'text-slate-500 hover:bg-slate-50 cursor-pointer'
                  : 'text-slate-300 cursor-default'
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                done
                  ? 'bg-emerald-500 text-white'
                  : active
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-100 text-slate-400'
              }`}
            >
              {done ? <Check className="w-2.5 h-2.5" strokeWidth={3} /> : item.index + 1}
            </span>
            {item.title}
          </button>
        );
      })}
    </div>
  );
}

function SuccessPanel({
  result,
  onAgain,
  onDone,
}: {
  result: Result;
  onAgain: () => void;
  onDone: () => void;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-4" />
      <p className="text-xl font-bold text-slate-900 mb-1">{result.name} created</p>
      <p className="text-sm text-slate-500">
        The admin can sign in at{' '}
        <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
          {result.subdomain}.localhost:3000
        </span>
      </p>
      <p className="text-xs text-slate-400 mt-1">as {result.adminEmail}</p>

      {result.uploaded > 0 && (
        <p className="text-xs text-slate-400 mt-3">
          {result.uploaded} document{result.uploaded === 1 ? '' : 's'} attached.
        </p>
      )}

      {result.failedUploads.length > 0 && (
        <div className="mt-4 mx-auto max-w-md flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-left">
          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            The hospital was created, but {result.failedUploads.length} document
            {result.failedUploads.length === 1 ? '' : 's'} did not upload (
            {result.failedUploads.join(', ')}). Attach them from the hospital&apos;s page.
          </p>
        </div>
      )}

      <div className="flex gap-3 justify-center mt-7">
        <button
          onClick={onAgain}
          className="px-5 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition"
        >
          Add another
        </button>
        <button
          onClick={onDone}
          className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-brand-teal text-white rounded-lg text-sm font-medium hover:shadow-lg transition"
        >
          Done
        </button>
      </div>
    </div>
  );
}

export { DOCUMENTS_STEP_INDEX };
