# Tasks
- [x] Task 1: Define performance validation matrix for setup variants
  - [x] SubTask 1.1: Select representative setup variants (ideal, low-drag, high-downforce, off-balance)
  - [x] SubTask 1.2: Define measurable outputs (sector deltas, top speed, acceleration proxy, consistency)
  - [x] SubTask 1.3: Set tolerance rules for pass/fail under deterministic test conditions

- [x] Task 2: Implement qualifying-focused validation scenarios
  - [x] SubTask 2.1: Add repeatable qualifying simulation comparisons for chosen setup variants
  - [x] SubTask 2.2: Assert explainable trade-offs (straight-line gains vs cornering losses, etc.)
  - [x] SubTask 2.3: Assert ideal setup is best or tied-best within tolerance

- [x] Task 3: Implement race-focused validation scenarios
  - [x] SubTask 3.1: Add race-stint comparison scenarios for the same setup variants
  - [x] SubTask 3.2: Assert setup-driven differences persist in race pace/consistency behavior
  - [x] SubTask 3.3: Assert race behavior differs meaningfully from qualifying outcomes

- [x] Task 4: Align model coefficients if validations fail
  - [x] SubTask 4.1: Tune setup-to-physics conversion weights only where assertions fail
  - [x] SubTask 4.2: Keep existing bias-feedback behavior intact unless explicitly required
  - [x] SubTask 4.3: Re-run full validation matrix after each coefficient adjustment

- [x] Task 5: Final verification and regression checks
  - [x] SubTask 5.1: Run typecheck, lint touched files, and build
  - [x] SubTask 5.2: Run updated simulation tests and confirm all assertions pass
  - [x] SubTask 5.3: Summarize observed setup-performance relationships from test outputs

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 2 and Task 3
- Task 5 depends on Task 4
