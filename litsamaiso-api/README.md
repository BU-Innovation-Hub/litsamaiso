# Litsamaiso API

Node.js + TypeScript API for managing students, accounts, account confirmation, issue resolution, online elections and audit logging.

## Overview

This service supports three main workflows:

1. Institution admins import students.
2. Finance users import account spreadsheets and later resolve issues.
3. Students confirm their account details or submit corrections when their details do not match.
4. SAAD users create elections(positions & candidates) and student elect their candidates of choice.

Every request is also written to the audit log through a global audit middleware.

## Requirements

- Node.js 20+ recommended
- MongoDB
- npm

## Setup

Install dependencies:

```powershell
npm install
```

Configure environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URI` / `MONGODB_URI` | Yes | — | MongoDB connection string |
| `JWT_SECRET` | Yes | — | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | `1d` | Token lifetime, e.g. `1d` or `30d` (overridden to `30d` when `rememberMe=true`) |
| `PORT` | No | `5000` | Server listen port |
| `PASSWORD_RESET_BASE_URL` | No | — | Frontend base URL for password reset links, e.g. `http://localhost:3000` |
| `APP_ADMIN_EMAIL` | No | — | Seeds an AppAdmin user on startup if set |
| `APP_ADMIN_PASSWORD` | No | — | Password for the seeded AppAdmin |
| `SYSTEM_INSTITUTION_NAME` | No | — | Institution name for the AppAdmin seed |
| `SYSTEM_INSTITUTION_EMAIL` | No | — | Institution email for the AppAdmin seed |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | — | Google Gemini API key for AI account validation |
| `ELECTION_HMAC_SECRET` | No | — | HMAC secret for ballot hashing and result snapshot integrity |
| `CLOUDINARY_CLOUD_NAME` | No | — | Cloudinary cloud name for image/file uploads |
| `CLOUDINARY_API_KEY` | No | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | No | — | Cloudinary API secret |
| `CLOUDINARY_FOLDER` | No | `litsamaiso` | Cloudinary upload folder |
| `AGENDA_COLLECTION` | No | `agendaJobs` | MongoDB collection name for Agenda scheduled jobs |
| `APP_NAME` | No | `Litsamaiso` | Application name for email branding |
| `EMAIL_ACCENT_COLOR` | No | `#535BC0` | Accent color for email templates |
| `EMAIL_LOGO_URL` | No | — | Logo URL for email templates |
| `EMAIL_LOGO_PATH` | No | — | Local filesystem path to logo image |
| `EMAIL_SMTP_HOST` / `EMAIL_HOST` | No | — | SMTP server hostname |
| `EMAIL_SMTP_PORT` / `EMAIL_PORT` | No | `587` | SMTP server port |
| `EMAIL_SMTP_USER` / `EMAIL_USER` | No | — | SMTP username / email |
| `EMAIL_SMTP_PASS` / `EMAIL_PASS` | No | — | SMTP password or app-specific password |
| `EMAIL_SMTP_SECURE` / `EMAIL_SECURE` | No | — | Use TLS (`true` for port 465) |
| `EMAIL_FROM` | No | — | From address shown on outgoing messages |

Build the project:

```powershell
npm run build
```

Run in development:

```powershell
npm run dev
```

Run the built app:

```powershell
npm start
```

## Project Structure

- `src/index.ts` - app startup, middleware, route registration
- `src/controllers/` - request handlers
- `src/routes/` - route definitions
- `src/services/` - business logic
- `src/models/` - Mongoose models
- `src/middleware/` - Express middleware (auth, audit, rate limiting)
- `src/scheduler/` - job scheduling (Agenda)
- `src/utils/` - shared helpers such as audit logging, email, validation, seeding
- `src/constants/` - constant definitions
- `src/emailTemplates/` - React email templates
- `src/scripts/` - CLI utility scripts
- `src/types/` - TypeScript type declarations

## Roles

Seeded roles are case-insensitive:

