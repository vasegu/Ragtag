# Resource allocation model

Version 0.1.0 · 1 November 2026 · **Proposed optimisation specification**

Inputs: severity assessment outcomes and verified operational resource
availability. Their required fields and interpretation are defined below.

This document contains the full optimisation model, configuration, synthetic
worked instance and verification result. No companion files are required.

This specifies a decision-support scheduler. It is not an implemented solver,
a live deployment or council-approved allocation policy. All objective ordering,
planning windows and tie-breaks below are proposed. No dispatch is authorised
by a model result alone.

## 1. Decision and approach

Choose **which actions to do, with which qualified resources, at what time,
using which eligible funding**, while making every unresolved or blocked action
visible. Return a feasible schedule and an explicit unscheduled/escalation list.

A sorted severity queue ignores travel, shared equipment and prerequisites.
A budget-only knapsack ignores when crews can work. Use a **resource-constrained
scheduling model with optional tasks and precedence**, with route/transition
constraints and a sequence of priority objectives. A CP-SAT formulation is a
suitable implementation choice; interval precedence and non-overlap are standard
scheduling constructs. [Official scheduling reference](https://developers.google.com/optimization/scheduling/job_shop).
Do not assume a solver has been installed or run here.

Use a rolling seven-day horizon with 15-minute planning slots. The next 24 hours
are the detailed dispatch proposal; later work is provisional. Publish in
Europe/London while calculating elapsed durations from offset-aware instants.
Round required durations/travel up, release times up and completion deadlines down
to the grid, retaining exact timestamps for validation. Keep sub-slot emergency
actions in the duty workflow; never wait for the next optimisation run.

## 2. Convert ranked issues into action tasks

One resident report is not necessarily one job. Each task references case/hazard
IDs and the exact assessment revision used.

| Ranking outcome / evidence | Planning treatment |
|---|---|
| S0 or credible immediate danger | Alert duty service immediately. Record accepted response as reserved/locked work. If capacity is unavailable, escalate immediately; never wait in the ordinary queue. |
| S1–S3 with supported diagnosis | Generate competent inspection, make-safe and repair actions as needed, with separate requirements and deadlines. |
| U / uncertain policy / missing measurements | Generate assessment or policy-resolution tasks; do not invent a permanent-repair specification or use precautionary S1 as assessed S1. |
| S4 | Only monitoring or closure-review tasks explicitly required by the assessor; never consume repair materials merely because a report exists. |
| External asset owner | Handoff/coordination task and any separately authorised council protective action. External crews cannot be assigned as council resources. |
| Duplicate / suspected common cause | Merge only verified duplicate work. Keep distinct hazards and obligations. A nearby cluster does not prove that one excavation fixes everything. |

Required task fields:

```text
task_id, case_ids, hazard_ids, assessment_revision, action_type, specification,
severity_or_assessment_urgency, responsible_service, authorised_work_scope,
release_at, duration_upper_bound, required_skills, crew_size_or_team_id,
vehicles_and_plant, material_quantities, location, access_and_permit_windows,
predecessor_ids, accepted_intervention_outcomes, funding_eligibility,
cost_upper_bound_and_basis, confirmed_action_deadlines, evidence_and_validity
```

Durations/costs come from approved work templates, competent estimates or accepted
contractor quotes. They are **not** derived from S1/S2/S3. If unavailable, generate
an estimating/inspection task and leave the repair `blocked_missing_work_spec`.
Repairs dependent on an inspection result remain conditional backlog, not an
unconditional scheduled repair. An illustrative assumption belongs only in demo mode.

## 3. Operational availability contract

The public register identifies resource types; every resource in it currently
has unknown live availability and is disabled as a solver capacity.

Enable a capacity only with provider approval, provenance, `verified_at`,
`valid_until`, planning window, compatible units and a current reservation ledger.
Availability must remain valid for the entire assignment; verify again before
dispatch. A legitimate zero means no capacity. Null means unconfirmed and blocks
that assignment, with a request to resolve it.

- **Teams/people:** qualified team composition, shifts, breaks, committed jobs,
  permitted overtime and emergency reserve. A team and its component staff share
  the same physical-person IDs; never count both as independent capacity.
- **Vehicles/plant:** specific usable units, attachments, operators, downtime,
  charge/fuel, load limits and depot. Sharing one vehicle creates one constraint.
- **Materials:** usable unreserved stock by item, unit, location and confirmed
  replenishments. Reservations and consumption must not be subtracted twice.
- **Budgets:** authoritative funding-pool IDs and spendable incremental balances,
  eligible work, commitments, VAT treatment and authorised transfers. No use of
  an annual gross budget as remaining funds; parent and component envelopes are
  not independent pools. Never add grant income again to a budget it already funds.
- **Contractors:** current term, authorised call-off, accepted capacity window,
  quoted rates and mobilisation. A framework place is not a reserved crew.
- **Access:** site permissions, permits, traffic management, approved work hours,
  weather limits, disposal facilities and required public access.

Use net free calendars after existing work/reserves **or** gross calendars with
locked intervals, not both. Each snapshot declares its basis. Revalidate all
assumptions when a reservation, weather or control changes.

## 4. Hard constraints

Every published plan must satisfy all applicable constraints below.

1. **Eligibility:** correct skill, team size, asset responsibility, work
   authorisation, contractor acceptance and fund eligibility.
2. **Time:** release, shifts, breaks, permits/access/weather windows, travel,
   setup, execution and return/disposal where required. A phone line's opening
   hours do not define a repair crew shift.
3. **No double booking:** people, teams, vehicles and exclusive work areas cannot
   overlap; pooled equipment cannot exceed its verified capacity.
4. **Dependencies:** a prerequisite must be verified completed or scheduled to
   finish first; curing, isolation and access lags apply. Conditional findings
   require a new planning decision after inspection.
5. **Materials:** cumulative consumption cannot exceed stock plus confirmed
   receipts available by that time, respecting depot/load compatibility.
6. **Money:** incremental charges cannot exceed any funding pool's uncommitted
   balance. Split funding requires an approved allocation summing to the full
   charge; one invoice is never counted twice. Budget approval still applies
   when salary cost is already committed and incremental labour cost is zero.
7. **Confirmed obligations:** preserve each inspection, make-safe, communication
   or repair deadline separately, with its scope, start event and authority.
   Candidate deadlines or unresolved policy clocks remain unresolved, not fabricated.
8. **Existing commitments:** lock accepted/in-progress work; interruption requires
   a safe stoppage method and explicit duty-controller authorisation. Reserve
   capacity is unavailable to ordinary work unless expressly released.

Bundling is an optional delivery mode with validated joint duration, cost,
materials and task coverage, not an automatic distance discount. It must honour
every covered action's deadline, skills and prerequisites. Per-action completion
times within a bundle must be specified; conservative default is bundle end.

Travel is sequence-dependent. Use directed transition times between consecutive
jobs and depots, or approved fixed routes with explicit reservations. Sum the
actual transitions; do not add the same depot round trip per job and also a route
distance. If transition information is missing, the affected route is unconfirmed.

## 5. Formal model

This finite placement formulation can be implemented in CP-SAT or integer
programming. Optional interval variables can avoid enumerating every start time.

Let P be feasible action placements. Placement p specifies covered tasks Bp,
resources and occupied slots, service completion time fip for each covered action,
fund charges cbp, material draws qmp and a compatible route/transition choice.
Let xp be 1 when placement p is selected. Let yi indicate that task i is scheduled.

**Task coverage:**

```text
sum(xp for p covering i) = yi,   yi in {0,1}
```

This prevents selecting both a bundle and standalone work for the same action.
Alternative inspection/remedy specifications require explicit mutually exclusive
groups. Do not create a second copy of the same physical job to gain more credit.

For resource r and slot t, with usage arpt and verified free capacity Art:

```text
sum(arpt * xp) <= Art
```

Add route-order constraints so each crew/vehicle follows one continuous feasible
path, with depot start/end and travel lags. Occupancy alone does not enforce
geographic feasibility. For predecessor i of j:

```text
yj <= completed_before_horizon(i) + yi
start(j) >= finish(i) + required_lag    when both selected
```

For fund b and material m:

```text
sum(cbp * xp) <= available_incremental_balance(b)
cumulative_material_draw(m,t) <= initial_free_stock(m) + confirmed_receipts(m,t)
```

Task i with a confirmed mandatory completion by di inside the horizon requires
`yi = 1` and `finish(i) <= di`. Already-completed obligations require evidence,
not another placement. An overdue action cannot be made retroactively compliant;
it remains a recorded breach and receives a recovery plan with a separately
approved recovery target. Beyond-horizon obligations need lookahead feasibility
checks and reservations; the seven-day plan cannot certify their eventual delivery.

### Measure outcomes per hazard, not per report or task

For each known hazard h, a competent work specification defines acceptable
**control recipes**, each a set of prerequisite/intervention actions plus any
control expiry. Let vh(t) be 1 if an existing verified control is valid at t, or
at least one complete selected recipe is forecast to be valid by t. AND every
action in a recipe, OR alternative complete recipes; enforce equivalence, not
merely a one-sided implication the optimiser could exploit. Unscheduled actions
cannot supply control credit.

Record `uh = 1 - vh(horizon_end)` and
`Th = sum(1 - vh(t))` over future planning slots. Th is **uncontrolled planning
time**, not expected injuries. Temporary protection and permanent repair can both
be necessary, but their benefits are not added twice for the same hazard. Keep
permanent-work obligations outstanding after making safe. Controls that expire
inside the horizon stop contributing unless renewed.

Scheduled control is a forecast contingent on successful completion. Only a
verified field outcome updates the live ranking assessment or closes an action.
U reports produce assessment outcomes rather than invented hazard-benefit values.

## 6. Objective: sequential priorities

First solve strict feasibility for all confirmed in-horizon obligations and
locked work. **Never use a soft lateness penalty to call a noncompliant plan feasible.**
Subject to feasibility, minimise the following vector lexicographically: optimise
one component, preserve its proven optimum, then optimise the next.

1. S1: number of known hazards uncontrolled at horizon end; then total uncontrolled time.
2. Urgent U/safety assessment tasks: unfinished count; then completion time capped
   at horizon end, with unscheduled tasks assigned the horizon length.
3. S2: uncontrolled hazard count; then uncontrolled time.
4. Other required assessment tasks: unfinished count; then capped completion time.
5. S3: uncontrolled hazard count; then uncontrolled time.
6. Outstanding specified permanent-remedy tasks without earlier mandatory dates:
   unfinished count. They receive no duplicate control-benefit credit.
7. Within these preserved outcomes, favour older comparable tasks: minimise the
   sum of snapshot waiting-age minutes for unfinished tasks. Age is not severity.
8. Minimise changes to accepted, still-movable plan assignments; then travel/setup
   minutes; then total incremental cost; finally use stable IDs to break ties.

This ordering explicitly chooses safety coverage before efficiency and can prefer
more completed hazards within the same class. Inspect that tradeoff during
calibration. Do not sum raw 1–25 ordinal risk as if it were expected risk reduction,
or let many S3 jobs buy the deferral of an S1 hazard. No numeric priority weights
or effectiveness estimates are presented as council policy.

Record each stage's incumbent, bound and status. A timeout yielding FEASIBLE
does not prove optimality. If a higher-priority stage is not proven optimal, later
stages may preserve its incumbent as a pragmatic proposal, but label the entire
result `feasible_not_proven_optimal`; do not claim lexicographic optimality.
[CP-SAT status reference](https://developers.google.com/optimization/cp/cp_solver).

Fairness is initially an audit: service rates and waits by ward, severity and
need/assessment coverage. An optional approved geographic service constraint can
be enabled only with a defined comparable-demand denominator and feasibility
review; it cannot displace emergency actions or relax a confirmed obligation.
Equal report counts or equal jobs per ward are not evidence of equal need.

## 7. Infeasibility, uncertainty and rolling operation

- **Unknown work/capacity:** return blocked tasks with precise missing fields and
  data-owner requests. Unavailable evidence is distinct from confirmed zero supply.
- **No feasible compliant schedule:** retain physical/skill/budget limits and
  produce a diagnostic recovery proposal that explicitly lists unmet obligations.
  Do not describe it as compliant or a dispatchable strict plan. A conflict set
  may be sufficient rather than minimal; identify it honestly.
- **Capacity gap:** identify the required skill/vehicle/material and time window.
  Quantify extra capacity only when computed by a separate feasible augmentation
  scenario; do not guess “one more crew fixes it”. Overtime, reserve release,
  contractor call-offs and transfers each require explicit authorisation.
- **Emergencies:** immediate escalation is independent of solve status. Retain
  the issue and response acknowledgement even if no local crew can be allocated.
- **Replan:** on a new emergency, changed assessment, completion/failure, absence,
  contractor rejection, stock change, permit/weather change or expired evidence.
  Keep current work and a proposed next-two-hour freeze unless a controller
  authorises a safe change. Never silently reset policy clocks or severity.

Use approved upper duration/cost/travel bounds for the base plan and test adverse
scenarios. Bounds are not guarantees against every disruption; retain reserve
and report scenarios that miss requirements. Do not multiply capacity by confidence.

## 8. Output and explanation

```text
plan_id, mode, snapshot_time, horizon, ranking_version, resource_snapshot_id,
solver_status, objective_stage_results, optimality_proven,
assignments[{task_ids, case_ids, action, crew, shared_resources,
             start_at, finish_at, funding_charges, materials,
             prerequisites, confirmed_deadlines, predicted_control_effect,
             assignment_status, evidence_refs}],
unscheduled[{task_id, reason_codes, blockers, escalation_owner}],
unmet_or_unresolved_obligations, resource_usage_and_remaining,
service_coverage_audit, changes_from_previous_plan, human_acceptance
```

Reason codes distinguish `unknown_capacity`, `confirmed_capacity_exhausted`,
`missing_specification`, `pending_inspection`, `unconfirmed_deadline`,
`no_eligible_funding`, `missing_material`, `no_qualified_team`, `access_or_permit`,
`external_owner_handoff`, `outside_horizon` and `lower_priority_tradeoff`.
A solver can establish the last explanation by a forced-inclusion counterfactual:
show the extra cost or higher-priority outcome lost, rather than invent a rationale.

An output's assignments are proposals until accepted. Reserve shared resources
atomically against the latest ledger before dispatch; reject stale/conflicting
acceptance and replan. Resident updates describe accepted work and genuine
uncertainty, not a hypothetical solver slot as a promised appointment.

## 9. Synthetic worked instance

The example below uses **invented** capacity/costs, not Hackney's real supply.
Four one-hour slots, one civil crew, one shared vehicle, two material units and
£700 eligible funds. All starts, durations and transitions are explicit; tasks
are co-located except C, whose approved two-slot mode includes extra travel/setup.

| Task | Outcome | Duration | Cost | Material | Requirement |
|---|---|---|---|---|---|
| A | Control one S1 hazard | 2 slots | £400 | 1 | Finish by slot 2 |
| B | Control one S2 hazard | 1 slot | £200 | 1 | After A |
| C | Control another S2 hazard | 2 slots | £200 | 1 | Remote mode, released at slot 2 |
| D | Control one S3 hazard | 1 slot | £100 | 0 | Independent |

The optimal toy plan is **A [0,2), B [2,3), D [3,4)**: £700 and two materials.
C remains unscheduled. A+C meets the same S1 deadline and controls one S2 hazard,
but controls it later and leaves the S3 hazard unresolved. Doing A+B without D
has the same S2 outcome but worse end-of-horizon S3 coverage. No unknown capacity,
unfunded job or double booking is hidden in the result.

The tiny example can be verified by exhaustive enumeration; that does not prove
optimality or performance for a realistic council workload. With actual public
resource data alone, the correct present result is **capacity unconfirmed**, not
this synthetic schedule relabelled as Hackney's plan.

## 10. Acceptance checks before implementation/use

Check emergency bypass; expired/null/zero capacity; shared people and vehicles;
fund eligibility and parent-pool double counting; cumulative material arrivals;
precedence/inspection conditions; route transitions and depot return; bundle
coverage/deadlines; independent safety/permanent clocks; control expiry; duplicate
credit; U assessment; infeasible mandatory work; late/unknown solver status;
replanning and reservation conflicts. Compare the same inputs with a feasible
severity-first baseline, recording coverage, uncontrolled time, deadlines, travel,
cost and unserved demand. Report simulations separately from real service outcomes.

## Complete configuration

<details>
<summary>Structured allocation rules and 14 acceptance scenarios</summary>

```yaml
version: 0.1.0
as_of: '2026-11-01'
status: proposed_uncalibrated
origin: proposed_allocation_design_not_council_policy
execution:
  default_mode: operational_evidence_only
  allowed_modes:
  - operational_evidence_only
  - synthetic_demo
  mix_demo_and_operational_capacity: false
  automatic_dispatch: false
  automatic_case_closure: false
  human_acceptance_required: true
  reserve_atomically_before_dispatch: true
  reject_stale_resource_snapshot: true
  mutate_ranking_severity_to_fit_capacity: false
planning:
  horizon_calendar_days: 7
  detailed_proposal_hours: 24
  slot_minutes: 15
  publication_timezone: Europe/London
  elapsed_time_basis: offset_aware_instants
  duration_rounding: up
  travel_rounding: up
  release_rounding: up
  deadline_rounding: down
  exact_deadlines_rechecked: true
  proposed_freeze_minutes: 120
  emergency_waits_for_solve: false
  subslot_emergency_actions: duty_workflow_outside_grid
  overdue_obligation: recorded_breach_plus_approved_recovery_target
  beyond_horizon_obligation: lookahead_feasibility_and_reservation_not_compliance_guarantee
intake:
  preserve:
  - case_id
  - hazard_id
  - assessment_revision
  - model_version
  - evidence_refs
  S0: immediate_duty_alert_and_accepted_response_reservation
  S1_S2_S3: specified_inspect_make_safe_repair_actions_as_applicable
  U: assessment_tasks_not_invented_permanent_repairs
  precautionary_level_becomes_assessed_severity: false
  S4: assessor_required_monitoring_or_closure_review_only
  external_owner: handoff_plus_separately_authorised_protective_action
  duplicate: no_duplicate_physical_work_or_benefit_credit
  root_cause: conditional_until_supported
  unknown_work_specification: estimating_or_inspection_task
  inspection_dependent_repair: conditional_backlog_until_findings_confirmed
task_contract:
  identity:
  - task_id
  - case_ids
  - hazard_ids
  - assessment_revision
  action_types:
  - assess
  - inspect
  - make_safe
  - permanent_repair
  - renew_control
  - monitor
  - communicate
  - handoff
  - estimate
  - resolve_policy
  required_for_candidate_assignment:
  - approved_specification
  - responsible_service_and_authorised_work_scope
  - release_at_and_duration_upper_bound
  - required_skills_and_team_composition
  - location_and_access_windows
  - vehicles_plant_and_material_quantities_or_explicit_none
  - predecessors_and_lags_or_explicit_none
  - eligible_funding_and_cost_upper_bound
  - evidence_validity
  deadlines:
    separate_per_action: true
    require:
    - applicability_confirmed
    - start_event_confirmed
    - due_at
    - authority
    - evidence_ref
    candidate_or_ambiguous_clock: unresolved_review_not_fabricated_due_at
    calendar_arithmetic_in_solver: false
    current_scope_owner_confirmation_required: true
  estimation:
    accepted_inputs:
    - approved_template
    - competent_estimate
    - accepted_contractor_quote
    numerical_severity_implies_duration_or_cost: false
    base_plan_uses: approved_upper_bounds
availability:
  context_source: embedded_available_resources_document_register
  published_quantity_is_solver_capacity: false
  null: unknown_blocks_assignment_and_creates_data_request
  zero: confirmed_no_capacity
  unknown_is_unlimited: false
  resource_kinds:
  - qualified_team
  - person
  - vehicle
  - plant
  - material
  - fund
  - contractor_slot
  - worksite
  required:
  - resource_id
  - provider
  - approved_quantity
  - unit
  - window
  - verified_at
  - valid_until
  - evidence_ref
  - reservation_ledger_revision
  validity_covers_entire_assignment: true
  reserve_quantity: service_defined_requires_confirmation
  calendar_basis: exactly_one_of_gross_with_locked_intervals_or_net_free
  shared_person_ids: enforce_team_and_component_person_exclusivity
  contractor_framework_implies_available_slot: false
  vehicle_procurement_implies_operational_unit: false
  fund_pool_ids: authoritative_disjoint_incremental_balances_or_explicit_shared_caps
  fund_eligibility: confirmed_per_task
  split_funding: approved_charges_sum_to_total_cost_once
  cost_basis: incremental_cash_with_consistent_VAT_and_no_salary_double_charge
  material_basis: free_stock_plus_confirmed_time_located_receipts
constraints:
  non_relaxable:
  - skills_and_team_composition
  - authorised_work_scope_and_provider_acceptance
  - valid_shift_break_access_permit_weather_windows
  - people_team_vehicle_plant_and_worksite_capacity
  - route_continuity_transition_and_depot_requirements
  - precedence_and_required_lags
  - cumulative_material_balance
  - eligible_funding_pool_balance
  - accepted_work_and_reserve_locks
  strict_plan_also_requires:
  - every_confirmed_in_horizon_obligation_completed_by_exact_deadline
  bundles:
    enabled_only_when: approved_joint_work_specification
    require:
    - covered_task_ids
    - resource_usage
    - duration
    - costs
    - materials
    - per_action_completion_times
    completion_time_default: bundle_end
    automatic_distance_discount: false
    standalone_and_bundle_cover_same_task: mutually_exclusive
  travel:
    method: directed_transitions_or_approved_fixed_routes
    include:
    - depot_departure
    - between_jobs
    - disposal_if_needed
    - required_return
    missing_transition: route_unconfirmed
    duplicate_round_trip_and_route_charge: prohibited
  task_preemption:
    default: prohibited
    exception_requires:
    - safe_stop_method
    - explicit_duty_controller_authorisation
optimisation:
  formulation: resource_constrained_optional_task_scheduling
  proposed_solver_family: CP_SAT_or_integer_programming
  integer_units:
  - time_slots
  - pence
  - declared_material_base_units
  first_stage: strict_feasibility
  task_selected: at_most_once_including_bundle_alternatives
  hazard_control:
    recipes: OR_of_complete_AND_action_sets
    current_control_credit: verified_and_valid_only
    future_control_credit: forecast_contingent_on_successful_recipe_completion
    require_logical_equivalence: true
    expiry_and_renewal: represented_per_time_slot
    duplicate_benefit: prohibited
    permanent_obligations_survive_make_safe: true
    update_live_severity: only_after_verified_outcome
  objective_type: lexicographic_sequential_solve
  stages:
  - id: S1_uncontrolled_end
    minimise: uncontrolled_known_S1_hazard_count_at_horizon_end
  - id: S1_uncontrolled_time
    minimise: uncontrolled_known_S1_hazard_slots
  - id: urgent_assessments_unfinished
    minimise: urgent_assessment_unfinished_count
  - id: urgent_assessments_time
    minimise: urgent_assessment_completion_slots_unscheduled_equals_horizon
  - id: S2_uncontrolled_end
    minimise: uncontrolled_known_S2_hazard_count_at_horizon_end
  - id: S2_uncontrolled_time
    minimise: uncontrolled_known_S2_hazard_slots
  - id: other_assessments_unfinished
    minimise: other_required_assessment_unfinished_count
  - id: other_assessments_time
    minimise: other_required_assessment_completion_slots_unscheduled_equals_horizon
  - id: S3_uncontrolled_end
    minimise: uncontrolled_known_S3_hazard_count_at_horizon_end
  - id: S3_uncontrolled_time
    minimise: uncontrolled_known_S3_hazard_slots
  - id: permanent_work_unfinished
    minimise: specified_permanent_work_unfinished_count
  - id: waiting_age
    minimise: snapshot_waiting_age_minutes_of_unfinished_comparable_tasks
  - id: plan_changes
    minimise: changed_accepted_movable_assignments
  - id: travel_setup
    minimise: travel_and_setup_minutes
  - id: incremental_cost
    minimise: incremental_cost_pence
  - id: stable_tie_break
    minimise: canonical_assignment_signature
  raw_ordinal_risk_as_expected_harm: false
  arbitrary_big_weight_sum: false
  stage_optimum_preserved_before_next: true
  stage_timeout:
    preserve_feasible_incumbent_if_used: true
    claim_lexicographic_optimality: false
    output_status: feasible_not_proven_optimal
  report:
  - stage_status
  - incumbent
  - best_bound
  - elapsed_time
  - proven_optimal
fairness:
  mode: audit_only
  compare:
  - coverage_by_ward_and_severity
  - waits_by_ward_and_severity
  - unassessed_demand
  - unserved_demand
  equal_report_counts_imply_equal_need: false
  automatic_ward_weight: null
  optional_service_constraint_requires:
  - approved_definition
  - comparable_demand_denominator
  - feasibility_review
  may_relax_emergency_or_confirmed_obligation: false
failure_handling:
  missing_data: blocked_with_specific_fields_and_data_owner
  infeasible_strict_plan: unmet_obligations_and_explicit_noncompliant_recovery_proposal
  soften_physical_or_skill_or_budget_limits_in_recovery: false
  conflicts_reported_as_minimal_only_if_proven: true
  extra_capacity_number_requires: separately_solved_authorised_augmentation_scenario
  override_authorisation_required_for:
  - overtime
  - reserve_release
  - new_calloff
  - budget_transfer
  - safe_preemption
  not_found_or_timeout: no_false_infeasibility_or_optimality_claim
replan_on:
- emergency_or_changed_severity
- action_completion_or_failure
- staff_absence_or_provider_rejection
- stock_or_vehicle_change
- permit_access_or_weather_change
- expired_evidence_or_reservation_conflict
output:
  assignment_status: proposed_until_human_acceptance
  required:
  - plan_and_input_snapshot_ids
  - mode_and_validity_window
  - stage_results_and_optimality_status
  - assignments_and_resource_reservations
  - action_deadlines_and_predicted_control_effects
  - unscheduled_tasks_and_reason_codes
  - unmet_and_unresolved_obligations
  - resource_usage_and_remaining_balances
  - fairness_and_coverage_audit
  - human_acceptance_and_changes_from_previous_plan
  reason_codes:
  - unknown_capacity
  - confirmed_capacity_exhausted
  - missing_specification
  - pending_inspection
  - unconfirmed_deadline
  - no_eligible_funding
  - missing_material
  - no_qualified_team
  - access_or_permit
  - external_owner_handoff
  - outside_horizon
  - lower_priority_tradeoff
  tradeoff_explanation: forced_inclusion_counterfactual_when_claimed
acceptance_scenarios:
- id: emergency_without_capacity
  expect: immediate_escalation_not_queue_or_false_assignment
- id: public_register_only
  expect: capacity_unconfirmed_no_operational_schedule
- id: shared_vehicle_or_person
  expect: overlapping_assignments_rejected
- id: fund_scope_or_shared_parent_cap
  expect: ineligible_or_double_counted_spend_rejected
- id: late_material_receipt
  expect: consumption_before_receipt_rejected
- id: inspection_finding_unknown
  expect: repair_conditional_backlog
- id: impossible_confirmed_deadline
  expect: strict_infeasible_with_escalation
- id: accepted_booking
  expect: resource_not_reused_without_authorised_safe_change
- id: bundle_covers_two_reports_same_hazard
  expect: one_control_benefit_and_one_physical_job
- id: temporary_control_expires
  expect: no_control_credit_after_expiry_without_renewal
- id: U_precaution_S1
  expect: assessment_not_known_S1_repair_credit
- id: feasible_timeout
  expect: feasible_not_proven_optimal
- id: obligation_after_horizon
  expect: lookahead_review_not_compliance_certification
- id: stale_snapshot_on_acceptance
  expect: reject_and_replan
input_contract_versions:
  severity_assessment: 0.3.0
  available_resources_register: 0.1.0
```

</details>

## Complete synthetic input and expected schedule

<details>
<summary>Synthetic worked instance</summary>

```yaml
version: 0.1.0
mode: synthetic_demo
description: All times quantities costs and outcomes are invented; not Hackney operational capacity.
time:
  horizon_start: '2026-11-02T09:00:00+00:00'
  slot_minutes: 60
  horizon_slots: 4
  overrides_proposed_production_grid_for_toy_only: true
resources:
  crew: {id: demo_civil_crew, capacity: 1, free_window: [0, 4], skills: [civil_repair]}
  vehicle: {id: demo_shared_vehicle, capacity: 1, free_window: [0, 4]}
  material: {id: demo_patch_material, initial_free_stock: 2, unit: units, receipts: []}
  fund: {id: demo_highways_fund, free_balance_pence: 70000, eligible_tasks: [A, B, C, D]}
  emergency_reserve: {already_excluded_from_free_window: true, additional_reserve: 0, basis: synthetic_assumption}
  other_bookings: []
hazards:
  - {id: h_A, severity: S1, control_recipe: [A]}
  - {id: h_B, severity: S2, control_recipe: [B]}
  - {id: h_C, severity: S2, control_recipe: [C]}
  - {id: h_D, severity: S3, control_recipe: [D]}
tasks:
  - id: A
    action: make_safe
    site: shared_local_site
    service_duration_slots: 2
    occupied_duration_slots: 2
    release_slot: 0
    latest_finish_slot: 2
    deadline_confirmed_for_toy: true
    mandatory: true
    cost_pence: 40000
    material_units: 1
    predecessors: []
    resources: [demo_civil_crew, demo_shared_vehicle]
  - id: B
    action: make_safe
    site: shared_local_site
    service_duration_slots: 1
    occupied_duration_slots: 1
    release_slot: 0
    mandatory: false
    cost_pence: 20000
    material_units: 1
    predecessors: [A]
    resources: [demo_civil_crew, demo_shared_vehicle]
  - id: C
    action: make_safe
    site: remote_site
    service_duration_slots: 1
    occupied_duration_slots: 2
    transition_setup_return_slots: 1
    transition_basis: approved_synthetic_route_includes_all_movement_time
    release_slot: 2
    mandatory: false
    cost_pence: 20000
    material_units: 1
    predecessors: []
    resources: [demo_civil_crew, demo_shared_vehicle]
  - id: D
    action: make_safe
    site: shared_local_site
    service_duration_slots: 1
    occupied_duration_slots: 1
    release_slot: 0
    mandatory: false
    cost_pence: 10000
    material_units: 0
    predecessors: []
    resources: [demo_civil_crew, demo_shared_vehicle]
assumptions:
  local_site_travel_and_setup_slots: 0
  local_site_basis: co_located_with_synthetic_start_end_position
  control_effect_at: occupied_interval_end
  control_expiry: beyond_horizon
  all_requirements_known_for_toy: true
  conditional_findings: false
  all_costs_include_relevant_incremental_charges: true
  additional_permanent_repair_tasks: none_in_this_toy
expected:
  assignments:
    - {task_id: A, start_slot: 0, finish_slot: 2}
    - {task_id: B, start_slot: 2, finish_slot: 3}
    - {task_id: D, start_slot: 3, finish_slot: 4}
  unscheduled: [C]
  total_cost_pence: 70000
  material_units_used: 2
  deadline_misses: 0
  objective_projection:
    S1_uncontrolled_end: 0
    S1_uncontrolled_time: 2
    S2_uncontrolled_end: 1
    S2_uncontrolled_time: 7
    S3_uncontrolled_end: 0
    S3_uncontrolled_time: 4
    travel_setup_slots: 0
    incremental_cost_pence: 70000
  verification_method: exhaustive_enumeration_of_toy_placements_only
  proves_real_world_optimisation: false
```

</details>

## Verification result

<details>
<summary>Recorded exhaustive-enumeration check</summary>

```text
SYNTHETIC ALLOCATION EXAMPLE — VERIFIED 1 NOVEMBER 2026
All quantities are invented. This is not a Hackney operational schedule.
Checked 200 candidate placement combinations; 8 satisfy the toy constraints.
Exact toy optimum: A [0,2), B [2,3), D [3,4). C unscheduled.
Spend: 70000 pence. Material use: 2 units. Mandatory deadline misses: 0.
Priority projection: S1(end=0,time=2), S2(end=1,time=7), S3(end=0,time=4).
Forced-C counterfactual: A [0,2), C [2,4); S2 uncontrolled time worsens from 7 to 8 slots.
Confirmed insufficient budget, zero stock and zero shared-resource capacity each make the mandatory toy instance infeasible.
With one material unit, the feasible optimum serves A and D; unmet S2 demand remains visible.
Validated unique YAML keys, ranking-version references, companion paths and preservation of unknown real capacity.
The 14 broader acceptance scenarios are requirements, not executed runtime tests.
No CP-SAT engine or real-data allocator has been implemented or benchmarked.
```

</details>
