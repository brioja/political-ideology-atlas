# Future deepening, after all audits are valid

Extra passes of audits that are already valid under the current rules, to make them deeper. None of these runs
until every audit is valid. Until then, a later pass goes to the re-audit queue and then to the oldest-rules
audits. A valid audit is not passed again just because a new source arrived. What decides it: every audit is on the
current rules.

## Marxists Internet Archive authors restored (2026-11-25)

The local marxists.org corpus had no texts from Stalin, Mao, Bakunin, Kropotkin, Goldman, Bernstein, Ho Chi Minh or
Castro. `fetch.sh` looked for them under `archive/<name>/`, but on the site they are under `reference/archive/`
(Castro under `history/cuba/archive/`), and the empty folders were still marked finished. That is now fixed and
those texts are being downloaded again. Valid audits whose key figures are among these authors:

- **Ho Chi Minh Thought** (42 stated positions; off the site): the ideology audit used 4 of Ho's texts, while the
  Ho Chi Minh person audit used 24 of them and answers 55 statements the ideology audit leaves null. Its key works
  *Đường Kách mệnh* and *Di chúc* (Testament) were listed but not opened.
- **Maoism** (74): Mao.
- **Stalinism** (141): Stalin.
- **Anarchism** (302): Bakunin, Kropotkin, Goldman.