- `AppAdmin`
- `InstitutionAdmin`
- `Finance`
- `SAAD`
- `student`

## Email Integration

- Implementation: `src/utils/email.ts` uses Nodemailer to send transactional emails (password resets, issue notifications).
- Runtime dependencies: `nodemailer` and `@types/nodemailer` are added to `package.json`.
- Required environment variables:
  - `EMAIL_SMTP_HOST` (e.g. `smtp.gmail.com`)
  - `EMAIL_SMTP_PORT` (e.g. `587`)
  - `EMAIL_SMTP_USER` (SMTP username / email)
  - `EMAIL_SMTP_PASS` (SMTP password or app-specific password)
  - `EMAIL_FROM` (From address shown on outgoing messages)

  If startup fails with a `querySrv ECONNREFUSED` error for MongoDB Atlas, the machine cannot resolve or reach the Atlas SRV record. Use a reachable MongoDB host, check your Atlas IP allowlist, or switch to a standard `mongodb://` connection string instead of `mongodb+srv://`.

- Where emails are sent from in the app:
  - When a confirmation mismatch is detected during `POST /accounts/confirm`, an `Issue` is created and Finance users are notified.
  - When a student submits `POST /accounts/resolve` (student-side), Finance users are notified of the updated or new `Issue`.
  - When Finance applies a resolution via `POST /accounts/finance-resolve`, the affected student is emailed to notify them the issue was resolved.

- Testing: set the SMTP variables in `.env` and exercise the endpoints above. For Gmail, use an app password and ensure `EMAIL_SMTP_PORT` and `EMAIL_SMTP_HOST` are correct.

## Rating & Feedback

- Purpose: Collect 1–5 star ratings and optional text feedback from users. Feedback submissions are public (no auth required). Only `AppAdmin` can view stored feedback.
- Model: `src/models/Feedback.ts` — fields: `rating` (Number, 1..5), `comment` (optional String), timestamps.
- Endpoints:
  - `POST /feedback` — public. Body: `{ "rating": 1..5, "comment": "optional text" }`. Returns `201` on success. Records audit action `feedback.submit` (or `feedback.submit.failed`).
  - `GET /feedback` — protected. Role: `AppAdmin` only. Returns an array of feedback records and records audit action `feedback.view`.
- Sample cURL (submit):
```bash
curl -X POST "http://<HOST>/feedback" \
  -H "Content-Type: application/json" \
  -d '{"rating":5,"comment":"Very helpful service — thank you!"}'
```
- Sample cURL (list, AppAdmin):
```bash
curl -X GET "http://<HOST>/feedback" \
  -H "Authorization: Bearer <APP_ADMIN_TOKEN>" \
  -H "Accept: application/json"
```

## Elections

- Purpose: Facilitate secure and scheduled student elections, including candidate management, voting, and automated result computation.
- Core Entities:
  - **Election**: Defines the election period and status (`DRAFT`, `PUBLISHED`, `CLOSED`, `COUNTING`, `RESULTS_PUBLISHED`).
  - **Position**: Specific roles up for election (e.g., President, Secretary) with constraints like `maxVotesAllowed`.
  - **Candidate**: Students registered to run for specific positions.
  - **Vote**: Secure and validated records of student selections.
  - **ResultSnapshot**: Computed aggregates of votes per candidate, generated when an election concludes.
- Key Workflows:
  - **Setup**: Administrators create elections, define positions, and register candidates.
  - **Scheduling**: The system utilizes `agenda` to automatically transition election states based on `startDate` and `endDate` (auto-open, auto-close, and auto-count).
  - **Voting**: Students submit their ballots. The system validates selections to prevent duplicate votes for the same candidate and ensures constraints like `maxVotesAllowed` per position are respected.
  - **Results**: Once an election is closed, background jobs safely compute the final tally and generate a `ResultSnapshot` for authorized publication.

## Models

### Account

Represents a student's financial account record tied to an institution.

