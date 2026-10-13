# P007 publication checks

Independent Astra accepted production sourcee13d6c1. Candidate8a2b976 included
35 independently authored review probes. All35 and typecheck passed locally,
but exact-head GitHub runs38461590872 and38461583372 failed because the native
probe helper specified a local review-worktree cwd absent on Linux runners.
spawnSync reported ENOENT for that missing cwd. Typecheck passed in both runs.

Root fixes only the test helper cwd to join(__dirname, ".."). It uses the same
version-checked Node executable, native programs, input domain and assertions;
no VM production source or expectation changes. This is root's integration
portability mistake, not a matcher semantic defect. Prior independent evidence
and source verdict remain preserved. Focused35-probe/typecheck reruns and new
exact-head CI are the publication gate. No master integration or release.
