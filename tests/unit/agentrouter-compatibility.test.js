import { describe, expect, it, vi } from "vitest";
import { AGENTROUTER_LANGUAGE_PREAMBLE } from "open-sse/config/agentRouter.js";
import { DefaultExecutor } from "open-sse/executors/default.js";
import {
  agentRouterDefaultHeaders,
  frameAgentRouterRequest,
  isAgentRouterEndpoint,
} from "open-sse/services/agentRouter.js";
import { proxyAwareFetch } from "open-sse/utils/proxyFetch.js";

vi.mock("open-sse/utils/proxyFetch.js", () => ({ proxyAwareFetch: vi.fn() }));

const PROVIDER = "openai-compatible-responses-agentrouter-test";
const BASE_URL = "https://agentrouter.org/v1";
const credentials = {
  apiKey: "test-key",
  providerSpecificData: { baseUrl: BASE_URL, apiType: "responses" },
};

describe("AgentRouter endpoint detection", () => {
  it.each([
    BASE_URL,
    "https://api.agentrouter.org/v1/messages",
  ])("matches the real host: %s", (url) => {
    expect(isAgentRouterEndpoint(url)).toBe(true);
  });

  it.each([
    "https://notagentrouter.example/v1",
    "https://agentrouter.org.attacker.example/v1",
    "not a url",
  ])("rejects malformed and lookalike hosts: %s", (url) => {
    expect(isAgentRouterEndpoint(url)).toBe(false);
  });
});

describe("AgentRouter admission identity", () => {
  it("adds the Codex originator only when the operator did not configure one", () => {
    expect(agentRouterDefaultHeaders(BASE_URL)).toEqual({ originator: "codex_cli_rs" });
    expect(agentRouterDefaultHeaders(BASE_URL, { Originator: "operator-client" })).toEqual({});
  });

  it("is applied by DefaultExecutor only for the AgentRouter URL", () => {
    const executor = new DefaultExecutor(PROVIDER);
    const automatic = executor.buildHeaders(
      credentials,
      false,
      `${BASE_URL}/responses`,
      "gpt-5.6-sol",
      {},
    );
    expect(automatic.originator).toBe("codex_cli_rs");

    const overridden = executor.buildHeaders(
      credentials,
      false,
      `${BASE_URL}/responses`,
      "gpt-5.6-sol",
      {},
      { headers: { Originator: "operator-client" } },
    );
    expect(overridden.originator).toBeUndefined();

    const unrelated = executor.buildHeaders(
      credentials,
      false,
      "https://example.com/v1/responses",
      "gpt-5.6-sol",
      {},
    );
    expect(unrelated.originator).toBeUndefined();
  });
});

describe("AgentRouter language framing", () => {
  it("frames Responses string input without mutating the caller body", () => {
    const source = { model: "gpt-5.6-sol", input: "Tolong jawab dalam Bahasa Indonesia." };
    const framed = frameAgentRouterRequest(BASE_URL, source);

    expect(framed.input[0]).toEqual({
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: AGENTROUTER_LANGUAGE_PREAMBLE },
        { type: "input_text", text: source.input },
      ],
    });
    expect(source.input).toBe("Tolong jawab dalam Bahasa Indonesia.");
  });

  it("frames the first Responses user item and remains idempotent", () => {
    const source = {
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "Jelaskan kode ini." }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "Baik." }] },
      ],
    };
    const once = frameAgentRouterRequest(BASE_URL, source);
    const twice = frameAgentRouterRequest(BASE_URL, once);

    expect(once.input[0].content.map((part) => part.text)).toEqual([
      AGENTROUTER_LANGUAGE_PREAMBLE,
      "Jelaskan kode ini.",
    ]);
    expect(twice).toBe(once);
    expect(source.input[0].content).toHaveLength(1);
  });

  it("frames Chat/Anthropic messages as distinct text blocks", () => {
    const source = { messages: [{ role: "user", content: "Tolong perbaiki bug ini." }] };
    const framed = frameAgentRouterRequest(BASE_URL, source);

    expect(framed.messages[0].content).toEqual([
      { type: "text", text: AGENTROUTER_LANGUAGE_PREAMBLE },
      { type: "text", text: "Tolong perbaiki bug ini." },
    ]);
    expect(source.messages[0].content).toBe("Tolong perbaiki bug ini.");
  });

  it("leaves non-AgentRouter requests unchanged", () => {
    const source = { input: "Tolong jelaskan." };
    expect(frameAgentRouterRequest("https://example.com/v1", source)).toBe(source);
  });

  it("is integrated into the custom Responses executor transform", () => {
    const source = { model: "gpt-5.6-sol", input: "Gunakan Bahasa Indonesia." };
    const transformed = new DefaultExecutor(PROVIDER)
      .transformRequest("gpt-5.6-sol", source, true, credentials);

    expect(transformed.input[0].content[0].text).toBe(AGENTROUTER_LANGUAGE_PREAMBLE);
    expect(transformed.input[0].content[1].text).toBe(source.input);
  });

  it.each([200, 400])("keeps the patch and upstream status %i through DefaultExecutor.execute", async (status) => {
    const source = {
      model: "gpt-5.6-sol",
      max_output_tokens: 64,
      input: [{
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Inspect the attached image." },
          { type: "input_image", image_url: "data:image/png;base64,AA==" },
        ],
      }],
    };
    const before = structuredClone(source);
    const upstream = new Response(JSON.stringify({ status }), { status });
    proxyAwareFetch.mockResolvedValueOnce(upstream);

    const result = await new DefaultExecutor(PROVIDER).execute({
      model: source.model, body: source, stream: false, credentials,
    });
    const [url, options] = proxyAwareFetch.mock.calls.at(-1);
    const outbound = JSON.parse(options.body);

    expect(url).toBe(`${BASE_URL}/responses`);
    expect(options.headers.originator).toBe("codex_cli_rs");
    expect(options.headers.Authorization).toBe(`Bearer ${credentials.apiKey}`);
    expect(outbound.input[0].role).toBe("user");
    expect(outbound.input[0].content).toEqual([
      { type: "input_text", text: AGENTROUTER_LANGUAGE_PREAMBLE },
      ...before.input[0].content,
    ]);
    expect(outbound.max_output_tokens).toBe(64);
    expect(source).toEqual(before);
    expect(result.response).toBe(upstream);
    expect(result.response.status).toBe(status);
  });
});
