# Statement PDF and email

Copy each file over the same path in your project.

## What changed
- api/src/statementPdf.ts (new): builds the statement as a PDF on the server (PDFKit). Same figures as the on-screen statement.
- api/src/statementEmail.ts (new): the email. Short plain-English note with a text version and a simple HTML version, and the PDF attached.
- api/src/mailer.ts: sends the text version and attachments through Resend and Brevo.
- api/src/routes/billing.ts:
  - New `GET /billing/statements/:id/pdf` (admin and the owning vendor).
  - "Email" (manual) and the automatic send both use the new email with the PDF attached.
- web/src/pages/admin/AdminBilling.tsx: "PDF" download button on each statement.
- web/src/pages/vendor/VendorStatements.tsx: "Download PDF" button for vendors.
- api/package.json and package-lock.json: add `pdfkit` and `@types/pdfkit`. Run `npm install` in api/ after copying.

## Checks
- API type-check and build pass. Money (16) and security (68) integration suites pass.
- Web type-check and build pass.
- PDF rendered for a 45-order statement: 2 pages, totals do not overlap, page numbers correct.
- Not tested: live delivery through Resend or Brevo with the attachment.

## Logo size
- api/src/templates.ts: the Sokoni Hub logo on statements and receipts is smaller (110 px wide on desktop, 96 px on phones; was 205 px and 185 px).
