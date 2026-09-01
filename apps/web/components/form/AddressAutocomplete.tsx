'use client';

/**
 * AddressAutocomplete
 *
 * A drop-in replacement for the "Address Line 1" FormField in every hospital
 * address form. When NEXT_PUBLIC_GOOGLE_PLACES_API_KEY is set it wires up
 * Google Places Autocomplete and auto-fills the sibling fields on selection.
 * When the key is absent it falls back to a plain text input so the rest of
 * the form is unaffected.
 *
 * Assumes the Formik context contains these field names (the same in all three
 * hospital address forms):
 *   addressLine1, addressLine2, city, district, state, pincode, country
 */

import { useEffect, useRef } from 'react';
import { useField, useFormikContext } from 'formik';
import { AlertCircle, MapPin } from 'lucide-react';

// ── script loader ─────────────────────────────────────────────────────────────
// The Google Maps JS SDK must only be injected once per page. A module-level
// singleton tracks the load state so mounting several forms does not add
// several script tags.

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
let gmapsState: LoadState = 'idle';
const gmapsCallbacks: Array<() => void> = [];

function loadGoogleMaps(apiKey: string, onReady: () => void) {
  if (gmapsState === 'ready') { onReady(); return; }
  gmapsCallbacks.push(onReady);
  if (gmapsState === 'loading') return;

  gmapsState = 'loading';
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    gmapsState = 'ready';
    gmapsCallbacks.forEach((cb) => cb());
    gmapsCallbacks.length = 0;
  };
  script.onerror = () => {
    // Script failed (wrong key, API not enabled, network error).
    // Clear state so a future mount can retry, and silently degrade to
    // plain text — the input must stay usable even without autocomplete.
    gmapsState = 'idle';
    gmapsCallbacks.length = 0;
  };
  document.head.appendChild(script);
}

// ── address component extractor ───────────────────────────────────────────────

interface PlaceAddress {
  addressLine1: string;
  addressLine2: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
}

function extractAddress(
  components: google.maps.GeocoderAddressComponent[],
  formattedAddress = '',
): PlaceAddress {
  const get = (...types: string[]) =>
    components.find((c) => types.some((t) => c.types.includes(t)))?.long_name ?? '';

  const streetNumber = get('street_number');
  const route        = get('route');
  const premise      = get('premise');       // named building / hospital
  const subpremise   = get('subpremise');    // unit / floor
  const sublocality1 = get('sublocality_level_1', 'sublocality', 'neighborhood');
  const sublocality2 = get('sublocality_level_2');

  // addressLine1 priority:
  //  1. Named building (premise / subpremise)
  //  2. Street number + route
  //  3. Sublocality — common for Indian area-level picks ("Koramangala 5th Block")
  //  4. First segment of formatted_address as last resort
  let addressLine1 = '';
  if (premise || subpremise) {
    addressLine1 = [subpremise, premise].filter(Boolean).join(', ');
  } else if (route) {
    addressLine1 = [streetNumber, route].filter(Boolean).join(' ');
  } else if (sublocality1) {
    addressLine1 = sublocality1;
  } else if (formattedAddress) {
    addressLine1 = formattedAddress.split(',')[0].trim();
  }

  // addressLine2: secondary area info (only what wasn't used for line 1)
  let addressLine2 = '';
  if ((premise || subpremise) && sublocality1) {
    // line1 used the building name → area goes to line2
    addressLine2 = [sublocality2, sublocality1].filter(Boolean).join(', ');
  } else if (route && sublocality1) {
    // line1 used the street → area goes to line2
    addressLine2 = sublocality1;
  } else if (sublocality1 && sublocality2) {
    // line1 used sublocality1 → sublocality2 goes to line2
    addressLine2 = sublocality2;
  }

  return {
    addressLine1,
    addressLine2,
    city: get('locality', 'administrative_area_level_3'),
    district: get('administrative_area_level_2'),
    state: get('administrative_area_level_1'),
    pincode: get('postal_code'),
    country: get('country') || 'India',
  };
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  label?: string;
  placeholder?: string;
}

export function AddressAutocomplete({
  label = 'Address Line 1',
  placeholder = 'Start typing an address…',
}: Props) {
  const [field, meta] = useField('addressLine1');
  const { setFieldValue, setFieldTouched } = useFormikContext();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY;
  const hasError = meta.touched && !!meta.error;

  useEffect(() => {
    if (!apiKey || !inputRef.current) return;

    loadGoogleMaps(apiKey, () => {
      if (!inputRef.current || autocompleteRef.current) return;

      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        // 'geocode' covers streets, localities, areas and landmarks — much
        // better coverage for Indian addresses than 'address' (which requires
        // a street number and returns almost nothing in India).
        types: ['geocode'],
        componentRestrictions: { country: 'in' },
        fields: ['address_components', 'formatted_address'],
      });

      autocompleteRef.current = ac;

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.address_components) return;

        const addr = extractAddress(place.address_components, place.formatted_address ?? '');

        // Populate every sibling field — all forms share the same names.
        setFieldValue('addressLine1', addr.addressLine1);
        setFieldValue('addressLine2', addr.addressLine2);
        setFieldValue('city', addr.city);
        setFieldValue('district', addr.district);
        setFieldValue('state', addr.state);
        setFieldValue('pincode', addr.pincode);
        setFieldValue('country', addr.country);

        // Mark them touched so validation picks up the new values.
        setFieldTouched('addressLine1', true, false);
        setFieldTouched('city', true, false);
        setFieldTouched('pincode', true, false);
      });
    });

    return () => {
      // Drop the listener when the component unmounts (step navigation).
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  const inputClass = `w-full pl-10 pr-3 py-2 border rounded-lg text-sm focus:outline-none transition ${
    hasError
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-300 focus:border-cyan-500'
  }`;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          {...field}
          type="text"
          placeholder={apiKey ? placeholder : 'Building, street'}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          className={inputClass}
        />
      </div>
      {hasError && (
        <p className="flex items-center gap-1 text-red-500 text-xs mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {meta.error}
        </p>
      )}
      {apiKey && (
        <p className="text-xs text-slate-400 mt-1">
          Type to search — other fields fill automatically.
        </p>
      )}
    </div>
  );
}