Fields:

- `institution` (ObjectId, ref Institution) — required
- `fullnames` — string
- `contractNumber` — string, required
- `courseOfStudy` — string
- `bankName` — string
- `accountNumber` — string
- `status` — `unconfirmed` | `confirmed` | `paid`, default `unconfirmed`
- `graduating` — boolean
- `batchNumber` — number
- `confirmationDate` — Date
- `paidAt` — Date
- `accountHolder` — ObjectId, ref Student
- `importedBy` — ObjectId, ref User (Finance user who uploaded)
- `paymentProof` — string (base64)

Indexes:

- `(institution, contractNumber)` unique
- `(institution, accountNumber)` unique

### User

Represents an admin or staff account (not a student).

Fields:

- `email` — string, unique, required
- `password` — string (hashed)
- `name` — string
- `surname` — string
- `role` — ref Role
- `institution` — ObjectId, ref Institution (optional, null for AppAdmin)
- `isActive` — boolean, default `true`
- `resetPasswordToken` — string
- `resetPasswordExpires` — Date

### Student

Represents a student user.

Fields:

- `studentId` — string, unique within institution
- `email` — string, unique, required
- `password` — string (hashed)
- `name` — string
- `surname` — string
- `institution` — ObjectId, ref Institution
- `studentStatus` — boolean, default `true`
- `role` — ref Role

### Institution

Fields:

- `name` — string, unique, required
- `email` — string
- `domain` — string
- `isLocked` — boolean, default `false`

### Role

Seeded roles: `AppAdmin`, `InstitutionAdmin`, `Finance`, `SAAD`, `student`.

### Issue

Tracks a discrepancy between what the student confirmed and the finance record.

Fields:

- `student` — ObjectId, ref Student
- `contractNumber` — string
- `correctedBankName` — string
- `correctedAccountNumber` — string
- `document` — string (base64)
- `status` — `open` | `resolved` | `rejected`, default `open`

### Feedback

Fields:

- `rating` — number (1–5), required
- `comment` — string, optional

### Election

States: `DRAFT`, `PUBLISHED`, `CLOSED`, `COUNTING`, `RESULTS_PUBLISHED`

Fields:

- `title` — string
- `description` — string
- `startDate` — Date
- `endDate` — Date
- `status` — enum above
- `institution` — ObjectId, ref Institution

### Candidate

Fields:

- `name` — string
- `surname` — string
- `studentId` — string
- `position` — ObjectId, ref Position
- `election` — ObjectId, ref Election
- `photo` — string (URL or base64)
- `bio` — string
- `isApproved` — boolean, default `false`
- `isDisqualified` — boolean, default `false`

### Position

Fields:

- `title` — string
- `description` — string
- `election` — ObjectId, ref Election
- `maxVotesAllowed` — number, default `1`
- `candidateCount` — number

### Ballot

Fields:

- `election` — ObjectId, ref Election
- `voter` — ObjectId, ref Student
- `votes` — array of `{ position: ObjectId, candidate: ObjectId }`
- `hash` — string (HMAC-SHA256)
- `receiptCode` — string (last 8 chars of hash)
- `submittedAt` — Date

### ResultSnapshot

Fields:

- `election` — ObjectId, ref Election
- `results` — array of position results with candidate vote counts
- `hash` — string
- `publishedAt` — Date
- `snapshotVersion` — number

### AuditLog

Fields:

- `action` — string (e.g. `http.POST`, `account.confirm`)
- `actor` — ObjectId, ref User/Student
- `actorEmail` — string
- `actorRole` — string
- `targetCollection` — string
- `targetId` — string
- `details` — Mixed
- `requestId` — string

---

## API Endpoints

### Authentication

`POST /auth/register`

Registers users. The payload depends on the role.

Student example:

```json
{
  "email": "name.surname@bothouniversity.com",
  "password": "SecretPassword123",
  "role": "Student",
  "studentId": "2437470"
}
```

