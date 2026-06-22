import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import {
  getTenantID,
  isSuperAdmin,
  superAdminOnly,
  superAdminOrOwnerField,
  usersCreateAccess,
  usersReadAccess,
  usersUpdateAccess,
} from '@/access'
import { ROLES, ERROR_CODES, AVAILABILITY_TYPES, WEEKDAYS, ALL_DAYS } from '@/lib/constants'
import { enforcePlanLimit } from '@/hooks/planLimit'

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'User', plural: 'Staff' },
  auth: true,
  admin: { useAsTitle: 'email', defaultColumns: ['name', 'email', 'role', 'tenant'] },
  access: {
    // Only superAdmins reach the Payload admin panel; tenant staff live entirely
    // in the custom /dashboard (spec §6.4 — belt and suspenders with usersReadAccess).
    admin: ({ req: { user } }) => isSuperAdmin(user),
    read: usersReadAccess,
    create: usersCreateAccess,
    update: usersUpdateAccess,
    delete: superAdminOnly, // owners deactivate; they never hard-delete
  },
  timestamps: true,
  hooks: {
    // Login guard: deactivated staff and suspended clinics cannot log in.
    beforeLogin: [
      async ({ user, req }) => {
        if (user.active === false) {
          throw new APIError(
            'Your account has been deactivated. Contact your clinic owner.',
            403,
            { code: ERROR_CODES.USER_INACTIVE },
          )
        }
        const tenantID = getTenantID(user)
        if (tenantID) {
          const tenant = await req.payload.findByID({
            collection: 'tenants',
            id: tenantID,
            depth: 0,
            req,
          })
          if (tenant?.status === 'suspended') {
            throw new APIError(
              "This clinic's account is suspended. Contact support.",
              403,
              { code: ERROR_CODES.TENANT_SUSPENDED },
            )
          }
        }
      },
    ],
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        if (!data) return data
        const actor = req.user

        // Role/tenant consistency: superAdmin ⇔ no tenant; everyone else ⇔ tenant set.
        const role = data.role ?? originalDoc?.role
        if (role === 'superAdmin') {
          data.tenant = null
        }

        // A non-superAdmin may never create or promote a superAdmin.
        if (actor && !isSuperAdmin(actor) && data.role === 'superAdmin') {
          throw new APIError('You cannot assign the super admin role.', 403, {
            code: ERROR_CODES.FORBIDDEN,
          })
        }

        // An owner can only operate inside their own tenant.
        if (actor && !isSuperAdmin(actor)) {
          const actorTenant = getTenantID(actor)
          if (operation === 'create') {
            data.tenant = actorTenant // force-set, ignore client value
          }
          if (operation === 'update' && data.tenant && String(data.tenant) !== String(actorTenant)) {
            throw new APIError('You cannot move staff to another clinic.', 403, {
              code: ERROR_CODES.FORBIDDEN,
            })
          }
        }
        return data
      },
    ],
    beforeChange: [
      ({ data }) => {
        if (data.role && data.role !== 'superAdmin' && !data.tenant) {
          throw new APIError('Staff must belong to a clinic.', 400, {
            code: ERROR_CODES.VALIDATION,
          })
        }
        return data
      },
      // Plan cap: a new active doctor beyond the tenant's plan limit is rejected.
      enforcePlanLimit('doctors'),
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'receptionist',
      options: ROLES.map((r) => ({ label: r, value: r })),
      access: { update: superAdminOrOwnerField },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      index: true,
      access: { update: superAdminOrOwnerField },
      admin: {
        description: 'Required for all roles except super admin.',
        condition: (data) => data?.role !== 'superAdmin',
      },
    },
    {
      name: 'phone',
      type: 'text',
      validate: (value: string | null | undefined) => {
        if (!value) return true
        return /^\+?[0-9]{7,15}$/.test(value.replace(/[\s-]/g, ''))
          ? true
          : 'Enter a valid phone number (7–15 digits).'
      },
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
      label: 'Active',
      access: { update: superAdminOrOwnerField },
    },
    {
      name: 'specialty',
      type: 'text',
      admin: { condition: (data) => data?.role === 'doctor' },
    },
    {
      name: 'consultationFee',
      type: 'number',
      min: 0,
      admin: {
        condition: (data) => data?.role === 'doctor',
        description: 'In the clinic currency. Used by billing (v2).',
      },
    },
    // Availability pattern. `regular` doctors keep set weekdays + a daily window;
    // `onCall` and `byAppointment` doctors are bookable any time (different tags).
    {
      name: 'availabilityType',
      type: 'select',
      defaultValue: 'regular',
      options: AVAILABILITY_TYPES.map((t) => ({ label: t.label, value: t.value })),
      admin: { condition: (data) => data?.role === 'doctor' },
    },
    {
      name: 'availableDays',
      type: 'select',
      hasMany: true,
      defaultValue: ALL_DAYS,
      options: WEEKDAYS.map((d) => ({ label: d.label, value: d.value })),
      admin: {
        description: 'Days this doctor sees patients (daily = all; alternate = e.g. Mon/Wed/Fri; weekly = one).',
        condition: (data) => data?.role === 'doctor' && (data?.availabilityType ?? 'regular') === 'regular',
      },
    },
    {
      name: 'availableFrom',
      type: 'text',
      defaultValue: '09:00',
      label: 'Available from (HH:mm)',
      admin: { condition: (data) => data?.role === 'doctor' && (data?.availabilityType ?? 'regular') === 'regular' },
    },
    {
      name: 'availableTo',
      type: 'text',
      defaultValue: '17:00',
      label: 'Available to (HH:mm)',
      admin: { condition: (data) => data?.role === 'doctor' && (data?.availabilityType ?? 'regular') === 'regular' },
    },
  ],
}
