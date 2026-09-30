# Account-deletion operating procedure

**Release:** English legal/help pages + migration 013. **Operator/legal review still required.**

This is a real PostgreSQL/API workflow, not a demo and not an automatic universal erasure engine. Administrators record review decisions, then the API anonymises the active profile and removes known account-owned uploads. Historical and external data require human minimisation and justified retention decisions. Never equate account deactivation with erasure.

## 1. Receive and identify the request

- The account holder opens **Account deletion** in the footer, signs in, confirms their current password and submits the acknowledgement.
- A durable request is created. Only one open request per account is allowed. Administrators cannot self-delete through this flow, and impersonation is blocked.
- The customer must download the private receipt before leaving. Its reference plus 256-bit access key allow status lookup without login, including after account closure. Only the key's SHA-256 hash is stored. The server cannot recover a lost key.
- Lost receipt or inaccessible account: use proportionate verification through Support/WhatsApp. Do not request passwords, PINs, MFA/recovery codes or an unsolicited personal-ID upload. Do not claim that an anonymous complaint alone proves account ownership.
- Existing complaints can be shared with a relevant vendor. Prefer the published WhatsApp contact for private account-access/rights enquiries, and explain third-party handling. Keep sensitive personal information out of complaint text where possible.
- Open **Admin → Privacy requests** (`/admin/deletion`). There is no email notification: review this queue routinely, including later pages and retention-review dates.

## 2. Review before pressing Complete

Review is deliberately separate from completion. **Save review only** updates the status/message; it does not erase anything.

Statuses: `pending → in_review / needs_action / declined`; the requester can withdraw pending/in-review/needs-action requests. `processing` means account access has been blocked and irreversible cleanup has started. It is not an erasure success. `completed` means the automated profile/known-file step succeeded after administrator attestations, with any recorded retention exceptions.

- Check open orders, service bookings, complaints and statements. The server blocks completion for open orders, live bookings, unresolved complaints or draft/issued statements with non-zero net amounts due.
- Resolve these matters through the existing commerce/complaint/billing tools. Do not change a status to hide an outstanding liability.
- **Also reconcile unbilled fees, unpaid amounts not represented in a statement, guest/unlinked orders and independent vendor records.** Automated counts do not establish a complete financial or identity match.
- Review historical personal information while the original account/contact details still exist. Do not complete first and expect a deleted phone/email to remain available for matching guest records.
- Where retention is necessary, record categories, specific purpose/legal reason, what event/date ends retention, access restrictions and next manual review date. Do not invent a statutory period. A bare “required by law” is not a considered retention decision.
- If records are not necessary, remove or anonymise the relevant personal fields using the Supabase browser tools and an approved procedure. Preserve other people's information and required transaction integrity. **Never DELETE the root `users` or `vendors` row:** cascading foreign keys can delete other customers’ transactions, listings and financial history.

### Data to inspect — not an exhaustive retention schedule

Use the account UUID shown in the admin request and its vendor UUID where present. Supabase **Table Editor** filters or reviewed, parameter-scoped SQL can be used; no Bash is required. Never run an unfiltered UPDATE/DELETE.

| Area | What to inspect/minimise; do not blindly cascade |
|---|---|
| `users`, `vendors` | Active profile/contact/credentials and store/bank fields are handled by completion. Review remaining moderation notes and metadata. |
| `orders`, `order_items` | Buyer/vendor relationships, separate contact name/phone/address, notes and snapshots. A null buyer ID can be a guest transaction; verified matching needs human judgement. Other buyers’ orders for the closing vendor must remain intact. |
| `service_bookings` | Contact name/phone/email, home address, preferred/vendor/cancellation notes and transaction evidence. Guest records may have no buyer ID. |
| `complaints`, `complaint_messages` | Reporter/author IDs plus separately stored names/phones, bodies and admin notes. Preserve necessary dispute evidence and third-party rights. |
| `reviews`, `review_votes` | Review titles/comments, vendor replies, authorship and any free-text identifiers. User display name is derived from the account, but comment contents are not automatically scrubbed. |
| `listings`, inventory and booking configuration | Completion unpublishes listings, clears images/description/supplier note and removes the public store profile. Inspect titles, other text/snapshots, inventory movements, `vendor_booking_settings.home_service_notes`, hours/blocks and any remaining identifying information. |
| Statements, statement/order links, payout tables, `email_log` | Required financial evidence, bank exports, notes, document recipients, downloaded invoices/statements and external copies. The profile's bank fields are removed; historical exports are not automatically rewritten. |
| `audit_log`, security/provider logs | Necessary security accountability, older action metadata, identifiers and log retention. Do not destroy evidence of misuse without lawful review. |
| `account_deletion_requests` | Completion clears the request reason/internal note. A pseudonymous user tombstone, request reference/status/timestamps, hashed receipt credential, reviewer link and retention outcome remain so the request can be tracked. Review their own retention too. |

A simple **read-only** request/account lookup in Supabase SQL Editor (replace the placeholder with the UUID from the admin screen):

```sql
select d.id as request_id, d.reference, d.status, d.user_id,
       u.full_name, u.phone, u.email, v.id as vendor_id,
       v.id_document_url, d.retention_summary, d.retention_review_date
from account_deletion_requests d
left join users u on u.id = d.user_id
left join vendors v on v.user_id = d.user_id
where d.id = 'REPLACE-WITH-REQUEST-UUID'::uuid;
```

