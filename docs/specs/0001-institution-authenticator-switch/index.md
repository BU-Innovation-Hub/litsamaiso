# 0001. Per institution switch for the student authenticator app

**Date**: 2026-10-30
**Status**: In Progress

## Summary

An AppAdmin can turn the student authenticator app on or off for each institution, from the Institutions page. When it's off, students at that institution register and change their profile photo without an authenticator code, and vote with face verification only. It stays on for every institution until someone turns it off, so nothing changes on release. The cost of turning it off is that a stolen password is enough to replace a student's photo and then pass the face check as them.

## Requirements

**User stories**:
- As an AppAdmin, I want to turn the authenticator on or off for an institution so that each institution can choose its own level of protection.
- As a student at an institution with it off, I want to register and take my photo without an authenticator app so that I can vote with face verification alone.
- As a student at an institution with it on, I want nothing to change so that my photo stays protected.

**Acceptance criteria**:
- **AC-1**: The Institutions page shows an authenticator on or off badge for each institution. An institution with no stored value shows as on.
- **AC-2**: An AppAdmin can change the setting from the row actions menu, through a confirm dialog that warns about the risk when turning it off. The change persists, and the audit log records `institution.totp.enable` or `institution.totp.disable`.
- **AC-3**: Changing the setting is refused with 401 when signed out, 403 for any role except AppAdmin, 400 when `required` isn't a boolean, and 404 for an unknown institution.
- **AC-4**: With it off, a student registers without seeing the authenticator step, and the account has no authenticator fields set.
- **AC-5**: With it on, registration requires the authenticator as it does today. Errors in the student's details (wrong student ID, email taken) appear before the QR step.
- **AC-6**: With it off, a student's camera opens with no code, `POST /profile/face` succeeds with no grant, and the profile page shows no Authenticator app row or New device button.
- **AC-7**: With it off, a student with a saved face and no authenticator app can vote. A student with no saved face still gets `FACE_NOT_ENROLLED`.
- **AC-8**: With it on, photo changes behave exactly as today: a code is required, a grant saves one photo, and wrong codes lock the check.
- **AC-9**: Turning it off keeps stored authenticator keys. After turning it back on, students who had an app use the same one with no new scan, and students without one set it up at their next photo change.
- **AC-10**: With it off, `POST /profile/totp/enrollment`, `/profile/totp/enable` and `/profile/face/unlock` return 409 with code `TOTP_DISABLED`, and store no key or grant.
- **AC-11**: A page left open across a change recovers by itself. If it was turned off, `TOTP_DISABLED` moves the student on to the camera. If it was turned on, the existing `PHOTO_CAPTURE_GRANT_REQUIRED` response moves them to the code step.
- **AC-12**: If a student's institution can't be found or has no stored value, the authenticator counts as required.

## Decision

**Chosen option**: Option 1: a field on Institution, checked at the existing server gates.

`Institution.totpRequired` decides whether the existing registration and photo checks apply. The server enforces it, and the client only adjusts what it shows.

Smaller calls made in this design, with the runner up:

- **Endpoint**: a single `PUT /institutions/:id/totp` taking a boolean. Runner up: an enable and disable pair like lock and unlock, which is more routes for the same thing.
- **Authenticator routes when off**: refuse with `TOTP_DISABLED`, so no key is ever set up while the feature is off. Runner up: leave them working, which is less code but lets keys appear that nobody uses.
- **Admin reset when off**: unchanged and still available. Runner up: hiding it, which adds a condition for no benefit.
- **Reading a missing value**: treated as on everywhere, by checking `!== false`. Runner up: a backfill migration, which is an extra step for the same result.
- **Unused photo grants when it's turned off**: ignored and left to expire. Runner up: clearing them in bulk, which adds a write across all students to protect nothing.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Field | Type | Required | Default | Notes |
|---|---|---|---|---|---|
| Institution | `totpRequired` | Boolean | No | `true` | Missing counts as on. No index needed, it's only read by id. |

No new collections or relationships. `User` is unchanged, and its authenticator fields stay as they are when the setting is off. History of changes lives in the audit log.

**State transitions**:

