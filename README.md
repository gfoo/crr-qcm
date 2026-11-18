# CRR maritime quiz

Unofficial, progressive multiple-choice trainer for the French **CRR** — *Certificat restreint
de radiotéléphoniste du service mobile maritime*, the VHF operator exam run by the ANFR.
The site is in French.

**Site:** <https://gfoo.github.io/crr-qcm/>

## What it does

- **Path**: 15 lessons, from the most practical (channels, priorities, MAYDAY) to the most
  theoretical (GMDSS zones, waves, beacons). Each opens with a summary sheet and a memory tip,
  then series of 12 questions. A lesson is validated once 80 % of its questions are known,
  which unlocks the next one.
- **Daily review**: spaced repetition. A wrong answer comes back in the next review; a right
  one comes back after 1, 3, 7, then 15 days.
- **Mock exam**: 24 questions drawn 6 / 8 / 10 across the three exam parts, 22 seconds each,
  no going back, pass mark checked part by part.
- **Erase everything**: a red button at the top of the home page, tapped twice to confirm.
- **Progress panel**: questions seen, known and anchored, level per exam part, last mock exams,
  and an "exam ready" checklist.
- Every explanation cites the page of the official manual it comes from.

## Where progress is kept

In the visitor's own browser (`localStorage`): nothing is sent anywhere, and each person keeps
their own progress. The home page says so at the top, in red: always use the same phone and the
same browser — the site is designed for smartphones. On an iPhone, add the site to the home
screen, otherwise Safari erases a site's data after seven days without a visit.

## Source

The 260 questions were written from the ANFR preparation manual, maritime, June 2025 edition
(V16), which remains the reference:
<https://www.anfr.fr/fileadmin/mediatheque/documents/radiomaritime/manuel-crr-maritime-25_-_tableau_vhf.pdf>.
This project is not affiliated with the ANFR. Official CRR page:
<https://www.anfr.fr/gerer/radiomaritime/le-crr>.

## Files

| File | Role |
|------|------|
| `index.html` | Page shell |
| `app.js` | The trainer |
| `questions.js` | Lessons and questions — in each entry, the first answer of `a` is the right one (shuffled on display) and `p` is the manual page |
| `style.css` | Styles, light and dark |

No build step: the files are served as they are.
