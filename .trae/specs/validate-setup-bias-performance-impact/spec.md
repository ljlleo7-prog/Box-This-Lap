# Setup-Bias Performance Impact Validation Spec

## Overview

This spec validates that setup bias produces consistent and explainable performance differences between qualifying and race contexts. The scope is validation-first: prove the current model captures expected trade-offs, and only tune coefficients if objective assertions fail.

## Qualifying Validation Goals

- Define a deterministic setup matrix using ideal, low-drag, high-downforce, and off-balance variants.
- Confirm single-lap trade-offs remain coherent:
  - low-drag improves straight-line and top-speed proxies
  - high-downforce improves low/medium-speed cornering and traction-related acceleration proxies
  - off-balance reduces consistency compared with ideal
- Require the ideal setup to be best or tied-best in qualifying score within explicit tolerance.

## Race Validation Goals

- Reuse the same setup matrix for race-style scoring with stronger consistency and degradation penalties.
- Verify setup effects persist in race behavior:
  - low-drag keeps straight-line gains but incurs higher stint degradation
  - high-downforce improves sustained race-stint score versus low-drag
  - off-balance is penalized more in race context than in qualifying context
- Require the ideal setup to be best or tied-best in race-stint score within explicit tolerance.

## Validation Constraints And Tolerances

- Use fixed tolerance thresholds for sector deltas, top-speed proxies, cornering composite, consistency proxies, degradation, and score deltas.
- Keep all assertions reproducible under deterministic simulation inputs.
- Treat assertion failures as model-validation failures, not documentation-only issues.

## Coefficient Tuning Policy

- Tune setup-to-physics conversion weights only when qualifying or race validation assertions fail.
- Preserve existing setup feedback behavior unless a failing assertion directly requires a change.
- Re-run the full qualifying and race validation matrix after each coefficient adjustment.

## Verification Requirements

- Run typecheck, lint, and build checks.
- Run updated simulation validation tests that cover qualifying and race setup-bias probes.
- Record command outputs and confirm all assertions pass before closing the checklist.