`POST /auth/login`

Returns a JWT token.

```json
{
  "email": "admin@bothouniversity.com",
  "password": "AdminPass123"
}
```

`POST /auth/forgot-password`

Public endpoint. Sends a password reset email when the account exists.

```json
{
  "email": "admin@bothouniversity.com"
}
```

`POST /auth/reset-password`

Public endpoint. Completes the reset using the token from the email.

```json
{
  "email": "admin@bothouniversity.com",
  "token": "<token-from-email>",
  "password": "NewSecretPassword123"
}
```

### Students

`POST /students/upload`

Role: `InstitutionAdmin`

Upload a student Excel file using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `studentId`
- `email`
- `name`
- `surname`
- `studentStatus`

Rules:

- Only rows with all required columns are imported.
- Duplicate `studentId` or `email` values within the same institution are skipped.
- `studentStatus` accepts `true`, `1`, `active`, or `yes` as active.

### Accounts

`POST /accounts/upload`

Role: `Finance`

Upload an account spreadsheet using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `Fullnames`
- `Contract Number`
- `Course of Study`
- `Bank Name`
- `Account Number`

Optional columns:

- `Batch Number`  
  The current implementation assigns `batchNumber` on the server for each upload, based on the latest existing account batch for that institution.
- `Graduating`
- `Status`
- `Paid Date`

Rules:

- Only rows with all required fields are imported.
- Duplicate `contractNumber` or `accountNumber` values within the same institution are skipped.
- Each spreadsheet upload gets one batch number, and all records in that upload share it.

Example response:

```json
{
  "message": "Import completed",
  "result": {
    "inserted": 5,
    "skipped": 2,
    "errors": [],
    "skippedDetails": [
      { "row": 4, "reasons": ["Missing required fields: accountnumber"] },
      { "row": 7, "reasons": ["Duplicate contractNumber or accountNumber"] }
    ]
  }
}
```

`POST /accounts/confirm`

Role: `Student`

Students confirm their account details with JSON:

```json
{
  "contractNumber": "202511000516",
  "bankName": "FNB",
  "accountNumber": "63007006025",
  "graduating": true
}
```

Behavior:

- The account is matched by `contractNumber`.
- If bank name and account number match, the account is marked as confirmed.
- If there is a mismatch, an `Issue` is created or updated for the student.

`POST /accounts/resolve`

Role: `Student`

Students submit corrected details with `multipart/form-data`:

- `correctedBankName`
- `correctedAccountNumber`
- `document`  
  Required file upload

Behavior:

- Stores the corrected values and the uploaded document on the student's `Issue` record.
- `contractNumber` is optional for this submission.
- Finance later uses the issue to apply the correction.

`POST /accounts/finance-resolve`

Role: `Finance`

Body:

```json
{
  "studentId": "2437516"
}
```

Behavior:

- Loads the student's `Issue` record.
- Reads `correctedBankName` and `correctedAccountNumber`.
- Uses the issue's `contractNumber` to find the matching account.
- Updates the account, then deletes the issue after a successful save.

If the issue does not contain `contractNumber`, the endpoint returns `400`.

`POST /accounts/load_payed_students`

Role: `Finance`

Upload a spreadsheet using `multipart/form-data` with a `file` field.

Required columns in the first sheet:

- `Fullnames`
- `Contract Number`
- `Course of Study`
- `Bank Name`
- `Account Number`
- `Status`

Behavior:

- Only rows whose spreadsheet `Status` is `paid` are processed.
- The matching account must already exist in the database with status `confirmed`.
- Matching accounts are updated to `paid` and stamped with `paidAt = now`.
- Rows that do not match, are not confirmed, or do not have `Status = paid` are skipped.

### Account Reports

`GET /reports/accounts`

Role: `AppAdmin`, `InstitutionAdmin`, `Finance`

Returns the full report bundle with all 18 account reports for the current scope.

Query params:

