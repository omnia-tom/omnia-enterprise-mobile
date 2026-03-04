# QR Code for Testing — Exact Content to Encode

Generate a QR code using **exactly** this string as the content. No spaces, no URL, no extra characters.

## Primary (Simplest)

```
FBG-001
```

Copy exactly: `FBG-001` (6 characters: F, B, G, hyphen, 0, 0, 1)

## Alternative Formats (also supported)

```
DAK-SOP-FBG-001
```

```
DAKKOTA-FBG-001
```

---

## How to Generate

1. **Online:** Use [qr-code-generator.com](https://www.qr-code-generator.com/) or similar
   - Set "Content" or "Text" to: **FBG-001**
   - Do NOT use "URL" — use plain text
   - Download the QR image

2. **Command line (macOS):**
   ```bash
   # Install qrencode: brew install qrencode
   echo -n "FBG-001" | qrencode -o qr-fbg-001.png
   ```

3. **iPhone Notes:** Create a note with just `FBG-001`, then use a QR app to generate from that text.

---

## What This Does

Scanning this QR in the app (Account → Dakkota Assembly → Scan QR Code) will:
1. Parse procedure **FBG** (Front Bumper & Grille), station **001**
2. Navigate to Task Detail for the assembly session
3. Load the SOP content from `DAK-SOP-FBG-001_plaintext.txt`

---

## If "QR Code Not Recognized"

- Ensure the QR contains **exactly** `FBG-001` — no leading/trailing spaces
- Use **plain text** mode, not URL mode
- Try the alternative: `DAK-SOP-FBG-001`
- Check Metro console for `[WorkstationSelect] Scan raw:` to see what the scanner received
