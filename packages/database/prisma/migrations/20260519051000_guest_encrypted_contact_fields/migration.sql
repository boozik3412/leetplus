-- Store reversible guest contact fields encrypted at application level.
-- Raw PII is not stored in plaintext; documents remain excluded.
ALTER TABLE "Guest"
  ADD COLUMN "phoneEncrypted" TEXT,
  ADD COLUMN "fullNameEncrypted" TEXT;