Institution setting: `on` ⇄ `off`, changed only by an AppAdmin. Student key: unaffected by either transition.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/institutions/:id/totp` (new) | PUT | `required`: boolean (req) | `{ institution }` | AppAdmin | 400, 401, 403, 404 |
| `/institutions` (changed) | GET | none | each institution adds `totpRequired` | AppAdmin | unchanged |
| `/auth/register` (changed) | POST | `totpEnrollmentToken` and `totpCode` needed only when on, ignored when off | 201 | public | 400 `TOTP_REQUIRED` when on with no code |
| `/profile` (changed) | GET, PUT | none | adds `totpRequired`: boolean | signed in | unchanged |
| `/profile/face` (changed) | POST | grant header needed only when on | profile, with `totpRequired` | signed in | 403 `PHOTO_CAPTURE_GRANT_REQUIRED` when on with no grant |
| `/profile/totp/enrollment`, `/profile/totp/enable`, `/profile/face/unlock` (changed) | POST | unchanged | unchanged | Student | adds 409 `TOTP_DISABLED` when off |

**Server changes**:

- [Institution.ts](../../../litsamaiso-api/src/models/Institution.ts): add the field.
- [institutionController.ts](../../../litsamaiso-api/src/controllers/institutionController.ts): add `setInstitutionTotp`, with the same AppAdmin check and audit call as `lockInstitution`, and add `totpRequired` to the `listInstitutions` select. Setting the value it already has returns 200 and writes no audit entry.
- [totpService.ts](../../../litsamaiso-api/src/services/totpService.ts): add `isTotpRequired(institutionId)`, reading only that field and returning `value !== false`, which also gives true when the institution is missing.
- [totpVerification.ts](../../../litsamaiso-api/src/middleware/totpVerification.ts): `requirePhotoCaptureGrant` calls `next()` when the setting is off. Add `requireTotpInstitution`, which returns 409 `TOTP_DISABLED` when off, and put it on the three routes in [profileRoutes.ts](../../../litsamaiso-api/src/routes/profileRoutes.ts) after `requireRole`.
- [authController.ts](../../../litsamaiso-api/src/controllers/authController.ts) `register`: the student authenticator block runs only when `institution.totpRequired !== false`. The institution is already loaded there.
- [profileController.ts](../../../litsamaiso-api/src/controllers/profileController.ts): add `totpRequired` to the three `institution` populate selects, and to `serializeProfile` as `user.institution?.totpRequired !== false`.

**Client changes**:

- [InstitutionsPage.tsx](../../../litsamaiso-client/src/pages/InstitutionsPage.tsx): add the badge beside Active or Locked, a row menu item ("Turn off authenticator" or "Turn on authenticator", widening the menu if needed), and a confirm dialog built like the lock dialog.
  - Turning off, the dialog says: "Students at {name} won't need an authenticator app to register or change their photo. Someone with a student's password could then replace that student's photo and pass the face check when voting. This also applies to any election open now."
  - Turning on, the dialog says: "Students at {name} will need an authenticator app to register and to change their photo. Students who haven't set one up will do so the next time they change their photo."
- [institutionService.ts](../../../litsamaiso-client/src/services/institutionService.ts) and [types/index.ts](../../../litsamaiso-client/src/types/index.ts): add `setInstitutionTotp` and `Institution.totpRequired`.
- [RegisterPage.tsx](../../../litsamaiso-client/src/pages/RegisterPage.tsx): after consent, submit with no code. On success go to login. On `TOTP_REQUIRED`, show no error toast, prepare the enrollment and move to the authenticator step. `handleRegister` shares the same submit, so a setting turned on mid flow lands in the same place. `register` in [AuthContext.tsx](../../../litsamaiso-client/src/contexts/AuthContext.tsx) already rethrows errors, so the code reaches the page.
- [ProfilePage.tsx](../../../litsamaiso-client/src/pages/ProfilePage.tsx): `showCamera` becomes `Boolean(captureGrant) || !((isStudent && profile.totpRequired !== false) || codeRequired)`. Show the Authenticator app row only when also required. Close the New device modal if the setting turns out to be off.
- [AuthenticatorFlow.tsx](../../../litsamaiso-client/src/components/totp/AuthenticatorFlow.tsx): add an `onDisabled` prop, called when any request returns `TOTP_DISABLED`. That includes the enrollment started on open, which today only shows a toast. `ProfilePage` responds by setting `totpRequired` to false.
- [profileService.ts](../../../litsamaiso-client/src/services/profileService.ts): add `totpRequired` to `UserProfile`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Institutions page | badge and menu label | `Institution.totpRequired` from `GET /institutions`, missing counts as on |
| Set the switch | new value | `required` in the request body |
| Set the switch | audit actor | `req.user`, through `auditActor` |
| Set the switch | audit action and details | derived from `required`, plus `Institution.name` |
| Registration | whether a code is needed | `totpRequired` on the institution found from the student ID |
| Registration page | whether to show the QR step | `TOTP_REQUIRED` response code |
| Photo save and authenticator routes | whether the check applies | `Institution.totpRequired` found by `req.user.institution` |
| Profile page | camera or code step, row visibility | `totpRequired` from `GET /profile`, corrected by `TOTP_DISABLED` or `PHOTO_CAPTURE_GRANT_REQUIRED` |

**Key invariants**:

- The server alone enforces the setting. A client can't skip the check by sending or leaving out a field.
- Only `Institution.totpRequired === false` turns the check off. Anything else, including a missing institution, means on.
- Changing the setting never modifies a `User` document.
- No voting code changes.

**Security model**:

- Only AppAdmins can change the setting. InstitutionAdmins can't change it or see it on this page, since the page is AppAdmin only.
- Students learn the setting only for their own institution. Public registration only reveals it after the student ID and email match, which the existing errors already reveal.
- Every change is audit logged with who, which institution and which direction.

**Critical test scenarios**:

- Happy path: turn off, register with no code, take a photo with no code, vote with face only. Verifies **AC-2**, **AC-4**, **AC-6**, **AC-7**.
- On path: registration with no code gets `TOTP_REQUIRED`, then succeeds with a valid code. A photo save with no grant gets 403. Verifies **AC-5**, **AC-8**.
- Turn off then on: a student with a key can unlock with a code from the same app. The key is still stored. Verifies **AC-9**.
- Off routes: the three authenticator routes return `TOTP_DISABLED` and write nothing. Verifies **AC-10**.
- Missing value: an institution document without the field behaves as on and shows as on. Verifies **AC-1**, **AC-12**.
- Permissions: a non AppAdmin gets 403, signed out gets 401, and `required: "false"` gets 400. Verifies **AC-3**.
- Stale page: change the setting in each direction with the profile page open, then continue. Verifies **AC-11**.

## Build plan

1. Add the field, `PUT /institutions/:id/totp` with audit logging, and `totpRequired` in the list. Satisfies **AC-2**, **AC-3**.
2. Add the badge, menu item, confirm dialog and client service call on the Institutions page. Satisfies **AC-1**, **AC-2**.
3. Add `isTotpRequired`, the photo check change, `requireTotpInstitution` on the three routes, and `totpRequired` in the profile response. Satisfies **AC-6**, **AC-8**, **AC-10**, **AC-12**.
4. Update `ProfilePage` and `AuthenticatorFlow`, including stale page recovery. Satisfies **AC-6**, **AC-11**.
5. Make the `register` authenticator block conditional. Satisfies **AC-4**, **AC-5**, **AC-12**.
6. Change `RegisterPage` to submit first and move to the QR step on `TOTP_REQUIRED`. Satisfies **AC-4**, **AC-5**.
7. Add API tests alongside [totp.test.ts](../../../litsamaiso-api/src/services/totp.test.ts), [authController.test.ts](../../../litsamaiso-api/src/controllers/authController.test.ts) and [apiRoutes.test.ts](../../../litsamaiso-api/src/routes/apiRoutes.test.ts) for the scenarios above, then run the turn off and turn on journey in the real app, including a vote. Satisfies **AC-7**, **AC-9**, and confirms the rest.

## Consequences

**Positive**:
- Each institution chooses for itself, and nothing changes for anyone on release.
- Turning it off and on again is cheap, because students keep their existing apps.
- Registration errors now appear before a student scans anything, including at institutions with it on.

**Negative / tradeoffs**:
- With it off, a stolen password is enough to replace a student's photo and vote as them. The confirm dialog and audit log make this a visible choice, but don't reduce the risk.
- Photos replaced while it was off aren't checked again after it's turned back on.
- After turning it back on, students without an app set one up with only their login, so anyone holding their password can claim that step first. This gap exists today for students who registered before the authenticator, and an off period adds more students to it.
- Students who set up an app before it was turned off keep a Litsamaiso entry in their app, showing codes nobody asks for.
- Registration at institutions with it on now makes two register requests. This is well within the current rate limit of 5000 per 15 minutes.

**Neutral**:
- No migration and no new environment variables. `TOTP_ENCRYPTION_KEY` is still needed for institutions with it on.
- To roll back, revert the code. The stored field is then ignored and every institution is back to requiring the authenticator.

## Follow-up

- [ ] If the paused voting OTP work resumes, decide whether this switch also covers it.
