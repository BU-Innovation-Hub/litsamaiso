# Litsamaiso API Contract

This document is the authoritative frontend contract for the Litsamaiso React client. It is derived from the running backend code and must be treated as source-of-truth for request/response shapes, validation, and permissions.

## 1. System Overview

**Purpose**
- Litsamaiso manages student account confirmations, issue resolution, feedback, and institutional elections (positions, candidates, voting, and results).

**Architecture**
- Node.js + Express API
- MongoDB via Mongoose models
- Agenda scheduler for election open/close/count jobs
- XLSX-based bulk imports for students/accounts
- Cloudinary for candidate image uploads
- Nodemailer for password reset and issue resolution emails

**Authentication**
- JWT Bearer token in `Authorization: Bearer <token>`
- JWT payload only includes `sub` (user id) plus `iat` and `exp`
- No refresh tokens

**Supported roles (case-insensitive)**
- AppAdmin
- InstitutionAdmin
- Finance
- SAAD
- Student (stored in DB as `student`)

---

## 2. Authentication Contract

### POST /auth/login
**Purpose**
- Authenticate user and return JWT + user context.

**Roles**
- Public

**Request Body (JSON)**
- `email` (string, required)
- `password` (string, required)
- `rememberMe` (boolean, optional) -> if true, token expires in 30d; otherwise `JWT_EXPIRES_IN`

**Response Body (200)**
```json
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": "<userId>",
    "email": "student@example.com",
    "role": { "_id": "<roleId>", "name": "student" },
    "institution": { "_id": "<institutionId>", "name": "Institution", "email": "info@inst.edu" },
    "studentId": "STU123",
    "faceDescriptor": [0.1, 0.2],
    "faceImageUrl": "https://..."
  }
}
```

**Example Request**
```json
{
  "email": "student@example.com",
  "password": "Secret123",
  "rememberMe": true
}
```

**Possible Errors**
- 400 `{ "message": "email and password are required" }`
- 401 `{ "message": "Invalid credentials" }`
- 429 `{ "message": "Too many requests" }`

**Frontend Notes**
- `user.role` and `user.institution` are populated objects.

---

### POST /auth/register
**Purpose**
- Register a user with a role and institution association.

**Roles**
- Public

**Request (multipart/form-data)**
- Text fields:
  - `email` (string, required)
  - `password` (string, required)
  - `role` (string, required; case-insensitive)
  - `institutionId` (string, required unless role is InstitutionAdmin, or Student with studentId)
  - `institutionName` (string, required if role is InstitutionAdmin)
  - `institutionEmail` (string, required if role is InstitutionAdmin)
  - `studentId` (string, required for Student confirmation path; see notes)
  - `faceImageBase64` (string, optional)
  - `faceDescriptor` (number array, optional)
  - `faceImageUrl` (string, optional)
- File fields:
  - `faceImage` (file, optional) -> accepted but currently **not used** by controller

**Response Body (201)**
```json
{
  "message": "User registered",
  "user": {
    "id": "<userId>",
    "email": "student@example.com",
    "role": "student",
    "institution": "<institutionId>",
    "studentId": "STU123",
    "faceDescriptor": [0.1, 0.2],
    "faceImageUrl": "https://..."
  }
}
```

**Example Request (multipart/form-data)**
```
email=student@example.com
password=Secret123
role=student
studentId=STU123
```

**Possible Errors**
- 400 `{ "message": "email, password, and role are required" }`
- 400 `{ "message": "Role not found. Available roles: ..." }`
- 400 `{ "message": "institutionId is required" }`
- 400 `{ "message": "Institution not found" }`
- 400 `{ "message": "institutionName and institutionEmail are required for InstitutionAdmin" }`
- 400 `{ "message": "Make sure you are registered first by your Institution Admin in the System" }`
- 400 `{ "message": "Email and the studentId must belong to the same person" }`
- 409 `{ "message": "Email already exists" }`
- 409 `{ "message": "Institution email already exists" }`

**Frontend Notes**
- Student registration is validated against pre-imported `Student` records.
- If `studentId` is provided, the institution is derived from the Student record; otherwise `institutionId` is required (except InstitutionAdmin).
- Student registration without `studentId` still requires the email to match a `Student` record within the provided institution.

---

### POST /auth/forgot-password
**Purpose**
- Request a password reset link.

**Roles**
- Public

**Request Body (JSON)**
- `email` (string, required)

**Response Body (200)**
```json
{
  "message": "If an account exists for that email, a password reset link has been sent"
}
```

**Example Request**
```json
{ "email": "user@example.com" }
```

**Possible Errors**
- 400 `{ "message": "email is required" }`
- 429 `{ "message": "Too many requests" }`

**Frontend Notes**
- Response is always success for privacy, even if email is not found.

---

### POST /auth/reset-password
**Purpose**
- Reset password using email + token.

**Roles**
- Public

**Request Body (JSON)**
- `email` (string, required)
- `token` (string, required)
- `password` (string, required)

**Response Body (200)**
```json
{ "message": "Password reset successful" }
```

**Possible Errors**
- 400 `{ "message": "email, token, and password are required" }`
- 400 `{ "message": "Invalid or expired reset token" }`
- 429 `{ "message": "Too many requests" }`

---

## 3. User Context Contract

**JWT Payload**
- `{ sub: "<userId>", iat: <number>, exp: <number> }`

**User Fields Returned By API**
- `email` (string)
- `role` (either string role name or populated object with `_id`, `name`)
- `institution` (either string id or populated object with `_id`, `name`, `email`)
- `studentId` (string, optional)
- `faceDescriptor` (number[], optional)
- `faceImageUrl` (string, optional)

**Current User Endpoint**
- None. Use login response or admin user endpoints.

---

## 4. Endpoint Registry

| Method | Endpoint | Auth | Roles | Purpose |
| --- | --- | --- | --- | --- |
| GET | / | No | Public | Basic API status message |
| GET | /health | No | Public | Health and DB status |
| POST | /auth/register | No | Public | Register user |
| POST | /auth/login | No | Public | Login |
| POST | /auth/forgot-password | No | Public | Request reset link |
| POST | /auth/reset-password | No | Public | Reset password |
| GET | /users | Yes | AppAdmin, InstitutionAdmin | List users |
| GET | /users/:id | Yes | AppAdmin, InstitutionAdmin | Get user |
| PUT | /users/:id | Yes | AppAdmin, InstitutionAdmin | Update user |
| DELETE | /users/:id | Yes | AppAdmin, InstitutionAdmin | Delete user |
| POST | /students/upload | Yes | InstitutionAdmin | Import students from Excel |
| POST | /accounts/upload | Yes | Finance | Import accounts from Excel |
| POST | /accounts/load_payed_students | Yes | Finance | Import paid accounts from Excel |
| GET | /accounts/export | Yes | AppAdmin, InstitutionAdmin, Finance | Export account records as CSV/XLSX |
| POST | /accounts/confirm | Yes | Student | Confirm account |
| POST | /accounts/resolve | Yes | Student | Submit issue resolution + document |
| POST | /accounts/finance-resolve | Yes | Finance | Apply issue resolution to account |
| GET | /reports/accounts | Yes | AppAdmin, InstitutionAdmin, Finance | Account reports catalog + all reports |
| GET | /reports/accounts/:reportKey | Yes | AppAdmin, InstitutionAdmin, Finance | Single account report |
| POST | /feedback | No | Public | Submit feedback |
| GET | /feedback | Yes | AppAdmin | List feedback |
| GET | /elections | Yes | SAAD, Student | List elections |
| GET | /elections/:id | Yes | SAAD, Student | Get election |
| POST | /elections | Yes | SAAD | Create election |
| PATCH | /elections/:id | Yes | SAAD | Update election |
| POST | /elections/:id/schedule | Yes | SAAD | Schedule election |
| POST | /elections/:id/publish | Yes | SAAD | Publish election (optionally schedule) |
| POST | /elections/:id/archive | Yes | SAAD | Archive election |
| POST | /elections/:id/publish-results | Yes | SAAD | Publish results |
| DELETE | /elections/:id | Yes | SAAD | Soft delete election |
| POST | /elections/:electionId/positions | Yes | SAAD | Create position |
| GET | /elections/:electionId/positions | Yes | SAAD, Student | List positions |
| GET | /elections/positions/:id | Yes | SAAD, Student | Get position |
| PATCH | /elections/positions/:id | Yes | SAAD | Update position |
| DELETE | /elections/positions/:id | Yes | SAAD | Delete position |
| POST | /elections/:electionId/positions/:positionId/candidates | Yes | SAAD | Create candidate (image upload) |
| GET | /elections/positions/:positionId/candidates | Yes | SAAD, Student | List candidates |
| PATCH | /elections/candidates/:id | Yes | SAAD | Update candidate (image upload) |
| POST | /elections/candidates/:id/approve | Yes | SAAD | Approve candidate |
| POST | /elections/candidates/:id/disqualify | Yes | SAAD | Disqualify candidate |
| DELETE | /elections/candidates/:id | Yes | SAAD | Delete candidate |
| POST | /elections/:electionId/vote | Yes | Student | Cast vote (path-based) |
| GET | /elections/:electionId/results | Yes | SAAD, Student | Get results snapshot |
| GET | /elections/:electionId/results/winners | Yes | SAAD, Student | Get winners |
| GET | /elections/:electionId/results/positions/:positionId | Yes | SAAD, Student | Get position results |
| POST | /elections/:electionId/results/recompute | Yes | SAAD | Recompute results |
| POST | /vote/submit | Yes | Student | Cast vote (body-based) |
| GET | /vote/status | Yes | Student | Get vote status |
| GET | /vote/receipt/:id | Yes | Student, SAAD | Get vote receipt |
| GET | /results/:electionId | Yes | SAAD, Student | Get results snapshot |
| GET | /results/:electionId/winners | Yes | SAAD, Student | Get winners |
| GET | /results/:electionId/positions/:positionId | Yes | SAAD, Student | Get position results |
| POST | /results/:electionId/recompute | Yes | SAAD | Recompute results |

