import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { superAdminOnly, tenantScoped, getTenantID } from '@/access'
import { forceTenant } from '@/hooks/tenant'
import { enforcePlanLimit } from '@/hooks/planLimit'
import { GENDERS, BLOOD_GROUPS, ERROR_CODES } from '@/lib/constants'

/** Strip spaces/dashes; keep leading + and digits. Market-agnostic. */
const normalizePhone = (raw: string): string => {
  const trimmed = raw.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^0-9]/g, '')
  return hasPlus ? `+${digits}` : digits
}

export const Patients: CollectionConfig = {
  slug: 'patients',
  admin: { useAsTitle: 'name', defaultColumns: ['mrn', 'name', 'phone', 'gender'] },
  access: {
    read: tenantScoped,
    create: tenantScoped,
    update: tenantScoped,
    delete: superAdminOnly, // clinics don't hard-delete patients
  },
  timestamps: true,
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (data.phone) data.phone = normalizePhone(data.phone)
        // Clinics often know only the age. Require at least one of DOB / age.
        if (!data.dateOfBirth && (data.ageYears === undefined || data.ageYears === null)) {
          throw new APIError('Provide a date of birth or an age.', 400, {
            code: ERROR_CODES.VALIDATION,
          })
        }
        return data
      },
    ],
    beforeChange: [
      forceTenant,
      // Plan cap: a new patient beyond the tenant's plan limit is rejected (runs after
      // forceTenant so the tenant is resolved, before we assign an MRN we'd waste).
      enforcePlanLimit('patients'),
      // Per-clinic human-friendly MRN: P-0001, P-0002, …
      async ({ data, req, operation }) => {
        if (operation !== 'create') return data
        const tenantID = data.tenant ? String(data.tenant) : getTenantID(req.user)
        if (!tenantID) {
          throw new APIError('Cannot assign a patient number without a clinic.', 400, {
            code: ERROR_CODES.VALIDATION,
          })
        }
        const existing = await req.payload.count({
          collection: 'patients',
          where: { tenant: { equals: tenantID } },
          req,
        })
        const next = existing.totalDocs + 1
        data.mrn = `P-${String(next).padStart(4, '0')}`
        return data
      },
    ],
  },
  fields: [
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      index: true,
      access: { update: () => false }, // immutable after create
    },
    {
      name: 'mrn',
      type: 'text',
      label: 'Patient number',
      admin: { readOnly: true, description: 'Auto-assigned per clinic.' },
    },
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text', required: true, index: true },
    {
      name: 'gender',
      type: 'select',
      required: true,
      options: GENDERS.map((g) => ({ label: g, value: g })),
    },
    {
      name: 'dateOfBirth',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayOnly' } },
    },
    { name: 'ageYears', type: 'number', min: 0, max: 130, label: 'Age (years)' },
    {
      name: 'bloodGroup',
      type: 'select',
      options: BLOOD_GROUPS.map((b) => ({ label: b, value: b })),
    },
    {
      name: 'allergies',
      type: 'textarea',
      admin: { description: 'Shown prominently on the patient profile (safety).' },
    },
    { name: 'notes', type: 'textarea' },
  ],
  // Compound indexes (spec §5)
  indexes: [
    { fields: ['tenant', 'phone'] },
    { fields: ['tenant', 'mrn'], unique: true },
  ],
}