- `institutionId` - optional for `AppAdmin` to scope reports to one institution
- `stuckDays` - optional threshold for the stuck-confirmed report, default `14`
- `recentDays` - optional window for recent payments, default `30`

`GET /reports/accounts/:reportKey`

Role: `AppAdmin`, `InstitutionAdmin`, `Finance`

Returns one report by key. Supported keys:

- `summary`
- `status-breakdown`
- `confirmation-overview`
- `payment-overview`
- `confirmed-not-paid`
- `by-batch`
- `by-bank`
- `by-course`
- `by-graduating`
- `by-institution`
- `imports-by-day`
- `confirmations-by-day`
- `payments-by-day`
- `average-import-to-confirm`
- `average-confirm-to-pay`
- `stuck-confirmed`
- `recent-payments`
- `anomalies`

Implementation notes:

- Reports are computed from the same scoped `Account` dataset to keep counts consistent.
- `status` is normalized to lowercase when the reports are calculated.
- `confirmationDate` and `paidAt` are used for timing and operational reports.

### Profile

`GET /profile`

Role: Any authenticated user

Returns the current user's profile.

`PUT /profile`

Role: Any authenticated user

Updates the current user's profile (name, surname, email, password).

### Users

All routes require `AppAdmin` or `InstitutionAdmin`.

`GET /users`

Lists users. Supports filtering by role and institution.

`GET /users/roles`

Lists available roles.

`GET /users/:id`

Gets a single user.

`PUT /users/:id`

Updates a user (name, surname, email, role, institution, `isActive`).

`DELETE /users/:id`

Deletes a user.

`GET /users/:id/status`

Toggles a user's `isActive` status.

### Institutions

All routes require `AppAdmin`.

`GET /institutions`

Lists all institutions.

`POST /institutions`

Creates an institution.

`PUT /institutions/:id`

Updates an institution.

`DELETE /institutions/:id`

Deletes an institution.

`POST /institutions/:id/lock`

Locks an institution.

`POST /institutions/:id/unlock`

Unlocks an institution.

`GET /institutions/:id/users`

Lists users for an institution (any authenticated user).

`POST /institutions/:id/users`

Creates a user scoped to the institution. Role: `AppAdmin` or `InstitutionAdmin`.

### Issues (Student)

All routes require authentication.

`GET /issues`

Lists issues for the authenticated student.

`POST /issues`

Creates an issue.

`DELETE /issues`

Deletes all issues for the authenticated student.

`GET /issues/:id`

Gets a single issue.

`PUT /issues/:id`

Updates an issue.

### Admin Issues

All routes require `Finance`.

`GET /admin/issues`

Lists all issues across students.

`GET /admin/issues/:id`

Gets a single issue.

`PUT /admin/issues/:id/approve`

Approves an issue — applies corrected bank/account from the issue to the matching account, then deletes the issue.

`PUT /admin/issues/:id/reject`

Rejects an issue — sets its status to `rejected`.

### AI / OCR

`POST /ai/validate-account`

Role: `Student`

Uses Google Gemini to validate account details. Sends an image (base64 JSON payload) and receives back structured account info extracted by AI.

`POST /ocr/server-ocr`

Role: `Student`

Uploads a document image file (multipart, field name `file`) for server-side OCR processing.

### Upload

`POST /upload`

Role: Any authenticated user

Uploads an image file (multipart, field name `file`) to Cloudinary. Returns the Cloudinary URL.

### Vote

All routes require authentication.

`POST /vote/submit`

Role: `Student`

Rate limited: 5 req / 60s

Submits a ballot. Also available at `POST /elections/:electionId/vote`.

`GET /vote/status`

Role: `Student`

Rate limited: 30 req / 60s

Returns whether the student has already voted in a given election.

`GET /vote/receipt/:id`

Role: `Student` or `SAAD`

Rate limited: 30 req / 60s

Returns vote receipt details by receipt ID.

## Audit Logging

