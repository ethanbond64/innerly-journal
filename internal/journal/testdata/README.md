# Compatibility fixtures

These files contain synthetic test data, not a real journal. They remain checked in so compatibility can be tested without the retired implementation or a Python installation.

- `legacy-encryption.json`: historical password hash, derived key, and Fernet v0/v1 ciphertext for `TestLegacyEncryption`.
- `python-journal.db`: a database created by the original application, used to verify reading, editing, and rekeying existing journals.
- `legacy.zip`: an older export containing text, encrypted text, an image, tags, and an intentionally invalid media reference.

The original fixture generators are preserved in Git history at commit `c20b0817a9a79c0e6f61b31e1f3da06aedf6c457`. Keep these golden fixtures unchanged when adding new formats; add new fixtures instead.
