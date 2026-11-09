# 0020: One Electron task host with Worker execution

**Status:** Accepted; implementation in progress.

The Electron management console uses one long-lived `utilityProcess` as its task host. The host owns task admission, scheduling, queries, subscriptions, and Worker lifecycle. Individual task definitions and execution logic run in Node.js Worker threads created by that host. The Electron main process owns the host lifecycle and the restricted IPC boundary; renderer pages read task state from the host instead of maintaining a page-registered task list.

Each business task calls the framework's `registerTask` from its own lightweight registration module. Build-time discovery loads these modules without loading every execution definition. A Worker loads the corresponding definition only when that task runs. This lets task code remain with its business module and removes the central per-task registration list. Cross-workspace participation uses declared package dependencies and exports rather than relative source paths.

The existing local PostgreSQL `task_runs` and `task_stages` tables remain the persistent task record. At most one unfinished run occupies each task type globally, even when scopes differ. A frontend control that offers multiple task types is occupied when any one of those types has an unfinished run; this control-level rule does not create a global mutex across different types.

Window and page reconstruction reconnects to a still-running host. Losing the execution environment is a separate event: a valid durable checkpoint becomes `interrupted` and awaits manual continuation, while a run without a valid recovery path becomes `abandoned`. A deliberate quit with active tasks requires confirmation and stops at a safe boundary before applying the same recovery distinction. A manually paused recoverable run remains paused. The `interrupted` state occupies its task-type slot until continued or otherwise resolved.

**Why:** A utility process per task adds process startup and memory cost. Keeping scheduling in the main process would expose it to business work, while a renderer-owned list loses tasks when pages are recreated and misses tasks started elsewhere. One host with Worker execution preserves process isolation from the UI and provides a single authority for task discovery and control. PostgreSQL keeps task history and recovery data across application restarts.

This refines ADR-0019's isolated Node.js business-process boundary. It supersedes the earlier migration plan's per-task process and quit-as-cancel assumptions only for the task system; the rest of that migration decision remains in force.
