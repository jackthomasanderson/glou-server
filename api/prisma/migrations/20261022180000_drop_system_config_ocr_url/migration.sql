-- #639: the admin "OCR service URL" was saved but never read; the scan always
-- calls OLLAMA_URL. It could not have been wired up either: the SSRF guard on
-- that field only accepts a public HTTPS address, while the recognition service
-- runs on the private compose network. The field is removed.
ALTER TABLE "SystemConfig" DROP COLUMN "ocrUrl";
