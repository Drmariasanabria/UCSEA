# AI integration verification (2026-09-22)

Run `node --test tests/maritime-ai.test.cjs`.

The six transport tests cover anonymous-model filtering, retired models, bounded rate-limit retry, empty responses, unavailable free access, and serialization. They do not claim that the external service will remain available.

Manual browser checks on localhost:
- Instructor test login and AI Lab creation.
- A human message triggered a generated Port Agent response, with the actual model shown.
- Both ITM II missions exposed the AI panel from readiness onward and returned generated responses using the visible scenario.
- Mission 2 remained completable through the final decision and writing terminal while retaining its conversation.
- API probe reproduced the previous model_unavailable error for mistral-small-3.1-24b; a currently listed model returned HTTP 200 with browser CORS enabled.

The shared transport reads the live LLM7 catalogue. It does not embed credentials and only considers chat entries explicitly marked non-usage-only in the free/turbo tiers. Availability and anonymous quotas are provider-controlled. Failures are visible; canned replies are never substituted for model output. Teacher reference retrieval uses the existing subject/module filtering. The mission result contains both sides of the AI dialogue and model IDs; AI dialogue is not graded as a measure of language competence.

The main-page update retains the local, previously unpublished group/scroll/voice UI fixes rather than reverting them to the older committed version. Microphone hardware was not tested in this AI change.

## Response-depth revision (2026-09-24)

Removed the under-100-word limit and mandatory closing question in all three AI interfaces. Increased the output allowance to 1200 tokens and retained up to 24 recent messages. A shared policy permits explanations, short correction examples and requested-language coaching while keeping operational facts constrained. Nemo is preferred when anonymously available, with the existing fallbacks retained.

Seven automated checks pass, including delivery of earlier conversation and shared instructions to the provider. A live two-turn test produced an expanded ETA/berth explanation, then a Spanish explanation without asking again for the ETA. The second answer still repeated much of the first explanation: this is a remaining qualitative limitation, not proof of pedagogical effectiveness or elimination of repetition.

## Operational missions 2–4 (2026-09-24)

`operations.test.cjs` validates all 24 phase transitions, required evidence and selections, rejection of unsupported selections, final packet status, preservation of drafts after upstream edits, and delayed release of historical findings. AI context tests cover current-stage provenance, actual prose instead of selection labels, language instructions and a regression for an invented pilot boarding time.

Manual browser QA: all eight phases of each mission completed under explicitly synthetic QA participants; missing-evidence submission blocked; reload restored completion; M4 finished with D-03 still open. Live inference exposed a Nemo source/language error, leading to shorter role-specific contexts, explicit explanation language and a limited mismatch audit with one corrective retry. This audit is not a factual verifier for all possible model outputs.

Sources: supplied `WEEK 2-3.pdf` (56 pages) and `RickmersDubai.pdf` (MAIB report 29/2014, October 2014; 88 PDF pages). Mission 2 is an original fictional coordination scenario grounded in Week pp.2–22. Mission 3 paraphrases the report's chronology and attributed findings; original diagrams are explanatory schematics, not radar or authentic evidence. Mission 4 is fictional and uses Week pp.46–55 plus location/reporting work; it does not invent findings in the Hoegh Osaka or Rickmers Dubai investigations. Page references distinguish PDF pagination from printed report pages in mission source cards. Original PDFs and third-party figures are not redistributed.

The final JSON preserves answers, attempts, source reads, AI exchanges, withheld responses, scenario provenance and workflow status. Markdown provides a readable record. Text length is a completeness check only; source opening is not proof of comprehension. No automated language/competence score is awarded and no learning-effect claim has been tested. Duration labels are planning estimates, not measured learner completion times. AI uses the existing anonymous provider and may rate-limit or fail; core progression and export do not depend on successful inference.


## Mission usability revision (2026-09-24, ui3)

Replaced the three-column layout with an interactive scenario graphic, a three-action Spanish guide, adjacent source reading/writing areas and an on-demand AI workshop attached to each prose field. All 24 phases have explicit action and delivery guidance. Original SVG scenes include keyboard-accessible evidence points; Rickmers record views can be compared only after the later source is released. The fictional Meridian overview and its reference text use the same bow/port orientation.

AI reviews and conversations are scoped by mission phase, selected prose field and interaction mode. Operational rehearsal is available only for addressed messages, with the actual recipient (for example AB versus gangway watch). Reflections and reports use review. Selecting a multiple-choice answer cannot count as a draft. The reviewer prioritizes all material source contradictions before style, explains corrections and leaves revisions/submission to the learner. The provider and its limitations remain unchanged; this is not a guarantee of factual correctness.

Regression QA: complete browser runs of M2, M3 and M4 after the redesign; source hotspots and historic record toggle; preservation of final progress; desktop visual inspection and 390px iframe check (no horizontal overflow). Live Nemo review identified all three planted contradictions in a draft: unconfirmed pilot time, admission on escort alone, and an incomplete manifest labelled complete. Rehearsal targeted the AB; a gratuitous request for the OOW's name prompted a further roleplay instruction to use stated roles and read back an already complete order. Automated tests additionally check per-field context isolation, actual recipients, and the 24 action guides. These are software/qualitative checks, not student learning-outcome measurements.
