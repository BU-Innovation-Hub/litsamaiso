# Verify: institution authenticator switch · spec 0001 · updated 2026-10-30

_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use a local or test database, since these steps change institution settings and create accounts. You'll need one institution with imported student records, an AppAdmin login, and a phone with an authenticator app.

## UI / manual

Institutions page

- [ ] Sign in as AppAdmin and open Institutions → every existing institution shows "Authenticator on" → AC-1
- [ ] Open a row menu and choose "Turn off authenticator" → the dialog names the institution and warns about photo replacement and open elections → AC-2
- [ ] Cancel the dialog, then reload → the badge still says on and nothing changed → AC-2
- [ ] Confirm "Turn off" → the badge changes to "Authenticator off", and stays that way after a reload → AC-2
- [ ] Open the audit log → there is one `institution.totp.disable` entry with your account and the institution name → AC-2

With it off

- [ ] Register a new student at that institution → after consent, the account is created with no QR step, and you land on login → AC-4
- [ ] Register with a wrong student ID → the normal error shows and no account is created → AC-4
- [ ] Sign in as that student and open Profile → no Authenticator app row and no New device button → AC-6
- [ ] Take a profile photo → the camera opens straight away, with no code, and the photo saves → AC-6
- [ ] In an open election, vote as that student → only face verification is asked for, and the ballot is accepted → AC-7
- [ ] Try voting as a student with no saved photo → refused with the existing "no face on file" message → AC-7

With it on (a second institution, or switch the first back)

- [ ] Register a new student → after consent the QR step appears, and a valid code creates the account → AC-5
- [ ] Register with a wrong student ID → the error shows before any QR code → AC-5
- [ ] Change the photo → a code is needed first; the same code can't be used twice; 5 wrong codes lock the check → AC-8

Turning it off and on again

- [ ] As a student with an app, note your codes work. Turn it off, then on again → the same app's code still opens the camera, with no new scan → AC-9
- [ ] As a student registered while it was off, change your photo after turning it on → you're asked to set up an app first → AC-9
- [ ] Open the audit log → one `institution.totp.enable` entry → AC-2

Pages left open across a change

- [ ] Open a student's Profile with it on, turn it off in another browser, then enter a code → the camera opens, with a note that the institution no longer uses the app → AC-11
- [ ] Open a student's Profile with it off and the camera open, turn it on in another browser, then capture the photo → you're moved to the code step and asked for a new code → AC-11
- [ ] Open the New device dialog with it on, turn it off, then enter a code → the dialog closes → AC-11

Value sourcing

- [ ] Institutions page: an institution with no stored `totpRequired` shows "Authenticator on" and the menu offers "Turn off" → AC-1, AC-12
- [ ] Registration: students at two institutions with different settings get different flows, using only their student IDs → AC-4, AC-5
- [ ] Profile page: change the setting directly, reload → the row and camera behaviour follow the stored value → AC-6, AC-8

## Commands

- [ ] From `litsamaiso-api`, `npm test` → all tests pass → AC-2, AC-3, AC-4, AC-5, AC-6, AC-8, AC-10, AC-12
- [ ] From `litsamaiso-api`, `npx tsc --noEmit` → no errors
- [ ] From `litsamaiso-client`, `npm run build` and `npm run lint` → no errors

## Acceptance-criteria coverage

- AC-1: Institutions page steps; the value sourcing step
- AC-2: Institutions page steps; audit log step; `institutionController.test.ts`
- AC-3: `institutionController.test.ts`; `apiRoutes.test.ts`
- AC-4: "With it off" registration steps; `authController.test.ts`
- AC-5: "With it on" registration steps; `authController.test.ts`
- AC-6: "With it off" profile and photo steps; `totp.test.ts`
- AC-7: "With it off" voting steps (manual only, no voting code changed)
- AC-8: "With it on" photo step; `totp.test.ts`
- AC-9: "Turning it off and on again" steps (manual only)
- AC-10: `totp.test.ts`
- AC-11: "Pages left open" steps (manual only)
- AC-12: `totp.test.ts`; `authController.test.ts`
