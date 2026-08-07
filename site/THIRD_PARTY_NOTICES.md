# Third-party notices

This file records third-party data and services used to produce the submission build. It is not legal advice; the entrant must keep evidence for the account tier and rights that applied when each generated asset was created.

## HanjaDict 0.4.1

- Project: <https://github.com/seyoungsong/hanjadict>
- Copyright: 2025 Seyoung Song
- License: MIT
- Use in this project: automatic Hun-Eum lookup data for the bundled 1,135-character learning catalog.

The generated records retain `source` and `status` fields. `auto-supplemented` means the value was imported from HanjaDict and has not been marked as a manual National Institute of Korean Language review. The original dataset pronunciation remains alongside it for mismatch auditing.

```text
MIT License

Copyright (c) 2025 Seyoung Song

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Google Fonts (optional runtime download)

- Fonts: Gowun Batang, Noto Sans KR
- Service: <https://fonts.google.com/>
- License family: SIL Open Font License 1.1
- Use in this project: the HTML requests these fonts when network access is available. The game remains playable with the bundled CSS system-font fallbacks when the request fails.

No Google font binary is included in the static ZIP.

## OpenAI image generation

- Terms: <https://openai.com/policies/>
- Use in this project: original game backgrounds and sprite source sheets were generated from project prompts and user-provided style references, then chroma-keyed, split, aligned, and integrated locally.
- Submission note: the entrant must have the necessary rights to every reference image supplied as input. The reference images themselves are not bundled in the game ZIP.

## Suno

- Terms: <https://suno.com/terms/>
- Rights guide: <https://help.suno.com/en/articles/9601665>
- Use in this project: seven instrumental BGM tracks and twenty-three one-shot effects were generated and then normalized for the game.
- Submission gate: Suno states that output made while subscribed to a qualifying paid tier receives commercial-use rights; free-tier output is limited to non-commercial use. The entrant must confirm that the account was on a qualifying paid tier at the generation time recorded in `assets/audio/catalog.json` before contest submission.

## User-supplied source dataset and references

- Hanja/idiom source archive: `sajayeonseong_hanja_dataset_v2.0.zip` supplied by the project owner.
- Art-direction references: `이전_대화_맥락은_202604031850.png` and `A_4-panel_character_202604032006.png` supplied by the project owner.
- Use in this project: the archive defines the learning catalog; the images define broad visual grammar such as bold outline, round silhouette, elemental palette, and simple cel shading.
- Submission gate: the entrant is responsible for confirming distribution rights for supplied source material. Source files are not copied into the static game ZIP.
