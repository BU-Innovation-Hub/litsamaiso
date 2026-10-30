# 0001. Per institution switch for the student authenticator app: rationale

## Context

The authenticator app (TOTP, a 6 digit code that changes every 30 seconds) is required for every student, at two points: registration ([authController.ts](../../../litsamaiso-api/src/controllers/authController.ts)) and changing a profile photo ([totpVerification.ts](../../../litsamaiso-api/src/middleware/totpVerification.ts)). Voting never asks for a code. It compares the student's face with the saved photo, and the authenticator's job is to protect that photo. So "voting without the authenticator" needs no voting change, only these two requirements made optional.

Not every institution wants this step, so the requirement needs to be a setting per institution, controlled by AppAdmins.

Forces that shaped the design:

- The registration page doesn't know a student's institution. The server works it out from the student ID, and the existing public endpoints are careful not to reveal who has a student record.
- `requireAuth` doesn't populate the user's institution, so the photo check has to read the setting itself.
- The setting can change while a student has a page open, so the client can't be the one enforcing it.
- This is a live system with existing institution records that don't have the new field.

Assumptions: no scope file or `AGENTS.md` exists, so this is written from the code, and no build approach is on record, so the plan uses end to end slices.

## Options considered

### Option 1: A field on Institution, checked at the existing server gates

Add one boolean and read it where the authenticator is enforced today.

**Pros**: smallest change, and it reuses all the existing authenticator logic and error codes.

**Cons**: adds one small institution read to each student photo save and authenticator request.

### Option 2: A global setting (environment variable)

One switch for the whole app.

**Pros**: no schema or admin screen changes.

**Cons**: can't differ between institutions, which is the requirement, and changing it needs a redeploy.

### Option 3: Exemptions per student

Mark individual students as not needing the app.

**Pros**: the most precise control.

**Cons**: admin work grows with every student, and it doesn't answer the question of what an institution wants.

## Rationale

The real gap is only that two existing checks are unconditional, so making them conditional is enough, and anything broader would rebuild logic that already works. A per institution field is the only option that matches how the product is divided, since institutions are already the tenant boundary and already carry the lock setting.

Registration submits first and lets the server decide because the server already validates the student before it asks for the authenticator, and already returns `TOTP_REQUIRED`. A lookup endpoint would add a public way to test which student IDs exist, which the current enrollment endpoint deliberately avoids.

The switch is allowed during open elections, with a warning, because the most likely reason to use it mid vote is students being stuck, and blocking it would remove that way out.