Treat results as personal/internal information. Do not paste them into GitHub issues, deployment logs or the public request response.

## 3. Review files and copies

Automatic completion removes:
- Keys recorded in `private_uploads` for this account and its current `kyc://` CR reference.
- Known current logo/listing/legacy-document URLs in the configured public bucket **only if** the URL matches the configured storage origin/bucket and its object key belongs to this account's UUID folder.
- Database file references after the cleanup succeeds. It does not merely delete the metadata while pretending bytes were erased.

Manual review is still needed for:
- Earlier/orphaned uploads no longer referenced by a listing/profile or tracking table.
- Historical publicly uploaded CR documents and cached/CDN copies. A private current upload does not neutralise an old public URL.
- Different-bucket, different-owner or external URLs: the API will not fetch/delete an arbitrary external URL or another user's file. Verify ownership before any manual operation.
- Provider backups, logs, downloaded/exported copies, WhatsApp, vendor-held documents and other independent records. Record legitimate limitations and applicable retention/expiry; do not claim the button deletes these copies.

Supabase Storage is separate from the database. Use **Storage → correct bucket → exact account UUID folder/object**, verify identity, and remove unnecessary owned objects through the Storage interface. Do not delete an entire bucket. Do not delete `storage.objects` rows with SQL as a substitute for the Storage API/UI. If removing an old CR URL manually, also reconcile stale application references under an approved procedure.

## 4. Complete reviewed deletion

In Admin → Privacy requests:
1. Enter a requester-visible outcome explaining what is removed and what remains. No third-party personal details, passwords or internal notes.
2. Write the retention/exception summary and choose a future manual review date. Even a minimal closure/security record needs a considered decision.
3. Tick all three attestations **only after** doing the historical-data, file/external-copy and financial review.
4. Type `COMPLETE REVIEWED DELETION` and confirm.

The API then:
- Locks/rechecks the request, user and vendor; prevents duplicate/open-request races and rechecks blockers.
- Disables the account, revokes access through the existing session-version trigger, suspends the store and removes listings from publication.
- Calls the configured Supabase Storage deletion API for known owned objects. Failed calls leave the request `processing`, not `completed`.
- On successful cleanup, replaces the user's name/phone with non-contact tombstones, clears email/PIN/MFA material, replaces the password hash with an unrecorded random credential, sets `deleted_at`, clears active store/contact/location/bank fields and known listing file/description/supplier-note fields, removes sessions, minimises request free-text and writes a minimal completion audit event.
- Preserves relational rows/history rather than cascading deletion. Other customers’ transactions and necessary financial records remain.

Ordinary admin enabling cannot reactivate a processing/completed account. Closed stores/listings cannot be republished through ordinary updates. Use a new account if legitimately needed later; do not resurrect the deleted profile.

## 5. Failure handling and retained-record follow-up

- **Blocked before processing:** resolve the named outstanding matters and refresh. The account is not disabled by this rejected attempt.
- **Storage/configuration/network error:** access is already blocked; files/tracking may be partly processed. Correct server-only Storage credentials/configuration/access, recheck the file review, then use **Retry reviewed completion**. Deleting an already absent known object is safe/idempotent. Do not force the request status to completed in the table.
- **Another completion attempt is running:** wait and refresh instead of submitting competing decisions. A database-backed lease serializes completion across API instances. A hard-interrupted server run may require up to 10 minutes before retry; ordinary handled failures release the lease.
- **Unexpected database error:** inspect the server's redacted error code and migration readiness. Do not re-enable the account or overwrite retention/review state to conceal failure. Fix the cause and retry. Do not restore deleted files/profile information.
- **Lost access key:** verify the requester via Support and communicate the outcome securely. No secret recovery/reset UI is provided in this release.
- **Retention review date:** this is a human follow-up reminder, not an automatic deletion job or a statutory deadline. Reassess necessity, minimise/dispose of eligible retained records and provider copies, record the action in your approved audit process, and update the retention summary/date in Supabase if a further justified review is needed. Do not leave records indefinitely just because the request says completed.

## 6. Before final policy publication

Edit public configuration in `web/src/legalConfig.ts` through GitHub. Confirm operator legal name, CR, address, actual processors/regions/transfers/safeguards, purposes/grounds, consent handling where applicable, record-level retention and disposal, request-handling process, final terms and version/effective date. Obtain appropriate Qatar legal review. Only then remove the draft state and update related draft links/notices as appropriate.

Support remains the existing form and **WhatsApp +974 6604 6431**. No email address, delivery promise, fixed retention duration or all-data-in-Qatar claim has been invented. The current CR uploader is image-based (JPEG/PNG/WebP), not PDF.

Official review starting points — not a compliance certification:
- [1](https://ncsa.gov.qa/shared/document_library/94787172324409/33000/2895/1.0~9c456709-128e-4095-9fc4-d0829aad9fc4?mimetype=application%2Fpdf&filename=Law.pdf) NCSA-hosted English translation of Qatar Law No. 13 of 2016; check the authoritative Arabic text and applicability with legal counsel.
- [2](https://ncsa.gov.qa/shared/document_library/94787172324409/33000/8876/1.0~a0a5232c-60da-4c70-964c-08d706f2be46?mimetype=application/pdf&filename=Privacy+Notice+-+Guideline+for+Regulated+Entities+(4).pdf) NCSA privacy-notice guidance; use it to verify the final notice against actual operations.
