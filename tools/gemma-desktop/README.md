# Gemma Desktop — Foundation

This is the first desktop-interface layer for the local Gemma/Ollama system.

## Current implementation

- Local-only Node server bound to `127.0.0.1:3210`
- Chat interface connected to local Ollama
- Uses `gemma3:4b` by default
- Local chat history in `data/chat-history.json`
- Local shared-memory store in `data/shared-memory.json`
- Shared Memory search, creation, deletion and metadata/versioning
- Chat automatically selects a small set of relevant local memory entries as context
- Chat history is restored when the desktop is opened and can be cleared without changing Shared Memory
- Navigation placeholders for Research, Products, Evidence, Shared Memory, Learning, Tasks, Activity and Settings
- Windows buttons for opening configured local folders
- Project links for the Action Buyer UK GitHub repository and Supabase dashboard

## Local data boundary

The `data/` directory is intentionally local and is excluded from Git commits by the repository `.gitignore`. Chat history and Shared Memory therefore stay on the Research PC unless a later, explicit synchronisation feature is designed.

The desktop currently sends only the selected chat prompt, recent chat context and relevant local memory context to the local Ollama service. It does not send Shared Memory to Supabase.

## Shared Memory model

Each memory entry has:

- `id`
- `type`: fact, decision, instruction, project, research, learning, handover or note
- `title`
- `content`
- `project`: normally `shared`, `GearCashOut` or `TradeFlow`
- `tags`
- `pinned`
- `source`
- `created_at`
- `updated_at`

The API supports listing/searching memory and adding, editing or deleting individual entries. Chat retrieval uses lightweight term matching and prioritises pinned/relevant entries; this is deliberately simple until the full local research database and knowledge model are designed.

## Run on the Research PC

1. Open this folder in the existing Action Buyer UK checkout.
2. Run `Start-Gemma-Desktop.cmd`.
3. The interface opens at `http://127.0.0.1:3210/`.

The server is deliberately bound to localhost. It does not expose the chat service to the network.

## Important architecture boundary

This foundation does not replace the existing `tools/gear-ai-local-agent` supervisor/worker and does not yet migrate the existing Supabase research tables. The existing worker remains the research execution system until the local research database and migration plan are designed and tested.

The intended sequence is:

1. Local Shared Memory and chat context — current phase.
2. Local research database and research service.
3. Product Knowledge Base and reusable evidence model.
4. Controlled connection to the existing Research Agent.
5. Explicit, minimal synchronisation with Supabase where business data requires it.

No Supabase schema or data was changed by this desktop phase.
