# Gemma Desktop — Foundation

This is the first desktop-interface layer for the local Gemma/Ollama system.

## What is included

- Local-only Node server bound to `127.0.0.1:3210`
- Chat interface connected to local Ollama
- Uses `gemma3:4b` by default
- Local chat history in `data/chat-history.json`
- Local shared-memory store in `data/shared-memory.json`
- Navigation placeholders for Research, Products, Evidence, Shared Memory, Learning, Tasks, Activity and Settings
- Windows buttons for opening the existing Research Agent folder and the local Gemma Desktop folder
- Project links for the Action Buyer UK GitHub repository and Supabase dashboard

## Run on the Research PC

1. Open this folder in the existing Action Buyer UK checkout.
2. Run `Start-Gemma-Desktop.cmd`.
3. The interface opens at `http://127.0.0.1:3210/`.

The server is deliberately bound to localhost. It does not expose the chat service to the network.

## Important

This is a foundation only. It does not yet replace the existing `tools/gear-ai-local-agent` supervisor/worker and does not yet migrate the existing Supabase research tables. The next architecture phase should map the current Gemma worker, local data, memory and Supabase dependencies before those integrations are connected.