Audit logging is enabled in two layers:

1. Global HTTP audit middleware logs every request and response.
2. Domain actions in controllers and services add business-level audit entries.

### Global HTTP audit middleware

The middleware records an audit entry for every request with these details:

- action: `http.<method>`
- path
- method
- status code
- duration
- `requestId` when available
- request body keys
- query keys
- actor metadata when the user is authenticated

It does not log full sensitive payloads.

### Domain audit actions currently used

- `account.confirm`
- `account.confirm.failed`
- `account.import`
- `account.resolve`
- `account.finance-resolve`
- `account.update`
- `issue.submit`
- `issue.submit.failed`
- `issue.resolve`
- `issue.resolve.failed`
- `feedback.create`
- `feedback.list`
- `candidate.create`
- `candidate.update`
- `candidate.approve`
- `candidate.disqualify`
- `candidate.delete`
- `candidate.import`
- `election.create`
- `election.update`
- `election.schedule`
- `election.publish`
- `election.open`
- `election.close`
- `election.archive`
- `election.delete`
- `results.publish`
- `results.compute`
- `position.create`
- `position.update`
- `position.deadline`
- `position.delete`
- `vote.cast`
- `admin.issue.resolve`
- `admin.issue.reject`
- `auth.login`
- `auth.login.failed`
- `auth.register`
- `auth.register.failed`
- `user.create`
- `user.update`
- `user.delete`
- `user.status`
- `institution.create`
- `institution.update`
- `institution.delete`

### Audit log endpoints

`GET /audit-logs`

Role: `AppAdmin`

Returns paginated audit logs sorted by newest first. All logs — HTTP middleware and domain actions — are stored in the `AuditLog` collection.

Query params (all optional):

| Param | Description |
|-------|-------------|
| `page` | Page number, default `1` |
| `limit` | Items per page, default `50`, max `500` |
| `search` | Global search across action, actorEmail, actorRole, targetCollection, targetId, details.path, and details.method |
| `action` | Filter by action name (regex) |
| `startDate` | Filter from this date (ISO) |
| `endDate` | Filter to this date (inclusive) |

`GET /audit-logs/export`

Role: `AppAdmin`

Downloads all audit logs as a `.txt` file in MongoDB Extended JSON format (`$oid`, `$date`, etc.).

### Audit log model

Audit entries are stored in the `AuditLog` collection.

Example query:

```js
db.auditlogs.find().sort({ createdAt: -1 }).limit(50);
```

## Useful Request Examples

Finance upload in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/upload`
- Headers: `Authorization: Bearer <FINANCE_JWT>`
- Body: `form-data`
  - key: `file`
  - type: `File`
  - value: your `.xlsx` file

Student resolve in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/resolve`
- Headers: `Authorization: Bearer <STUDENT_JWT>`
- Body: `form-data`
  - `correctedBankName`
  - `correctedAccountNumber`
  - `document` (file)

Finance resolve in Postman:

- Method: `POST`
- URL: `http://localhost:5000/accounts/finance-resolve`
- Headers: `Authorization: Bearer <FINANCE_JWT>`
- Body: `application/json`
  - `studentId`

### Elections Walkthrough

This section provides the endpoints and payloads in chronological order required to test an election from start to finish.

> **Note:** All endpoints below (except Login) require a JWT token in the request header: `Authorization: Bearer <your_jwt_token>`

#### 1. Authentication Phase

Log in as both the Admin (SAAD) and any students to obtain their JWT tokens.

**1.1 Admin Login**

`POST /auth/login`

```json
{
  "email": "saad@bothouniversity.com",
  "password": "StrongPassword123",
  "rememberMe": false
}
```

**1.2 Student Login**

`POST /auth/login`

Repeat for each student (e.g. Khothatso, Thato, Mpho), saving each token for use in the voting phase.

```json
{
  "email": "kh*****@bothouniversity.com",
  "password": "**********",
  "rememberMe": false
}
```

