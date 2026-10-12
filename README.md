# MULTI//CONVERTER

Bezpieczny, działający w przeglądarce multikonwerter plików. **Wszystko dzieje się lokalnie** — pliki nie są nigdzie wysyłane. Motyw: industrialny, ciemny + zielony.

## Uruchomienie

**Najprościej:** kliknij dwukrotnie **`Uruchom.bat`** — otworzy się okno serwera i strona
sama załaduje się w przeglądarce na **http://localhost:8000**. Zamknięcie tego okna
zatrzymuje serwer.

Alternatywnie, z terminala (wymaga Pythona 3):

```bash
python serve.py
```

Następnie otwórz **http://localhost:8000**.

> Własny serwer jest potrzebny, bo strona ładuje się jako moduły ES (`type="module"`),
> a przeglądarki blokują ich wczytywanie bezpośrednio z dysku (`file://`). Dodatkowo
> sekcje Audio/Wideo używają FFmpeg.wasm (SharedArrayBuffer), co wymaga nagłówków COOP/COEP —
> stąd `serve.py` zamiast zwykłego serwera plików.

## Funkcje

- **Sekcje**: Obrazy, Audio, Wideo, 3D, Dokumenty, Dane + **Historia**.
- Wybór formatu **wejściowego** (auto z rozszerzenia) i **wyjściowego**.
- **Wiele plików** naraz (drag & drop lub wybór). **Bez limitu rozmiaru** — wszystko lokalnie.
- **Popularne konwersje** jednym kliknięciem (np. MP4 → MP3, HEIC → JPG, CSV → XLSX).
- **Historia** przekonwertowanych plików (IndexedDB) — lista przeżywa odświeżenie strony;
  pobieranie pojedynczo, ZIP-em, usuwanie wpisów.
- Pobieranie **pojedynczo** albo wszystkiego jako **ZIP**.
- Oznaczenia **BEZSTRATNY / STRATNY** przy każdym formacie + opcje jakości i skalowania.

### Co konwertuje dzisiaj

| Sekcja | Wejście | Wyjście | Silnik |
|--------|---------|---------|--------|
| Obrazy | PNG, JPG, WEBP, GIF, BMP, AVIF, SVG, HEIC/HEIF | PNG*, WEBP, JPEG, GIF, BMP*, ICO*, SVG*, PDF | Canvas + własne enkodery + heic2any/jsPDF |
| Audio  | MP3, WAV, FLAC, OGG, OPUS, M4A, AAC… | MP3, WAV*, FLAC*, OGG, OPUS, M4A, AIFF* | FFmpeg.wasm |
| Wideo  | MP4, WEBM, MKV, MOV, AVI, FLV… | MP4, WEBM, MKV*, MOV*, AVI, GIF, MP3 (audio), WAV* (audio) | FFmpeg.wasm |
| 3D     | OBJ, STL, PLY, GLTF, GLB, DAE, FBX | GLB, glTF, OBJ, STL, PLY | three.js |
| Dokumenty | TXT, MD, HTML, DOCX, PDF | TXT, MD, HTML, PDF, DOCX, RTF | JS + marked/turndown/jsPDF/mammoth/pdf.js/docx |
| Dane   | CSV, TSV, JSON, XLSX, YAML | CSV, TSV, JSON, XLSX, YAML, XML | czysty JS + SheetJS/js-yaml |

`*` = ścieżka bezstratna (PNG/BMP/SVG/ICO kontener, PCM / FLAC / remux strumieni bez rekompresji).

- **Obrazy**: GIF, BMP, ICO, SVG mają własne enkodery (bez zależności z sieci). GIF = maks. 256 kolorów.
- **3D**: konwertuje geometrię; three.js ładuje się z CDN (import map). Materiały/tekstury mogą się uprościć.
- **Dokumenty**: TXT/MD/HTML działają lokalnie; PDF/DOCX używają bibliotek z CDN. PDF eksportowany jest tekstowo (czcionki standardowe → ograniczone polskie znaki).

## Filozofia „bezstratności"

Narzędzie **nie dodaje** strat jakości ponad te wynikające z samego formatu docelowego:
formaty bezstratne (PNG, WAV, FLAC, remux MKV/MOV) zachowują dane w 100%, a przy formatach
stratnych domyślne ustawienia są wysokiej jakości i jawnie oznaczone jako `STRATNY`.

## Struktura

```
serve.py                serwer dev (nagłówki COOP/COEP)
index.html              szkielet strony
css/theme.css           zmienne, motyw, prymitywy
css/app.css             layout aplikacji
js/app.js               UI + sterowanie stanem
js/registry.js          rejestr sekcji
js/files.js             narzędzia + generator ZIP (bez zależności)
js/history.js           trwała historia konwersji (IndexedDB)
js/converters/*.js      moduły konwersji (images, audio, video, data, ffmpeg-engine)
js/vendor/ffmpeg*/      zawendorowane @ffmpeg/ffmpeg + @ffmpeg/util (Worker musi być same-origin)
```

## Dodawanie nowej sekcji

Utwórz `js/converters/moja.js` z domyślnym eksportem (deskryptorem: `id, label, icon,
accept, outputs, optionsSchema, convert()`), a następnie dodaj go do `js/registry.js`.

## Roadmapa

- [x] 3D: OBJ / STL / PLY / GLTF / GLB / DAE / FBX (three.js)
- [x] Dokumenty: TXT / MD / HTML / PDF / DOCX
- [ ] Obrazy: AVIF/TIFF na wyjściu (przez FFmpeg lub WASM)
- [ ] Archiwa: ZIP / TAR / GZIP
- [ ] Czcionki: TTF / OTF / WOFF / WOFF2
- [ ] Wariant z Vite (gdy zainstalowany Node.js)
