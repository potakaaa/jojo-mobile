import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { AdminBranch, BranchCreateInput } from '../lib/admin-branches-api';

/**
 * Shared create/edit branch form. In edit mode (`initial` supplied) the fields
 * pre-fill from the existing branch; on submit it emits the full field set (the
 * generic PATCH accepts a partial, so sending everything is safe). All fields are
 * validated server-side too — this client validation is convenience only.
 */
interface BranchFormProps {
  initial?: AdminBranch;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: BranchCreateInput) => void;
  onCancel: () => void;
}

export function BranchForm({ initial, submitting, error, onSubmit, onCancel }: BranchFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [latitude, setLatitude] = useState(initial ? String(initial.latitude) : '');
  const [longitude, setLongitude] = useState(initial ? String(initial.longitude) : '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [openingHours, setOpeningHours] = useState(initial?.openingHours ?? '');
  const [prepMinutes, setPrepMinutes] = useState(
    initial ? String(initial.estimatedPrepMinutes) : '',
  );
  const [isAcceptingPickup, setIsAcceptingPickup] = useState(initial?.isAcceptingPickup ?? true);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocalError('Latitude and longitude must be valid numbers.');
      return;
    }

    const input: BranchCreateInput = {
      name: name.trim(),
      slug: slug.trim(),
      address: address.trim(),
      latitude: lat,
      longitude: lng,
      phone: phone.trim(),
      openingHours: openingHours.trim(),
      isAcceptingPickup,
    };
    // Match the backend schema (z.number().int().positive()) so a blank stays
    // omitted and a bad value fails client-side instead of round-tripping to a 400.
    const prep = Number(prepMinutes.trim());
    if (prepMinutes.trim().length > 0 && Number.isInteger(prep) && prep > 0) {
      input.estimatedPrepMinutes = prep;
    }

    onSubmit(input);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Slug
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Address
        <Input value={address} onChange={(e) => setAddress(e.target.value)} required />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Latitude
          <Input
            inputMode="decimal"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Longitude
          <Input
            inputMode="decimal"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            required
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Phone
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Opening hours
        <Input
          value={openingHours}
          onChange={(e) => setOpeningHours(e.target.value)}
          placeholder="08:00-20:00"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Estimated prep minutes (optional)
        <Input
          inputMode="numeric"
          value={prepMinutes}
          onChange={(e) => setPrepMinutes(e.target.value)}
          placeholder="15"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isAcceptingPickup}
          onChange={(e) => setIsAcceptingPickup(e.target.checked)}
        />
        Accepting pickup orders
      </label>

      {localError || error ? (
        <p role="alert" className="text-sm text-destructive">
          {localError ?? error}
        </p>
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" isLoading={submitting}>
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create branch'}
        </Button>
      </div>
    </form>
  );
}