#### 2. Setup Phase

Role: `SAAD`

**2.1 Create an Election**

`POST /elections`

Save the returned `election._id` as `<ELECTION_ID>`.

```json
{
  "title": "SRC Presidential Elections 2026",
  "description": "General elections to elect the next SRC President.",
  "academicYear": "2026/2027",
  "timezone": "Africa/Gaborone",
  "votingRules": {
    "allowAbstain": false
  },
  "securitySettings": {
    "requireFaceAuth": false
  }
}
```

**2.2 Create a Position**

`POST /elections/<ELECTION_ID>/positions`

```json
{
  "title": "President",
  "description": "The President of the Student Representative Council",
  "maxVotesAllowed": 1,
  "displayOrder": 1
}
```

**2.3 Create Candidates**

`POST /elections/<ELECTION_ID>/positions/<POSITION_ID>/candidates`

> **Note:** This endpoint uses `multipart/form-data`. Configure the Body tab accordingly in Postman.

Form-data fields:

- `fullName`: "John Doe"
- `party`: "Student Alliance"
- `manifesto`: "I promise to bring better wifi."
- `studentId`: "STU2026001"
- `image`: Optional file upload

**2.4 Approve Candidate**

`POST /elections/candidates/<CANDIDATE_ID>/approve`

Candidates must be approved before they are eligible for voting. No request body required.

#### 3. Scheduling Phase

Role: `SAAD`

**3.1 Schedule the Election**

`POST /elections/<ELECTION_ID>/schedule`

> **Tip:** Set `startTime` to the past or present to open voting immediately. The Agenda background worker will transition the election status within 5 seconds.

```json
{
  "startTime": "2026-05-28T14:00:00+02:00",
  "endTime": "2026-05-28T20:00:00+02:00",
  "timezone": "Africa/Gaborone"
}
```

#### 4. Voting Phase

Role: `Student`

**4.1 Check Available Elections**

`GET /elections`

Confirm the target election is visible and its status is `OPEN`. No request body required.

**4.2 Cast a Vote**

`POST /elections/<ELECTION_ID>/vote`

Replace `<POSITION_ID>` and `<CANDIDATE_ID>` with the IDs created during the setup phase.

```json
{
  "selections": [
    {
      "positionId": "<POSITION_ID>",
      "candidateId": "<CANDIDATE_ID>"
    }
  ],
  "idempotencyKey": "vote-req-12345"
}
```

#### 5. Results Phase

After voting ends (or `endTime` passes), the system automatically closes the election and computes results.

**5.1 Publish Results**

Role: `SAAD`

`POST /elections/<ELECTION_ID>/publish-results`

No request body required.

**5.2 View Results**

Role: `SAAD`, `Student`

`GET /elections/<ELECTION_ID>/results`

No request body required.

**5.3 View Winners**

Role: `SAAD`, `Student`

`GET /elections/<ELECTION_ID>/results/winners`

No request body required.

## Important Notes

- `Account` has unique indexes on `institution + contractNumber` and `institution + accountNumber`.
- Student document uploads (issue resolution) are stored as base64 in the database. Cloudinary is used for candidate photo uploads when configured.
- `req.user` is attached by `requireAuth` and `requireRole` enforces role access.
- Controllers guard against undefined `req.body` before destructuring.
- Audit logs are accessible to `AppAdmin` only via `GET /audit-logs` (paginated) and `GET /audit-logs/export` (full download).
- Ballot hashing uses HMAC-SHA256 with `ELECTION_HMAC_SECRET` for integrity verification.
- Rate limiting is applied globally via `express-rate-limit` and separately for auth routes to mitigate brute-force attacks.

## Troubleshooting

- If uploads fail, confirm the request uses `multipart/form-data` and the file field name is correct.
- If a route returns `Forbidden`, confirm the JWT belongs to the correct role.
- If the server still shows old behavior, restart the dev process so it loads the latest compiled code.