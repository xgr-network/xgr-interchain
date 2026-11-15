# Verification record

Frozen source: `6e78cadc631fcdff8605ea0428965e7b911076cd`. All 1327 tracked Git blobs matched the archived tree. The eleven affected test files passed 83 TAP tests; the additional historical-to-current SQL attribution replay passed under the actual restricted role. Run 43738410591, artifact 14170887571, artifact SHA256 `b14d28195128cef8fb97445f430f746ea260b27057328951ca6a13365fd9c1fb`.

Source/PDF evidence is separate from production installation. No production database or wallet operation was used. Only audit files may be committed. Prior audit directories must remain byte-identical.

Initial harness-only failures (wrong safety-guard database name; CommonJS PostgreSQL import) are retained in `evidence-summary.json`. The final collector corrected only its own setup. Broader eight failing historical test files from v3.4.0 were not reclassified by this targeted run.