---

## 5. Domain Contracts

### Students

#### POST /students/upload
**Auth**: Yes (InstitutionAdmin)

**Request (multipart/form-data)**
- `file` (required) -> Excel file

**Validation Rules (Excel Columns)**
Required columns (case-insensitive, lowercased only; spaces are not removed):
- `studentid`
- `email`
- `name`
- `surname`
- `studentstatus`

`studentStatus` is treated as true if value is one of: `true`, `1`, `active`, `yes` (case-insensitive). Others are false.

**Response**
```json
{
  "message": "Import completed",
  "result": {
    "inserted": 10,
    "skipped": 2,
    "errors": ["Row 5: ..."]
  }
}
```

**Errors**
- 400 `{ "message": "Missing file upload" }`
- 500 `{ "message": "<xlsx or import error>" }`

**Frontend Implications**
- Show row-level errors if present.
- Duplicates by studentId or email are skipped silently.

---

### Accounts

#### POST /accounts/upload
**Auth**: Yes (Finance)

**Request (multipart/form-data)**
- `file` (required) -> Excel file

**Required Columns (normalized)**
- `contractnumber`
- `accountnumber`
- `bankname`
- `courseofstudy`
- `fullnames`

Optional columns used if present:
- `graduating` (boolean-like)
- `status` (string)
- `paiddate` (date)

**Response**
```json
{
  "message": "Import completed",
  "result": {
    "inserted": 10,
    "skipped": 2,
    "errors": ["Row 6: ..."],
    "skippedDetails": [
      { "row": 3, "reasons": ["Duplicate contractNumber or accountNumber"] }
    ]
  }
}
```

**Errors**
- 400 `{ "message": "Missing file upload" }`
- 500 `{ "message": "<xlsx or import error>" }`

**Frontend Implications**
- Import creates `Account` records with `status` (default string value `"undefined"` if not in sheet).

---

#### POST /accounts/load_payed_students
**Auth**: Yes (Finance)

**Request (multipart/form-data)**
- `file` (required) -> Excel file

**Required Columns (normalized)**
- `contractnumber`
- `accountnumber`
- `bankname`
- `courseofstudy`
- `fullnames`
- `status` (must be `paid`)

**Response**
```json
{
  "message": "Paid accounts import completed",
  "result": {
    "updated": 8,
    "skipped": 4,
    "errors": ["Row 4: ..."],
    "skippedDetails": [
      { "row": 7, "reasons": ["Account details do not match the spreadsheet row"] }
    ]
  }
}
```

**Errors**
- 400 `{ "message": "Missing file upload" }`
- 500 `{ "message": "<xlsx or import error>" }`

---

#### GET /accounts/export
**Auth**: Yes (AppAdmin, InstitutionAdmin, Finance)

**Query Params**
- `format` (string, optional) -> `csv` default, or `xlsx`
- `search` (string, optional)
- `status` (string, optional)
- `batchNumber` (number, optional)
- `startDate` (date string, optional) -> filters by `confirmationDate`
- `endDate` (date string, optional) -> filters by `confirmationDate`
- `institutionId` (string, optional, only respected for AppAdmin)
- `limit` (number, optional, default 5000, max 50000)

