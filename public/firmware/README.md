# Signed firmware releases

Only hardware-qualified releases belong in this catalogue. The initial catalogue
is empty; users can also select a downloaded manifest.json and firmware.bin.

Build and sign with `slpanel-release` in the sibling slpanel-rust repository.
Copy `manifest.json` and `firmware.bin` into `public/firmware/<image_id>/` and add
the generated `release.json` object to `releases.json`'s `releases` array.
Both URLs must remain under this origin's `/firmware/` path. Commit the assets
through the normal web release process. Never copy the private signing seed.

The browser checks size, compatibility, payload hash, trailer, and catalogue
identity before asking for physical approval. The device and bootloader verify
the Ed25519 signature against their embedded public key. Catalogue access alone
does not authorize installation.
