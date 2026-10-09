# Signed firmware releases

The deployed Worker serves `/firmware/releases.json` dynamically from GitHub
releases in `FIRMWARE_REPOSITORY`. Stable `vMAJOR.MINOR.PATCH` tags must point to a
commit reachable from main, include matching provenance, and contain the signed
manifest, fixed-size firmware image, release descriptor, and release SBOM. Drafts,
prereleases, off-main tags, moved tags, and incomplete releases are excluded.

Set `FIRMWARE_GITHUB_TOKEN` as a Worker secret with Contents: read permission on
the private firmware repository. It is never sent to browsers or forwarded to
asset redirects. Only manifest.json and firmware.bin from eligible releases can
be downloaded through the public Worker. The release files become public through
this endpoint; repository source remains private.

The browser checks size, compatibility, payload hash, trailer, and catalogue
identity before asking for physical approval. The device and bootloader verify
the Ed25519 signature against their embedded public key. Catalogue access alone
does not authorize installation. No hardware secure boot or OTP lock is enabled.
BOOTSEL can still replace the verifier or repurpose the board.

Once this Worker version is deployed, eligible firmware tags appear automatically
within five minutes, without changing or deploying the web app again. The list
is bounded to six stable candidates among the latest 60 GitHub releases. A new
connection reloads the catalogue. Local manifest/binary selection also works.

The checked-in empty `releases.json` is a static fallback when no firmware
repository is configured. For an intentionally static deployment, unset
`FIRMWARE_REPOSITORY`, copy qualified manifest/image pairs into
`public/firmware/<image_id>/`, and add their release.json objects to the fallback
catalogue. Never copy the signing seed.