**Response**
- File download with `Content-Disposition: attachment`
- CSV uses `text/csv; charset=utf-8`
- XLSX uses `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Export Columns**
`First Name`, `Surname`, `Full Names`, `Contract Number`, `Course of Study`, `Bank Name`, `Account Number`, `Student ID`, `Status`, `Graduating`, `Batch Number`, `Confirmation Date`, `Paid Date`, `Signature`, `Created At`, `Updated At`

**Notes**
- `First Name`, `Surname`, and `Student ID` come from the confirming student when available.
- `First Name` and `Surname` fall back to splitting `Full Names` for unconfirmed records.
- `Signature` is exported as a blank column because it is not stored in the current account/student schema.

---

#### POST /accounts/confirm
**Auth**: Yes (Student)

**Request Body (JSON)**
- `contractNumber` (string, required)
- `bankName` (string, required)
- `accountNumber` (string, required)
- `graduating` (boolean or boolean-like string, optional)

**Response**
```json
{
  "message": "Account confirmed",
  "result": {
    "accountId": "<accountId>",
    "confirmationDate": "2024-01-01T12:00:00.000Z",
    "status": "confirmed",
    "alreadyConfirmed": false,
    "graduating": true
  }
}
```

**Errors**
- 400 `{ "message": "Enter your correct NMDS contract number" }`
- 400 `{ "message": "bankName and accountNumber are required" }`
- 400 `{ "message": "Student identifier (studentId) is required for confirmation" }`
- 400 `{ "message": "Student record not found for the logged in user" }`
- 400 `{ "message": "Account details do not match. Issue created for finance review" }`
- 400 `{ "message": "This account was already confirmed by another student" }`

**Frontend Implications**
- A mismatch creates or updates an `Issue` and returns 400.

---

#### POST /accounts/resolve
**Auth**: Yes (Student)

**Purpose**
- Submit corrected bank details and a supporting document for finance review.

**Request (multipart/form-data)**
- Text fields:
  - `correctedBankName` (string, required)
  - `correctedAccountNumber` (string, required)
- File fields:
  - `document` (file, required)

**Response (201)**
```json
{ "message": "Details sent to Finance department, and they will resolve the issue" }
```

**Errors**
- 400 `{ "message": "Logged-in user has no studentId" }`
- 400 `{ "message": "correctedBankName and correctedAccountNumber are required" }`
- 400 `{ "message": "Missing document upload" }`
- 404 `{ "message": "Student record not found" }`

---

#### POST /accounts/finance-resolve
**Auth**: Yes (Finance)

**Request Body (JSON)**
- `studentId` (string, required)

**Response**
```json
{ "message": "Account updated from issue details" }
```

**Errors**
- 400 `{ "message": "studentId is required" }`
- 404 `{ "message": "Issue not found for studentId" }`
- 400 `{ "message": "Issue does not contain correctedBankName and correctedAccountNumber" }`
- 404 `{ "message": "Student record not found" }`
- 400 `{ "message": "Issue does not contain contractNumber" }`
- 404 `{ "message": "Account not found for contractNumber" }`

---

### Issues

There are **no public endpoints** to list or fetch issues. Issues are created automatically by:
- `/accounts/confirm` mismatches
- `/accounts/resolve` student submissions

Finance resolves issues via `/accounts/finance-resolve`.

---

### Reports

#### GET /reports/accounts
**Auth**: Yes (AppAdmin, InstitutionAdmin, Finance)

**Query Params**
- `institutionId` (string, optional, only respected for AppAdmin)
- `stuckDays` (number > 0, optional)
- `recentDays` (number > 0, optional)

**Response**
```json
{
  "message": "Account reports generated",
  "scope": {
    "institutionId": "<id>",
    "institutionName": "Institution",
    "allInstitutions": false
  },
  "reports": { /* see Reports Contract section */ },
  "catalog": [
    { "key": "summary", "title": "Summary", "description": "High level totals for all accounts in scope." }
  ]
}
```

---

#### GET /reports/accounts/:reportKey
**Auth**: Yes (AppAdmin, InstitutionAdmin, Finance)

**Path Params**
- `reportKey` (string; normalized to lower-case kebab form)

**Query Params**
- `institutionId` (string, optional, only respected for AppAdmin)
- `stuckDays` (number > 0, optional)
- `recentDays` (number > 0, optional)

**Response**
```json
{
  "message": "Account report generated",
  "scope": { "institutionId": "<id>", "institutionName": "Institution", "allInstitutions": false },
  "reportKey": "summary",
  "report": { /* specific report */ },
  "catalog": [ /* same as /reports/accounts */ ]
}
```

**Errors**
- 400 `{ "message": "reportKey is required" }`
- 400 `{ "message": "Unknown report key: <key>" }`

---

### Feedback

#### POST /feedback
**Auth**: No

**Request Body (JSON)**
- `rating` (number, required, integer 1-5)
- `comment` (string, optional)

**Response**
```json
{ "message": "Thank you for your feedback" }
```

**Errors**
- 400 `{ "message": "rating must be an integer between 1 and 5" }`

---

#### GET /feedback
**Auth**: Yes (AppAdmin)

**Response**
```json
{ "feedbacks": [ { "_id": "<id>", "rating": 5, "comment": "Great", "createdAt": "...", "updatedAt": "...", "__v": 0 } ] }
```

---

### Elections

See the dedicated Elections Contract section below for full details.

---

### Audit Logs

There are **no public endpoints** to read audit logs. All requests are recorded internally with:
- action, actorId/email/role (if authenticated), target info, and details.

---

## 6. Upload Contracts

### /auth/register (multipart/form-data)
- **File field**: `faceImage` (optional)
- **Notes**: File is accepted but not used by the controller. Use `faceImageBase64` or `faceImageUrl` if needed.
- **Constraints**: No file type or size validation.

### /students/upload
- **File field**: `file` (required)
- **Type**: Excel (XLSX reader)
- **Constraints**: No size/type validation; required columns as listed in Students section.

### /accounts/upload
- **File field**: `file` (required)
- **Type**: Excel (XLSX reader)
- **Constraints**: No size/type validation; required columns as listed in Accounts section.

### /accounts/load_payed_students
- **File field**: `file` (required)
- **Type**: Excel (XLSX reader)
- **Constraints**: No size/type validation; required columns as listed in Accounts section.

### /accounts/resolve
- **File field**: `document` (required)
- **Type**: Any (stored as base64)
- **Constraints**: No size/type validation.

### /elections/:electionId/positions/:positionId/candidates
- **File field**: `image` (optional)
- **Type**: `image/*` only
- **Size limit**: 5 MB
- **Errors**: 400 `{ "message": "Only image uploads are allowed" }` or `{ "message": "Invalid image upload" }`

### /elections/candidates/:id (PATCH)
- Same image rules as above.

---

## 7. Reports Contract

**Available Report Keys**
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

**Report Response Shapes**
- `summary`:
```json
{
  "total": 120,
  "confirmed": 40,
  "paid": 10,
  "unconfirmed": 70,
  "confirmationRate": 0.3333,
  "paymentRate": 0.0833
}
```
- `status-breakdown` / `by-batch` / `by-bank` / `by-course`:
```json
[{ "label": "paid", "count": 10 }]
```
- `confirmation-overview` / `payment-overview`:
```json
{ "total": 120, "matching": 40, "others": 80, "rate": 0.3333 }
```
- `confirmed-not-paid`:
```json
{
  "total": 6,
  "accounts": [
    {
      "contractNumber": "CN123",
      "accountNumber": "001234",
      "bankName": "Bank",
      "courseOfStudy": "CS",
      "fullnames": "A B",
      "batchNumber": 2,
      "confirmationDate": "2024-01-01T12:00:00.000Z",
      "institution": "<institutionId>"
    }
  ]
}
```
- `by-graduating`:
```json
{ "true": 10, "false": 110 }
```
- `by-institution`:
```json
[{ "institutionId": "<id>", "institutionName": "Inst", "institutionEmail": "info@inst.edu", "count": 50 }]
```
- `imports-by-day` / `confirmations-by-day` / `payments-by-day`:
```json
[{ "date": "2024-01-01", "count": 3 }]
```
- `average-import-to-confirm` / `average-confirm-to-pay`:
```json
{ "count": 20, "averageDays": 2.5 }
```
- `stuck-confirmed`:
```json
{
  "thresholdDays": 14,
  "thresholdDate": "2024-01-01T00:00:00.000Z",
  "total": 2,
  "accounts": [ { "contractNumber": "CN1", "accountNumber": "001", "bankName": "Bank", "courseOfStudy": "CS", "fullnames": "A B", "confirmationDate": "2023-12-01T12:00:00.000Z", "institution": "<id>" } ]
}
```
- `recent-payments`:
```json
{
  "windowDays": 30,
  "thresholdDate": "2024-01-01T00:00:00.000Z",
  "total": 5,
  "byDay": [ { "date": "2024-01-10", "count": 2 } ],
  "latest": [ { "contractNumber": "CN1", "accountNumber": "001", "bankName": "Bank", "courseOfStudy": "CS", "fullnames": "A B", "paidAt": "2024-01-10T12:00:00.000Z", "institution": "<id>" } ]
}
```
- `anomalies`:
```json
{
  "total": 1,
  "anomalies": [
    { "contractNumber": "CN1", "accountNumber": "001", "bankName": "Bank", "courseOfStudy": "CS", "fullnames": "A B", "status": "paid", "issues": ["paid status without paidAt"], "institution": "<id>" }
  ]
}
```

**Filters and Query Params**
- `stuckDays` controls `stuck-confirmed` threshold.
- `recentDays` controls `recent-payments` window.
- `institutionId` (AppAdmin only) scopes reports to a specific institution.

**Chart-Friendly Fields**
- `importsByDay`, `confirmationsByDay`, `paymentsByDay` -> line or bar charts
- `statusBreakdown`, `byBatch`, `byBank`, `byCourse` -> bar/pie charts
- `summary`, `confirmationOverview`, `paymentOverview` -> KPI cards

**Table-Friendly Fields**
- `confirmedNotPaid.accounts`
- `stuckConfirmed.accounts`
- `recentPayments.latest`
- `anomalies.anomalies`

**Summary Fields**
- `summary`, `confirmationOverview`, `paymentOverview`, averages

---

## 8. Elections Contract

### Election Lifecycle (actual statuses)
- `DRAFT`
- `SCHEDULED`
- `OPEN`
- `CLOSED`
- `COUNTING`
- `RESULTS_PUBLISHED`
- `ARCHIVED`

**Notes**
- `published` is a boolean separate from `status`.
- Student visibility requires `published = true` and `archived = false`.

### Election Endpoints

#### POST /elections
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- `title` (string, required, min 3)
- `description` (string, optional)
- `academicYear` (string, optional)
- `timezone` (string, optional, default `UTC`)
- `votingRules` (object, optional)
- `securitySettings` (object, optional)

**Response (201)**
```json
{ "message": "Election created", "election": { "_id": "<id>", "title": "...", "status": "DRAFT", "published": false, "archived": false, "resultsPublished": false } }
```

**Errors**
- 400 `{ "message": "title is required" }`

---

#### PATCH /elections/:id
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- Any of: `title`, `description`, `academicYear`, `timezone`, `votingRules`, `securitySettings`

**Response**
```json
{ "message": "Election updated", "election": { "_id": "<id>", "title": "..." } }
```

**Errors**
- 400 `{ "message": "Election is frozen and cannot be edited" }`
- 404 `{ "message": "Election not found" }`

---

#### POST /elections/:id/schedule
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- `startTime` (date string, required)
- `endTime` (date string, required)
- `timezone` (string, optional)

**Response**
```json
{ "message": "Election scheduled", "election": { "status": "SCHEDULED", "published": true } }
```

**Errors**
- 400 `{ "message": "startTime is required" }`
- 400 `{ "message": "endTime must be after startTime" }`

---

#### POST /elections/:id/publish
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- If `startTime` and `endTime` provided, this behaves like schedule.
- If not, it only sets `published = true`.

**Response**
```json
{ "message": "Election published", "election": { "published": true } }
```

---

#### POST /elections/:id/archive
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Election archived", "election": { "status": "ARCHIVED", "archived": true } }
```

**Errors**
- 400 `{ "message": "Only closed elections can be archived" }`

---

#### POST /elections/:id/publish-results
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Results published", "election": { "resultsPublished": true, "status": "RESULTS_PUBLISHED" } }
```

**Errors**
- 400 `{ "message": "No results snapshot found. Run counting first." }`

---

#### DELETE /elections/:id
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Election deleted" }
```

---

### Position Endpoints

#### POST /elections/:electionId/positions
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- `title` (string, required, min 2)
- `description` (string, optional)
- `maxVotesAllowed` (number, optional, min 1, default 1)
- `displayOrder` (number, optional, min 1; default next sequential)

**Response (201)**
```json
{ "message": "Position created", "position": { "_id": "<id>", "title": "...", "maxVotesAllowed": 1, "displayOrder": 1, "isActive": true } }
```

---

#### GET /elections/:electionId/positions
**Auth**: Yes (SAAD, Student)

**Response**
```json
{ "positions": [ { "_id": "<id>", "title": "...", "isActive": true } ] }
```

**Student Visibility**
- Requires election `published=true` and `archived=false`.
- Only positions where `isActive=true` are returned.

---

#### PATCH /elections/positions/:id
**Auth**: Yes (SAAD)

**Request Body (JSON)**
- Any of: `title`, `description`, `maxVotesAllowed`, `displayOrder`, `isActive`

**Response**
```json
{ "message": "Position updated", "position": { "_id": "<id>" } }
```

---

### Candidate Endpoints

#### POST /elections/:electionId/positions/:positionId/candidates
**Auth**: Yes (SAAD)

**Request (multipart/form-data)**
- Text fields:
  - `fullName` (string, required, min 3)
  - `party` (string, optional)
  - `manifesto` (string, optional)
  - `studentId` (string, optional)
- File fields:
  - `image` (optional, image/*, max 5MB)

**Response (201)**
```json
{ "message": "Candidate created", "candidate": { "_id": "<id>", "fullName": "...", "approved": false, "disqualified": false } }
```

---

#### GET /elections/positions/:positionId/candidates
**Auth**: Yes (SAAD, Student)

**Response**
```json
{ "candidates": [ { "_id": "<id>", "fullName": "...", "approved": true, "disqualified": false } ] }
```

**Student Visibility**
- Requires election `published=true` and `archived=false`.
- Only `approved=true` and `disqualified=false` candidates are returned.

---

#### PATCH /elections/candidates/:id
**Auth**: Yes (SAAD)

**Request (multipart/form-data)**
- Any of: `fullName`, `party`, `manifesto`, `imageUrl`, `approved`, `disqualified`
- `image` file replaces `imageUrl` via Cloudinary

**Response**
```json
{ "message": "Candidate updated", "candidate": { "_id": "<id>" } }
```

---

#### POST /elections/candidates/:id/approve
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Candidate approved", "candidate": { "_id": "<id>", "approved": true } }
```

---

#### POST /elections/candidates/:id/disqualify
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Candidate disqualified", "candidate": { "_id": "<id>", "disqualified": true } }
```

---

### Voting Endpoints

#### POST /elections/:electionId/vote
**Auth**: Yes (Student)

**Headers**
- `Idempotency-Key` (string, optional)

**Request Body (JSON)**
- `selections` (array, required)
  - `{ positionId: string, candidateId: string }`

**Response (201)**
```json
{
  "message": "Vote cast",
  "receipt": {
    "receiptId": "<uuid>",
    "ballotHash": "<hmac>",
    "submittedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Validation Rules**
- Election must be `OPEN` and within `startTime`/`endTime` if set.
- Student must have `studentId` and `studentStatus=true`.
- Each position must have 1..`maxVotesAllowed` selections unless `votingRules.allowAbstain=true`.
- Candidates must be approved and not disqualified.

**Errors**
- 400 `{ "message": "Election is not open" }`
- 400 `{ "message": "Election has not started" }`
- 400 `{ "message": "Election has ended" }`
- 400 `{ "message": "Student account is required to vote" }`
- 403 `{ "message": "Student is not eligible to vote" }`
- 400 `{ "message": "Selections are required" }`
- 400 `{ "message": "Invalid position in selections" }`
- 400 `{ "message": "Invalid candidate selection" }`
- 409 `{ "message": "You have already voted" }`

**Rate Limit**
- 5 requests per minute (returns 429)

---

#### POST /vote/submit
Same behavior as `/elections/:electionId/vote`, but `electionId` is in the body.

**Request Body**
```json
{ "electionId": "<id>", "selections": [ { "positionId": "<id>", "candidateId": "<id>" } ] }
```

**Errors**
- 400 `{ "message": "electionId is required" }`

---

#### GET /vote/status
**Auth**: Yes (Student)

**Query Params**
- `electionId` (string, required)

**Response**
```json
{ "status": { "hasVoted": true, "receiptId": "<uuid>", "submittedAt": "2024-01-01T12:00:00.000Z" } }
```

**Rate Limit**
- 30 requests per minute (returns 429)

---

#### GET /vote/receipt/:id
**Auth**: Yes (Student, SAAD)

**Response**
```json
{ "receipt": { "receiptId": "<uuid>", "ballotHash": "<hmac>", "submittedAt": "2024-01-01T12:00:00.000Z", "electionId": "<id>" } }
```

**Rate Limit**
- 30 requests per minute (returns 429)

---

### Results Endpoints

#### GET /elections/:electionId/results
#### GET /results/:electionId
**Auth**: Yes (SAAD, Student)

**Response**
```json
{ "snapshot": { "_id": "<id>", "electionId": "<id>", "generatedAt": "...", "positions": [ { "positionId": "<id>", "rankings": [ { "candidateId": "<id>", "votes": 10, "percentage": 55.5, "rank": 1 } ], "winnerId": "<id>" } ], "snapshotHash": "<hmac>" } }
```

**Student Access**
- Denied if `resultsPublished=false` with 403 `{ "message": "Results not published" }`

---

#### GET /elections/:electionId/results/winners
#### GET /results/:electionId/winners
**Auth**: Yes (SAAD, Student)

**Response**
```json
{ "winners": { "generatedAt": "...", "winners": [ { "positionId": "<id>", "positionTitle": "President", "candidateId": "<id>", "candidateName": "A B", "votes": 10, "percentage": 55.5, "rank": 1 } ] } }
```

---

#### GET /elections/:electionId/results/positions/:positionId
#### GET /results/:electionId/positions/:positionId
**Auth**: Yes (SAAD, Student)

**Response**
```json
{ "position": { "generatedAt": "...", "positionId": "<id>", "positionTitle": "President", "rankings": [ { "candidateId": "<id>", "candidateName": "A B", "votes": 10, "percentage": 55.5, "rank": 1 } ] } }
```

---

#### POST /elections/:electionId/results/recompute
#### POST /results/:electionId/recompute
**Auth**: Yes (SAAD)

**Response**
```json
{ "message": "Results computed", "snapshot": { "_id": "<id>", "snapshotHash": "<hmac>" } }
```

**Errors**
- 400 `{ "message": "Election must be closed before counting" }`

---

## 9. Error Contract

There is no single global error wrapper. Most errors are returned as:

```json
{ "message": "..." }
```

**Status codes observed**
- 400: validation and business rule failures
- 401: missing/invalid auth token
- 403: forbidden or results not published
- 404: resource not found
- 409: conflict (already voted, duplicate email, etc.)
- 422: not explicitly used
- 429: rate limit (`{ "message": "Too many requests" }` + `Retry-After` header)
- 500: server error (`{ "message": "..." }`)

---

## 10. Frontend DTO Definitions (TypeScript)

```ts
export type MongoId = string;

export interface RoleRef {
  _id: MongoId;
  name: string;
}

export interface InstitutionRef {
  _id: MongoId;
  name: string;
  email: string;
}

export interface LoginUser {
  id: string;
  email: string;
  role: RoleRef;
  institution: InstitutionRef;
  studentId?: string;
  faceDescriptor?: number[];
  faceImageUrl?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: LoginUser;
}

export interface RegisterUser {
  id: string;
  email: string;
  role: string; // role name
  institution: MongoId;
  studentId?: string;
  faceDescriptor?: number[];
  faceImageUrl?: string;
}

export interface RegisterResponse {
  message: string;
  user: RegisterUser;
}

export interface UserListItem {
  _id: MongoId;
  email: string;
  role: RoleRef;
  institution: InstitutionRef;
  studentId?: string;
  faceImageUrl?: string;
  __v?: number;
}

export interface UserListResponse {
  users: UserListItem[];
}

export interface UserUpdateResponse {
  message: string;
  user: {
    id: MongoId;
    email: string;
    role: MongoId;
    institution: MongoId;
  };
}

export interface StudentImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export interface AccountImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  skippedDetails: Array<{ row: number; reasons: string[] }>;
}

export interface PaidImportResult {
  updated: number;
  skipped: number;
  errors: string[];
  skippedDetails: Array<{ row: number; reasons: string[] }>;
}

export interface AccountConfirmationResult {
  accountId: MongoId;
  confirmationDate: string;
  status: string;
  alreadyConfirmed: boolean;
  graduating?: boolean;
}

export interface FeedbackItem {
  _id: MongoId;
  rating: number;
  comment?: string;
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface Election {
  _id: MongoId;
  title: string;
  description?: string;
  academicYear?: string;
  status: "DRAFT" | "SCHEDULED" | "OPEN" | "CLOSED" | "COUNTING" | "RESULTS_PUBLISHED" | "ARCHIVED";
  startTime?: string;
  endTime?: string;
  timezone?: string;
  createdBy: MongoId;
  institution: MongoId;
  published: boolean;
  archived: boolean;
  resultsPublished: boolean;
  votingRules?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
  deletedAt?: string | null;
  deletedBy?: MongoId | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface Position {
  _id: MongoId;
  electionId: MongoId;
  title: string;
  description?: string;
  maxVotesAllowed: number;
  displayOrder: number;
  isActive: boolean;
  deletedAt?: string | null;
  deletedBy?: MongoId | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface Candidate {
  _id: MongoId;
  electionId: MongoId;
  positionId: MongoId;
  studentId?: string;
  fullName: string;
  party?: string;
  manifesto?: string;
  imageUrl?: string;
  approved: boolean;
  disqualified: boolean;
  voteCountCached: number;
  deletedAt?: string | null;
  deletedBy?: MongoId | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface VoteSelection {
  positionId: MongoId;
  candidateId: MongoId;
}

export interface VoteReceipt {
  receiptId: string;
  ballotHash: string;
  submittedAt: string;
  electionId?: MongoId; // included in receipt lookup
}

export interface VoteStatus {
  hasVoted: boolean;
  receiptId?: string;
  submittedAt?: string;
}

export interface ResultRanking {
  candidateId: MongoId;
  votes: number;
  percentage: number;
  rank: number;
  candidateName?: string;
}

export interface ResultPosition {
  positionId: MongoId;
  positionTitle?: string;
  rankings: ResultRanking[];
  winnerId?: MongoId | null;
}

export interface ResultSnapshot {
  _id: MongoId;
  electionId: MongoId;
  generatedAt: string;
  positions: Array<{
    positionId: MongoId;
    rankings: Array<{ candidateId: MongoId; votes: number; percentage: number; rank: number }>;
    winnerId?: MongoId | null;
  }>;
  snapshotHash: string;
  generatedBy?: MongoId;
}
```

---

## 11. Frontend Feature Matrix

| Feature | Endpoint(s) | Roles | Example |
| --- | --- | --- | --- |
| Student Login | POST /auth/login | Public | Login form with email/password |
| Student Account Confirmation | POST /accounts/confirm | Student | Confirm contract/bank details |
| Account Upload | POST /accounts/upload | Finance | Finance bulk import screen |
| Student Import | POST /students/upload | InstitutionAdmin | Institution student list import |
| Issue Resolution (Student) | POST /accounts/resolve | Student | Upload corrected bank doc |
| Issue Resolution (Finance) | POST /accounts/finance-resolve | Finance | Apply issue corrections |
| Elections | GET /elections | SAAD, Student | Elections list |
| Positions Management | POST/GET/PATCH/DELETE /elections/.../positions | SAAD | Admin positions UI |
| Candidate Management | POST/GET/PATCH/DELETE /elections/.../candidates | SAAD | Admin candidates UI |
| Voting | POST /elections/:electionId/vote or /vote/submit | Student | Vote screen |
| Results Dashboard | GET /elections/:electionId/results/winners | SAAD, Student | Winners card |
| Feedback Submission | POST /feedback | Public | Feedback form |
| Reports Dashboard | GET /reports/accounts | AppAdmin, InstitutionAdmin, Finance | Reports dashboard |

---

## 12. Frontend Route Suggestions

Only routes supported by existing API functionality:
- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/dashboard`
- `/students/import`
- `/accounts/import`
- `/accounts/confirm`
- `/accounts/issues`
- `/reports/accounts`
- `/feedback`
- `/elections`
- `/elections/:id`
- `/elections/:id/positions`
- `/elections/:id/candidates`
- `/elections/:id/vote`
- `/elections/:id/results`

---

## 13. AI Agent Rules

### Frontend Contract Rules
- Never invent endpoints that are not in this document.
- Never invent response fields; use only documented shapes.
- Never implement backend business logic on the client.
- Never calculate reports client-side; use `/reports` endpoints.
- Never enforce permissions client-side; always rely on API responses.
- Treat all role checks as case-insensitive (server does).
- Use multipart/form-data only for endpoints documented as uploads.
# Litsamaiso API Contract

This document is the authoritative frontend contract for the Litsamaiso API.
All behavior is derived from the current backend code. Do not invent endpoints or fields.

Base URL: not hard-coded in the server. Use your deployed host.
Default content type: application/json unless noted as multipart/form-data.

---

## 1. System Overview

### Application purpose
- Manage student accounts, confirmations, and finance issue resolution.
- Run institutional elections (positions, candidates, voting, and results).
- Provide reports and dashboards for account processing.
- Collect public feedback.

### Architecture
- Express + TypeScript + MongoDB (Mongoose).
- REST endpoints grouped by domain.
- Audit logging on every request (server-side).

### Authentication method
- Bearer JWT in `Authorization` header: `Bearer <token>`.
- JWT payload contains only `sub` (user id) plus `iat`/`exp`.

### Supported user roles (case-insensitive)
- AppAdmin
- InstitutionAdmin
- Finance
- SAAD
- Student (stored as `student` in seed data)

Authorization uses `requireRole()` and compares role names case-insensitively.

---

## 2. Authentication Contract

### POST /auth/login
**Purpose**: Authenticate a user and return a JWT and user profile.

**Roles**: Public

**Request Body (JSON)**
- `email` (string, required)
- `password` (string, required)
- `rememberMe` (boolean, optional) -> if true, token expires in 30d

**Response Body (200)**
```
{
  "message": "Login successful",
  "token": "<jwt>",
  "user": {
    "id": "<userId>",
    "email": "user@example.com",
    "role": { "_id": "<roleId>", "name": "student" },
    "institution": { "_id": "<instId>", "name": "Inst", "email": "info@inst.edu" },
    "studentId": "S12345",
    "faceDescriptor": [0.01, 0.02],
    "faceImageUrl": "https://..."
  }
}
```

**Example Request**
```
POST /auth/login
Content-Type: application/json

{
  "email": "student@example.com",
  "password": "secret",
  "rememberMe": true
}
```

**Possible Errors**
- 400 `{ "message": "email and password are required" }`
- 401 `{ "message": "Invalid credentials" }`
- 429 `{ "message": "Too many requests" }` (rate limit)

**Frontend Notes**
- Rate limit: 10 requests per 15 minutes per user+IP.
- Store `token` and include it in `Authorization` header.

---

### POST /auth/register
**Purpose**: Register a new user (including InstitutionAdmin and Student flows).

**Roles**: Public

**Request (multipart/form-data)**
Text fields are read from body. Optional file field is accepted but not used by controller.

Fields:
- `email` (string, required)
- `password` (string, required)
- `role` (string, required)
- `institutionId` (string, required for non-InstitutionAdmin roles unless Student with `studentId` and matching record)
- `institutionName` (string, required only for `InstitutionAdmin`)
- `institutionEmail` (string, required only for `InstitutionAdmin`)
- `studentId` (string, optional; required for some Student flows)
- `faceImageBase64` (string, optional)
- `faceDescriptor` (number[], optional)
- `faceImageUrl` (string, optional)
- `faceImage` (file, optional; field name is supported but not processed)

**Response Body (201)**
```
{
  "message": "User registered",
  "user": {
    "id": "<userId>",
    "email": "student@example.com",
    "role": "student",
    "institution": "<institutionId>",
    "studentId": "S12345",
    "faceDescriptor": [0.01, 0.02],
    "faceImageUrl": "https://..."
  }
}
```

**Example Request**
```
POST /auth/register
Content-Type: multipart/form-data

email=student@example.com
password=secret
role=student
studentId=S12345
faceDescriptor[]=0.01
faceDescriptor[]=0.02
```

**Possible Errors**
- 400 `{ "message": "email, password, and role are required" }`
- 400 `{ "message": "Role not found. Available roles: ..." }`
- 400 `{ "message": "institutionId is required" }`
- 400 `{ "message": "institutionName and institutionEmail are required for InstitutionAdmin" }`
- 400 `{ "message": "Make sure you are registered first by your Institution Admin in the System" }`
- 400 `{ "message": "Email and the studentId must belong to the same person" }`
- 404 `{ "message": "Institution not found" }`
- 409 `{ "message": "Email already exists" }`
- 409 `{ "message": "Institution email already exists" }`

**Frontend Notes**
- Student registration requires a preloaded Student record (via `/students/upload`).
- `faceImage` file field is accepted by middleware but is not read by controller.

---

### POST /auth/forgot-password
**Purpose**: Request a password reset email.

**Roles**: Public

**Request Body (JSON)**
- `email` (string, required)

**Response Body (200)**
```
{ "message": "If an account exists for that email, a password reset link has been sent" }
```

**Example Request**
```
POST /auth/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

**Possible Errors**
- 400 `{ "message": "email is required" }`
- 429 `{ "message": "Too many requests" }` (rate limit)

**Frontend Notes**
- Rate limit: 5 requests per 60 minutes per user+IP.
- Response is always generic, regardless of whether the account exists.

---

### POST /auth/reset-password
**Purpose**: Reset password using a reset token.

**Roles**: Public

**Request Body (JSON)**
- `email` (string, required)
- `token` (string, required) - raw token from email
- `password` (string, required) - new password

**Response Body (200)**
```
{ "message": "Password reset successful" }
```

**Example Request**
```
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com",
  "token": "<resetToken>",
  "password": "new-password"
}
```

**Possible Errors**
- 400 `{ "message": "email, token, and password are required" }`
- 400 `{ "message": "Invalid or expired reset token" }`
- 429 `{ "message": "Too many requests" }` (rate limit)

**Frontend Notes**
- Tokens expire after ~30 minutes.

---

## 3. User Context Contract

### JWT payload
```
{
  "sub": "<userId>",
  "iat": 1710000000,
  "exp": 1712592000
}
```
Only `sub` is used to load the user. Do not rely on custom JWT claims.

### `req.user` shape (server-side)
Loaded from MongoDB by id, with populated role for some endpoints.

### Current user endpoints
- There is no `/me` endpoint.
- Use `/auth/login` response as the primary user context.
- Admins can use `/users` endpoints to re-fetch user data.

### Institution data available
- `/auth/login` returns populated institution with `name` and `email`.
- `/users` endpoints (for admins) return populated institution with `name` and `email`.
- `/auth/register` returns only institution id.

---

## 4. Endpoint Registry

| Method | Endpoint | Auth | Roles | Purpose |
| --- | --- | --- | --- | --- |
| GET | / | No | Public | Service check |
| GET | /health | No | Public | Health check |
| POST | /auth/register | No | Public | Register user |
| POST | /auth/login | No | Public | Login user |
| POST | /auth/forgot-password | No | Public | Request reset link |
| POST | /auth/reset-password | No | Public | Reset password |
| GET | /users | Yes | AppAdmin, InstitutionAdmin | List users |
| GET | /users/:id | Yes | AppAdmin, InstitutionAdmin | Get user |
| PUT | /users/:id | Yes | AppAdmin, InstitutionAdmin | Update user |
| DELETE | /users/:id | Yes | AppAdmin, InstitutionAdmin | Delete user |
| POST | /students/upload | Yes | InstitutionAdmin | Import students from Excel |
| POST | /accounts/upload | Yes | Finance | Import accounts from Excel |
| POST | /accounts/confirm | Yes | Student | Confirm account details |
| POST | /accounts/resolve | Yes | Student | Submit account issue resolution |
| POST | /accounts/finance-resolve | Yes | Finance | Apply student issue resolution |
| POST | /accounts/load_payed_students | Yes | Finance | Import paid accounts |
| GET | /reports/accounts | Yes | AppAdmin, InstitutionAdmin, Finance | List account reports |
| GET | /reports/accounts/:reportKey | Yes | AppAdmin, InstitutionAdmin, Finance | Get account report |
| POST | /feedback | No | Public | Submit feedback |
| GET | /feedback | Yes | AppAdmin | List feedback |
| GET | /elections | Yes | SAAD, Student | List elections |
| GET | /elections/:id | Yes | SAAD, Student | Get election |
| POST | /elections | Yes | SAAD | Create election |
| PATCH | /elections/:id | Yes | SAAD | Update election |
| POST | /elections/:id/schedule | Yes | SAAD | Schedule election |
| POST | /elections/:id/publish | Yes | SAAD | Publish election |
| POST | /elections/:id/archive | Yes | SAAD | Archive election |
| POST | /elections/:id/publish-results | Yes | SAAD | Publish results |
| DELETE | /elections/:id | Yes | SAAD | Soft delete election |
| POST | /elections/:electionId/positions | Yes | SAAD | Create position |
| GET | /elections/:electionId/positions | Yes | SAAD, Student | List positions |
| GET | /elections/positions/:id | Yes | SAAD, Student | Get position |
| PATCH | /elections/positions/:id | Yes | SAAD | Update position |
| DELETE | /elections/positions/:id | Yes | SAAD | Delete position |
| POST | /elections/:electionId/positions/:positionId/candidates | Yes | SAAD | Create candidate (image upload) |
| GET | /elections/positions/:positionId/candidates | Yes | SAAD, Student | List candidates |
| PATCH | /elections/candidates/:id | Yes | SAAD | Update candidate (image upload) |
| POST | /elections/candidates/:id/approve | Yes | SAAD | Approve candidate |
| POST | /elections/candidates/:id/disqualify | Yes | SAAD | Disqualify candidate |
| DELETE | /elections/candidates/:id | Yes | SAAD | Delete candidate |
| POST | /elections/:electionId/vote | Yes | Student | Cast vote |
| GET | /elections/:electionId/results | Yes | SAAD, Student | Get results snapshot |
| GET | /elections/:electionId/results/winners | Yes | SAAD, Student | Get results winners |
| GET | /elections/:electionId/results/positions/:positionId | Yes | SAAD, Student | Get results by position |
| POST | /elections/:electionId/results/recompute | Yes | SAAD | Recompute results |
| POST | /vote/submit | Yes | Student | Cast vote (electionId in body) |
| GET | /vote/status | Yes | Student | Get vote status |
| GET | /vote/receipt/:id | Yes | Student, SAAD | Get vote receipt |
| GET | /results/:electionId | Yes | SAAD, Student | Get results snapshot (duplicate) |
| GET | /results/:electionId/winners | Yes | SAAD, Student | Get results winners (duplicate) |
| GET | /results/:electionId/positions/:positionId | Yes | SAAD, Student | Get results by position (duplicate) |
| POST | /results/:electionId/recompute | Yes | SAAD | Recompute results (duplicate) |

---

## 5. Domain Contracts

### Students

#### POST /students/upload
- **Auth**: Bearer JWT
- **Roles**: InstitutionAdmin
- **Content-Type**: multipart/form-data
- **Body**: `file` (required) - Excel file
- **Validation rules**: required columns (case-insensitive, lowercased):
  - `studentid`, `email`, `name`, `surname`, `studentstatus`
- **Response (200)**
```
{ "message": "Import completed", "result": { "inserted": 10, "skipped": 2, "errors": [] } }
```
- **Errors**
  - 400 `{ "message": "Missing file upload" }`
  - 500 `{ "message": "<error>" }`
- **Frontend implications**
  - Build an upload screen with column validation instructions.

### Accounts

#### POST /accounts/upload
- **Auth**: Bearer JWT
- **Roles**: Finance
- **Content-Type**: multipart/form-data
- **Body**: `file` (required) - Excel file
- **Validation rules**: required columns (normalized):
  - `contractnumber`, `accountnumber`, `bankname`, `courseofstudy`, `fullnames`
  - Optional: `graduating`, `status`, `paiddate`
- **Response (200)**
```
{ "message": "Import completed", "result": { "inserted": 10, "skipped": 2, "errors": [], "skippedDetails": [{ "row": 3, "reasons": ["Duplicate contractNumber or accountNumber"] }] } }
```
- **Errors**
  - 400 `{ "message": "Missing file upload" }`
  - 500 `{ "message": "<error>" }`

#### POST /accounts/confirm
- **Auth**: Bearer JWT
- **Roles**: Student
- **Request Body (JSON)**
  - `contractNumber` (string, required)
  - `bankName` (string, required)
  - `accountNumber` (string, required)
  - `graduating` (boolean, optional)
- **Response (200)**
```
{
  "message": "Account confirmed",
  "result": {
    "accountId": "<accountId>",
    "confirmationDate": "2026-06-03T12:00:00.000Z",
    "status": "confirmed",
    "alreadyConfirmed": false,
    "graduating": true
  }
}
```
- **Validation rules**
  - `contractNumber` must exist for the institution.
  - `bankName` and `accountNumber` must match the stored account.
  - If mismatched, an Issue is created and a 400 error is returned.
- **Errors**
  - 400 `{ "message": "Enter your correct NMDS contract number" }`
  - 400 `{ "message": "bankName and accountNumber are required" }`
  - 400 `{ "message": "Account details do not match. Issue created for finance review" }`
  - 400 `{ "message": "This account was already confirmed by another student" }`

#### POST /accounts/resolve
- **Auth**: Bearer JWT
- **Roles**: Student
- **Content-Type**: multipart/form-data
- **Body**
  - `correctedBankName` (string, required)
  - `correctedAccountNumber` (string, required)
  - `document` (file, required)
- **Response (201)**
```
{ "message": "Details sent to Finance department, and they will resolve the issue" }
```
- **Errors**
  - 400 `{ "message": "correctedBankName and correctedAccountNumber are required" }`
  - 400 `{ "message": "Missing document upload" }`
  - 404 `{ "message": "Student record not found" }`

#### POST /accounts/finance-resolve
- **Auth**: Bearer JWT
- **Roles**: Finance
- **Request Body (JSON)**
  - `studentId` (string, required)
- **Response (200)**
```
{ "message": "Account updated from issue details" }
```
- **Errors**
  - 400 `{ "message": "studentId is required" }`
  - 404 `{ "message": "Issue not found for studentId" }`
  - 400 `{ "message": "Issue does not contain correctedBankName and correctedAccountNumber" }`
  - 404 `{ "message": "Student record not found" }`
  - 400 `{ "message": "Issue does not contain contractNumber" }`
  - 404 `{ "message": "Account not found for contractNumber" }`

#### POST /accounts/load_payed_students
- **Auth**: Bearer JWT
- **Roles**: Finance
- **Content-Type**: multipart/form-data
- **Body**: `file` (required) - Excel file
- **Validation rules**: required columns (normalized)
  - `contractnumber`, `accountnumber`, `bankname`, `courseofstudy`, `fullnames`, `status`
  - `status` must be `paid`
- **Response (200)**
```
{ "message": "Paid accounts import completed", "result": { "updated": 5, "skipped": 1, "errors": [], "skippedDetails": [{ "row": 2, "reasons": ["Current account status must be confirmed before marking paid (found: undefined)"] }] } }
```

### Issues

There are no direct Issue CRUD endpoints. Issues are created or updated indirectly:
- `/accounts/confirm` creates Issue on mismatched account details.
- `/accounts/resolve` updates or creates Issue with corrected details + document.
- `/accounts/finance-resolve` applies Issue corrections and deletes the Issue.

**Issue data shape (stored)**
- `contractNumber` (string, optional)
- `studentId` (string, required)
- `bankName` (string, optional)
- `accountNumber` (string, optional)
- `reasons` (string[])
- `correctedBankName` (string, optional)
- `correctedAccountNumber` (string, optional)
- `documentBase64` (string, optional)
- `documentMimeType` (string, optional)
- `documentFileName` (string, optional)

### Reports

See Section 7 for report keys and response structures.

### Feedback

#### POST /feedback
- **Auth**: None
- **Request Body (JSON)**
  - `rating` (number, required, 1-5)
  - `comment` (string, optional)
- **Response (201)**
```
{ "message": "Thank you for your feedback" }
```
- **Errors**
  - 400 `{ "message": "rating must be an integer between 1 and 5" }`

#### GET /feedback
- **Auth**: Bearer JWT
- **Roles**: AppAdmin
- **Response (200)**
```
{ "feedbacks": [ { "_id": "...", "rating": 5, "comment": "...", "createdAt": "...", "updatedAt": "..." } ] }
```

### Elections

#### GET /elections
- **Auth**: Bearer JWT
- **Roles**: SAAD, Student
- **Response**: `{ "elections": Election[] }`
- **Rules**:
  - Student sees only `published=true` and `archived=false` elections.

#### GET /elections/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD, Student
- **Response**: `{ "election": Election }`
- **Rules**:
  - Student can access only `published=true` and `archived=false` elections.

#### POST /elections
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**
  - `title` (string, required, min 3)
  - `description` (string, optional)
  - `academicYear` (string, optional)
  - `timezone` (string, optional, defaults to `UTC`)
  - `votingRules` (object, optional)
  - `securitySettings` (object, optional)
- **Response (201)**
```
{ "message": "Election created", "election": { ...Election } }
```

#### PATCH /elections/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**: any of `title`, `description`, `academicYear`, `timezone`, `votingRules`, `securitySettings`
- **Response (200)**
```
{ "message": "Election updated", "election": { ...Election } }
```
- **Rules**: cannot edit when status is `OPEN`, `CLOSED`, `COUNTING`, `RESULTS_PUBLISHED`, `ARCHIVED`.

#### POST /elections/:id/schedule
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**
  - `startTime` (date string, required)
  - `endTime` (date string, required)
  - `timezone` (string, optional)
- **Response (200)**
```
{ "message": "Election scheduled", "election": { ...Election } }
```
- **Rules**: `endTime` must be after `startTime`. Sets `status=SCHEDULED`, `published=true`.

#### POST /elections/:id/publish
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**
  - Optional `startTime`, `endTime`, `timezone`
- **Response (200)**
```
{ "message": "Election published", "election": { ...Election } }
```
- **Rules**:
  - If `startTime` and `endTime` provided, same behavior as schedule.
  - Otherwise sets `published=true` and keeps status as `DRAFT`.

#### POST /elections/:id/archive
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Election archived", "election": { ...Election } }
```
- **Rules**: only when status is `CLOSED` or `RESULTS_PUBLISHED`.

#### POST /elections/:id/publish-results
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Results published", "election": { ...Election } }
```
- **Rules**: requires at least one results snapshot to exist.

#### DELETE /elections/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Election deleted" }
```
- **Rules**: soft deletes election, positions, and candidates.

### Positions

#### POST /elections/:electionId/positions
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**
  - `title` (string, required, min 2)
  - `description` (string, optional)
  - `maxVotesAllowed` (number, optional, min 1; defaults to 1)
  - `displayOrder` (number, optional; defaults to last + 1)
- **Response (201)**
```
{ "message": "Position created", "position": { ...Position } }
```

#### GET /elections/:electionId/positions
- **Auth**: Bearer JWT
- **Roles**: SAAD, Student
- **Response**: `{ "positions": Position[] }`
- **Rules**: Students only see `isActive=true` positions and published elections.

#### GET /elections/positions/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD, Student
- **Response**: `{ "position": Position }`

#### PATCH /elections/positions/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Request Body (JSON)**: any of `title`, `description`, `maxVotesAllowed`, `displayOrder`, `isActive`
- **Response**: `{ "message": "Position updated", "position": Position }`

#### DELETE /elections/positions/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response**: `{ "message": "Position deleted" }`

### Candidates

#### POST /elections/:electionId/positions/:positionId/candidates
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Content-Type**: multipart/form-data
- **Body**
  - `fullName` (string, required, min 3)
  - `party` (string, optional)
  - `manifesto` (string, optional)
  - `studentId` (string, optional)
  - `image` (file, optional; field name `image`)
- **Response (201)**
```
{ "message": "Candidate created", "candidate": { ...Candidate } }
```

#### GET /elections/positions/:positionId/candidates
- **Auth**: Bearer JWT
- **Roles**: SAAD, Student
- **Response**: `{ "candidates": Candidate[] }`
- **Rules**: Students see only `approved=true` and `disqualified=false` candidates.

#### PATCH /elections/candidates/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Content-Type**: multipart/form-data
- **Body**: any of `fullName`, `party`, `manifesto`, `image`
- **Response (200)**
```
{ "message": "Candidate updated", "candidate": { ...Candidate } }
```

#### POST /elections/candidates/:id/approve
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Candidate approved", "candidate": { ...Candidate } }
```

#### POST /elections/candidates/:id/disqualify
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Candidate disqualified", "candidate": { ...Candidate } }
```

#### DELETE /elections/candidates/:id
- **Auth**: Bearer JWT
- **Roles**: SAAD
- **Response (200)**
```
{ "message": "Candidate deleted" }
```

### Voting

#### POST /elections/:electionId/vote
- **Auth**: Bearer JWT
- **Roles**: Student
- **Headers**: optional `idempotency-key`
- **Request Body (JSON)**
  - `selections` (array, required)
    - `positionId` (string)
    - `candidateId` (string)
- **Response (201)**
```
{ "message": "Vote cast", "receipt": { "receiptId": "...", "ballotHash": "...", "submittedAt": "..." } }
```
- **Rules**
  - Election must be `OPEN` and within start/end times.
  - Student must be eligible (`studentStatus=true`).
  - Selections must include candidates for each active position unless `votingRules.allowAbstain=true`.
  - No duplicate candidates for the same position.
  - Max selections per position = `position.maxVotesAllowed`.
  - Candidates must be approved and not disqualified.
- **Errors**
  - 409 `{ "message": "You have already voted" }`

#### POST /vote/submit
Same as `/elections/:electionId/vote`, but `electionId` is in the body.

Request body:
```
{
  "electionId": "<electionId>",
  "selections": [{ "positionId": "...", "candidateId": "..." }]
}
```

#### GET /vote/status
- **Auth**: Bearer JWT
- **Roles**: Student
- **Query Params**: `electionId` (string, required)
- **Response (200)**
```
{ "status": { "hasVoted": true, "receiptId": "...", "submittedAt": "..." } }
```

#### GET /vote/receipt/:id
- **Auth**: Bearer JWT
- **Roles**: Student, SAAD
- **Response (200)**
```
{ "receipt": { "receiptId": "...", "ballotHash": "...", "submittedAt": "...", "electionId": "..." } }
```

### Results

Results are available under both `/elections/:electionId/results` and `/results/:electionId`.
Students can access results only after `resultsPublished=true`.

#### GET /elections/:electionId/results
- **Response**: `{ "snapshot": ResultSnapshot }`

#### GET /elections/:electionId/results/winners
- **Response**
```
{ "winners": { "generatedAt": "...", "winners": [{ "positionId": "...", "positionTitle": "...", "candidateId": "...", "candidateName": "...", "votes": 10, "percentage": 60, "rank": 1 }] } }
```

#### GET /elections/:electionId/results/positions/:positionId
- **Response**
```
{ "position": { "generatedAt": "...", "positionId": "...", "positionTitle": "...", "rankings": [{ "candidateId": "...", "candidateName": "...", "votes": 10, "percentage": 60, "rank": 1 }] } }
```

#### POST /elections/:electionId/results/recompute
- **Roles**: SAAD
- **Response**: `{ "message": "Results computed", "snapshot": ResultSnapshot }`

### Audit Logs

There are no public endpoints for audit logs. All requests are automatically recorded server-side.

---

## 6. Upload Contracts

### /auth/register
- **Field**: `faceImage` (file, optional)
- **Accepted file types**: not validated
- **Size limits**: not enforced
- **Notes**: file is accepted by multer but not processed; use `faceImageUrl` or `faceImageBase64` fields.

### /students/upload
- **Field**: `file` (required)
- **Accepted file types**: not validated (Excel required by parser)
- **Size limits**: not enforced
- **Notes**: required columns: `studentid`, `email`, `name`, `surname`, `studentstatus`.

### /accounts/upload
- **Field**: `file` (required)
- **Accepted file types**: not validated (Excel required by parser)
- **Size limits**: not enforced
- **Notes**: required columns: `contractnumber`, `accountnumber`, `bankname`, `courseofstudy`, `fullnames`.

### /accounts/load_payed_students
- **Field**: `file` (required)
- **Accepted file types**: not validated (Excel required by parser)
- **Size limits**: not enforced
- **Notes**: required columns: `contractnumber`, `accountnumber`, `bankname`, `courseofstudy`, `fullnames`, `status` (must be `paid`).

### /accounts/resolve
- **Field**: `document` (required)
- **Accepted file types**: not validated
- **Size limits**: not enforced
- **Notes**: file is stored as base64 in Issue.

### /elections/:electionId/positions/:positionId/candidates
### /elections/candidates/:id
- **Field**: `image` (optional)
- **Accepted file types**: `image/*`
- **Size limits**: 5 MB
- **Notes**: invalid image uploads return 400 with message `Only image uploads are allowed` or `Invalid image upload`.

---

## 7. Reports Contract

### Available report keys
- summary
- status-breakdown
- confirmation-overview
- payment-overview
- confirmed-not-paid
- by-batch
- by-bank
- by-course
- by-graduating
- by-institution
- imports-by-day
- confirmations-by-day
- payments-by-day
- average-import-to-confirm
- average-confirm-to-pay
- stuck-confirmed
- recent-payments
- anomalies

### Endpoints

#### GET /reports/accounts
**Query params**
- `institutionId` (string, optional, AppAdmin only to scope to a specific institution)
- `stuckDays` (number, optional, default 14)
- `recentDays` (number, optional, default 30)

**Response (200)**
```
{
  "message": "Account reports generated",
  "scope": { "allInstitutions": false, "institutionId": "...", "institutionName": "..." },
  "catalog": [{ "key": "summary", "title": "Summary", "description": "..." }],
  "reports": {
    "summary": { "total": 10, "confirmed": 4, "paid": 2, "unconfirmed": 4, "confirmationRate": 0.4, "paymentRate": 0.2 },
    "statusBreakdown": [{ "label": "confirmed", "count": 4 }],
    "confirmationOverview": { "total": 10, "matching": 4, "others": 6, "rate": 0.4 },
    "paymentOverview": { "total": 10, "matching": 2, "others": 8, "rate": 0.2 },
    "confirmedNotPaid": { "total": 2, "accounts": [{ "contractNumber": "...", "accountNumber": "...", "bankName": "...", "courseOfStudy": "...", "fullnames": "...", "batchNumber": 2, "confirmationDate": "...", "institution": "<id>" }] },
    "byBatch": [{ "label": "2", "count": 6 }],
    "byBank": [{ "label": "bank-name", "count": 4 }],
    "byCourse": [{ "label": "course", "count": 4 }],
    "byGraduating": { "true": 3, "false": 7 },
    "byInstitution": [{ "institutionId": "...", "institutionName": "...", "institutionEmail": "...", "count": 10 }],
    "importsByDay": [{ "date": "2026-06-03", "count": 2 }],
    "confirmationsByDay": [{ "date": "2026-06-03", "count": 1 }],
    "paymentsByDay": [{ "date": "2026-06-03", "count": 1 }],
    "averageImportToConfirm": { "count": 3, "averageDays": 5.33 },
    "averageConfirmToPay": { "count": 2, "averageDays": 3.5 },
    "stuckConfirmed": { "thresholdDays": 14, "thresholdDate": "...", "total": 1, "accounts": [{ "contractNumber": "...", "accountNumber": "...", "bankName": "...", "courseOfStudy": "...", "fullnames": "...", "confirmationDate": "...", "institution": "..." }] },
    "recentPayments": { "windowDays": 30, "thresholdDate": "...", "total": 2, "byDay": [{ "date": "2026-06-03", "count": 1 }], "latest": [{ "contractNumber": "...", "accountNumber": "...", "bankName": "...", "courseOfStudy": "...", "fullnames": "...", "paidAt": "...", "institution": "..." }] },
    "anomalies": { "total": 1, "anomalies": [{ "contractNumber": "...", "accountNumber": "...", "bankName": "...", "courseOfStudy": "...", "fullnames": "...", "status": "...", "issues": ["..."], "institution": "..." }] }
  }
}
```

#### GET /reports/accounts/:reportKey
Same query params as above.

**Response (200)**
```
{
  "message": "Account report generated",
  "scope": { "allInstitutions": false, "institutionId": "...", "institutionName": "..." },
  "reportKey": "summary",
  "report": { "total": 10, "confirmed": 4, "paid": 2, "unconfirmed": 4, "confirmationRate": 0.4, "paymentRate": 0.2 },
  "catalog": [{ "key": "summary", "title": "Summary", "description": "..." }]
}
```

### Chart-friendly fields
- `statusBreakdown`, `byBatch`, `byBank`, `byCourse`, `importsByDay`, `confirmationsByDay`, `paymentsByDay`, `byInstitution`.

### Table-friendly fields
- `confirmedNotPaid.accounts`, `stuckConfirmed.accounts`, `recentPayments.latest`, `anomalies.anomalies`.

### Summary fields
- `summary`, `confirmationOverview`, `paymentOverview`, `averageImportToConfirm`, `averageConfirmToPay`.

---

## 8. Elections Contract

### Election lifecycle
- `DRAFT`: created, editable.
- `SCHEDULED`: scheduled with start/end times, published.
- `OPEN`: voting is open (job transitions).
- `CLOSED`: voting closed (job transitions).
- `COUNTING`: counting in progress.
- `RESULTS_PUBLISHED`: results published to students.
- `ARCHIVED`: archived and read-only.

There is no `PUBLISHED` status. Publication is controlled by `published` boolean.

### Election creation
- POST /elections
- Fields: `title`, `description`, `academicYear`, `timezone`, `votingRules`, `securitySettings`.

### Position creation
- POST /elections/:electionId/positions
- Fields: `title`, `description`, `maxVotesAllowed`, `displayOrder`.

### Candidate creation
- POST /elections/:electionId/positions/:positionId/candidates
- Fields: `fullName`, `party`, `manifesto`, `studentId`, optional image.

### Candidate approval and disqualification
- POST /elections/candidates/:id/approve
- POST /elections/candidates/:id/disqualify

### Scheduling and voting
- POST /elections/:id/schedule sets `status=SCHEDULED` and `published=true`.
- Scheduler will open election at `startTime` and close at `endTime`.
- Voting is allowed only when `status=OPEN` and within the time window.

### Results
- POST /elections/:electionId/results/recompute to compute a snapshot.
- POST /elections/:electionId/publish-results to set `resultsPublished=true`.
- Students can access results only after publication.

---

## 9. Error Contract

### Standard error response format
Most endpoints return:
```
{ "message": "..." }
```

### Common status codes
- 400: validation errors, bad inputs, or business rule violations.
- 401: missing/invalid auth token.
- 403: forbidden (role or visibility restrictions).
- 404: missing records (user, election, position, candidate, issue).
- 409: conflict (duplicate email, already voted).
- 422: not explicitly used in code.
- 429: rate limiting.
- 500: server errors or missing configuration.

---

## 10. Frontend DTO Definitions

All ObjectId values are strings. Date fields are ISO strings in JSON responses.

```ts
export interface RoleRef {
  _id: string;
  name: string;
}

export interface InstitutionRef {
  _id: string;
  name: string;
  email: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface LoginUser {
  id: string;
  email: string;
  role: RoleRef;
  institution: InstitutionRef;
  studentId?: string;
  faceDescriptor: number[];
  faceImageUrl?: string;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: LoginUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: string;
  institutionId?: string;
  institutionName?: string;
  institutionEmail?: string;
  studentId?: string;
  faceImageBase64?: string;
  faceDescriptor?: number[];
  faceImageUrl?: string;
}

export interface RegisterResponse {
  message: string;
  user: {
    id: string;
    email: string;
    role: string;
    institution: string;
    studentId?: string;
    faceDescriptor?: number[];
    faceImageUrl?: string;
  };
}

export interface UserListItem {
  _id: string;
  email: string;
  role: RoleRef;
  institution: InstitutionRef;
  studentId?: string;
  faceImageUrl?: string;
}

export interface UserUpdateResponse {
  message: string;
  user: {
    id: string;
    email: string;
    role: string;
    institution: string;
  };
}

export interface StudentImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

export interface AccountImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
  skippedDetails: { row: number; reasons: string[] }[];
}

export interface AccountPaidImportResult {
  updated: number;
  skipped: number;
  errors: string[];
  skippedDetails: { row: number; reasons: string[] }[];
}

export interface AccountConfirmationResult {
  accountId: string;
  confirmationDate: string;
  status: string;
  alreadyConfirmed: boolean;
  graduating?: boolean;
}

export interface FeedbackItem {
  _id: string;
  rating: number;
  comment?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export type ElectionStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "COUNTING"
  | "RESULTS_PUBLISHED"
  | "ARCHIVED";

export interface Election {
  _id: string;
  title: string;
  description?: string;
  academicYear?: string;
  status: ElectionStatus;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  createdBy: string;
  institution: string;
  published: boolean;
  archived: boolean;
  resultsPublished: boolean;
  votingRules?: Record<string, unknown>;
  securitySettings?: Record<string, unknown>;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface Position {
  _id: string;
  electionId: string;
  title: string;
  description?: string;
  maxVotesAllowed: number;
  displayOrder: number;
  isActive: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface Candidate {
  _id: string;
  electionId: string;
  positionId: string;
  studentId?: string;
  fullName: string;
  party?: string;
  manifesto?: string;
  imageUrl?: string;
  approved: boolean;
  disqualified: boolean;
  voteCountCached: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface VoteSelection {
  positionId: string;
  candidateId: string;
}

export interface VoteReceipt {
  receiptId: string;
  ballotHash: string;
  submittedAt: string;
  electionId?: string;
}

export interface VoteStatus {
  hasVoted: boolean;
  receiptId?: string;
  submittedAt?: string;
}

export interface ResultRanking {
  candidateId: string;
  votes: number;
  percentage: number;
  rank: number;
}

export interface ResultPositionSnapshot {
  positionId: string;
  rankings: ResultRanking[];
  winnerId?: string | null;
}

export interface ResultSnapshot {
  _id: string;
  electionId: string;
  generatedAt: string;
  positions: ResultPositionSnapshot[];
  snapshotHash: string;
  generatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  __v?: number;
}

export interface ResultsWinnersResponse {
  generatedAt: string;
  winners: Array<{
    positionId: string;
    positionTitle?: string;
    candidateId: string | null;
    candidateName?: string;
    votes?: number;
    percentage?: number;
    rank?: number;
  }>;
}

export interface ResultsByPositionResponse {
  generatedAt: string;
  positionId: string;
  positionTitle?: string;
  rankings: Array<{
    candidateId: string;
    candidateName?: string;
    votes: number;
    percentage: number;
    rank: number;
  }>;
}

export type AccountReportKey =
  | "summary"
  | "status-breakdown"
  | "confirmation-overview"
  | "payment-overview"
  | "confirmed-not-paid"
  | "by-batch"
  | "by-bank"
  | "by-course"
  | "by-graduating"
  | "by-institution"
  | "imports-by-day"
  | "confirmations-by-day"
  | "payments-by-day"
  | "average-import-to-confirm"
  | "average-confirm-to-pay"
  | "stuck-confirmed"
  | "recent-payments"
  | "anomalies";

export interface ReportCatalogItem {
  key: AccountReportKey;
  title: string;
  description: string;
}

export interface ReportScope {
  institutionId?: string;
  institutionName?: string;
  allInstitutions: boolean;
}

export interface AccountReportsResponse {
  message: string;
  scope: ReportScope;
  catalog: ReportCatalogItem[];
  reports: Record<string, unknown>;
}

export interface AccountReportResponse {
  message: string;
  scope: ReportScope;
  reportKey: AccountReportKey;
  report: unknown;
  catalog: ReportCatalogItem[];
}
```

---

## 11. Frontend Feature Matrix

| Feature | Endpoint(s) | Roles | Examples |
| --- | --- | --- | --- |
| Student Login | POST /auth/login | Student | Login screen + token store |
| Student Account Confirmation | POST /accounts/confirm | Student | Confirmation form |
| Account Upload | POST /accounts/upload | Finance | Finance upload screen |
| Student Import | POST /students/upload | InstitutionAdmin | Admin upload screen |
| Issue Resolution (Student) | POST /accounts/resolve | Student | Issue resolution upload form |
| Issue Resolution (Finance) | POST /accounts/finance-resolve | Finance | Finance issue action form |
| Elections | /elections + related endpoints | SAAD, Student | Election management and voting UI |
| Feedback Submission | POST /feedback | Public | Public feedback form |
| Reports Dashboard | GET /reports/accounts | AppAdmin, InstitutionAdmin, Finance | Reports dashboard |

---

## 12. Frontend Route Suggestions

Only routes supported by current API:
- /login
- /register
- /forgot-password
- /reset-password
- /dashboard
- /users (AppAdmin, InstitutionAdmin)
- /students/import
- /accounts/upload
- /accounts/confirm
- /accounts/issues
- /reports/accounts
- /elections
- /elections/:id
- /elections/:id/positions
- /elections/:id/candidates
- /elections/:id/vote
- /elections/:id/results
- /feedback

---

## 13. AI Agent Rules

### Frontend Contract Rules
- Never invent endpoints or parameters.
- Never invent response fields.
- Never implement backend business logic client-side.
- Never compute report aggregates in the client.
- Never enforce permissions client-side; rely on server responses.
- Prefer using server-provided fields exactly as returned.
