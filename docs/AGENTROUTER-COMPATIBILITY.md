# AgentRouter language compatibility

Patch baseline: `decolua/9router` `master` commit `1855aa44473e88feac9d3f131b9c0c5fc9706b68` (v0.5.119 source snapshot).

AgentRouter applies a client-identity and language gate before model inference. A valid request can therefore return HTTP 400 `content-blocked` when its first user turn is not English, even when the same request works in English.

9Router applies a narrow compatibility policy when the upstream hostname is exactly `agentrouter.org` or one of its subdomains:

1. Add `originator: codex_cli_rs` when the operator has not configured an `Originator` header.
2. Add this English block before the original first user turn:

   ```text
   [Instruction: Process the user request below and respond in the appropriate language.]
   ```

3. Preserve the original user text as a separate content block.

The policy supports OpenAI Responses, Chat Completions, and Anthropic message bodies. It is idempotent, so retries do not add the frame twice.

## Security boundaries

- Host matching uses the parsed hostname. Lookalikes such as `agentrouter.org.attacker.example` do not receive compatibility behavior.
- Operator headers take precedence, matched case-insensitively.
- The user text is not translated, encoded, moved to a higher-privilege role, or sent to another translation service.
- 9Router does not hide or convert upstream errors. A genuine AgentRouter content-policy rejection remains visible to the client.

## Configure the provider

Create an **OpenAI Compatible** node with:

| Field | Value |
|---|---|
| Base URL | `https://agentrouter.org/v1` |
| API Type | `Responses API` |
| Prefix | `ar` |

The compatibility identity is automatic for this host. An explicit custom `originator` header is still allowed and overrides the default.

## Run the patched source on Windows

Use Node.js 20.18.1 or newer (the repository pins Node 22.23.4):

```powershell
Copy-Item .env.example .env
npm install
npm run build

$env:PORT = "20128"
$env:HOSTNAME = "127.0.0.1"
$env:NEXT_PUBLIC_BASE_URL = "http://127.0.0.1:20128"
npm run start
```

Stop any globally installed 9Router process first so port `20128` is available. The source build uses the same normal 9Router data location, so existing provider connections remain available.

This workspace also includes a launcher at `..\start-patched-9router.ps1`. After the build completes, it can be started from the workspace root with:

```powershell
.\start-patched-9router.ps1
```

The launcher starts a detached background process and records its PID and logs under `9router\logs\`. To run interactively instead, add `-Foreground`. To stop only the recorded patched process safely:

```powershell
.\stop-patched-9router.ps1
```

## Verify

```powershell
$body = @{
  model = "gpt-5.6-sol"
  input = "Balas tepat dengan: BAHASA_OK"
  max_output_tokens = 64
} | ConvertTo-Json

Invoke-RestMethod "http://127.0.0.1:20128/v1/responses" `
  -Method Post `
  -Headers @{ Authorization = "Bearer sk-KEY-9ROUTER-ANDA"; "Content-Type" = "application/json" } `
  -Body $body
```

The request detail in **Usage** should show the English compatibility block followed by the unchanged Indonesian input.
