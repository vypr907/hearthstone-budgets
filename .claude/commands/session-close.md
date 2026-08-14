Read docs/SESSION.md, docs/CONTEXT.md, and docs/CHANGELOG.md.

1. Summarize SESSION.md entries into new dated entries appended to
   docs/CHANGELOG.md, matching its existing format (## <date> – <short title>,
   then ### Completed / relevant subsections). Do not rewrite or reformat
   existing CHANGELOG entries — append only. If SESSION.md has a ## Backlog
   section, move/update those items into docs/TODO.md.
2. Update docs/TODO.md with work done since last update. Remove completed
   items — TODO.md is current open items only, not history.
3. Update docs/CONTEXT.md's "Current Status" phase list and any "Locked
   Decisions" / "Important Rules" sections affected by SESSION.md content
   (new fields, tables, behavior). Preserve CONTEXT.md's existing structure
   and brevity — do not let it grow into a changelog.
4. Clear docs/SESSION.md back to an empty template (just "## Session Notes",
   no entries).

After all edits, run `git diff -- docs/CHANGELOG.md docs/TODO.md
docs/CONTEXT.md docs/SESSION.md` and show the output. Do not git add or
commit — wait for explicit confirmation.