import {
  AGENTROUTER_HOSTNAME,
  AGENTROUTER_LANGUAGE_PREAMBLE,
  AGENTROUTER_ORIGINATOR,
} from "../config/agentRouter.js";
import { OPENAI_BLOCK, RESPONSES_ITEM, ROLE } from "../translator/schema/index.js";

/** Match AgentRouter itself or one of its subdomains, never a lookalike host. */
export function isAgentRouterEndpoint(baseUrl) {
  try {
    const { hostname } = new URL(baseUrl);
    return hostname === AGENTROUTER_HOSTNAME || hostname.endsWith(`.${AGENTROUTER_HOSTNAME}`);
  } catch {
    return false;
  }
}

/** Supply AgentRouter's stable Codex admission identity unless the operator set one. */
export function agentRouterDefaultHeaders(baseUrl, configuredHeaders = {}) {
  if (!isAgentRouterEndpoint(baseUrl)) return {};
  const hasOriginator = Object.keys(configuredHeaders || {})
    .some((name) => name.toLowerCase() === "originator");
  return hasOriginator ? {} : { originator: AGENTROUTER_ORIGINATOR };
}

function isPreamblePart(part) {
  return part && typeof part === "object"
    && (part.type === OPENAI_BLOCK.TEXT || part.type === RESPONSES_ITEM.INPUT_TEXT)
    && part.text === AGENTROUTER_LANGUAGE_PREAMBLE;
}

function frameFirstUser(messages, textBlockType) {
  const firstUser = messages.find(
    (message) => message && typeof message === "object" && message.role === ROLE.USER,
  );
  if (!firstUser) return false;

  const preamble = { type: textBlockType, text: AGENTROUTER_LANGUAGE_PREAMBLE };
  if (typeof firstUser.content === "string") {
    firstUser.content = firstUser.content === ""
      ? [preamble]
      : [preamble, { type: textBlockType, text: firstUser.content }];
    return true;
  }
  if (!Array.isArray(firstUser.content)) return false;
  if (isPreamblePart(firstUser.content[0])) return false;
  firstUser.content.unshift(preamble);
  return true;
}

function frameMessages(messages, textBlockType) {
  if (!Array.isArray(messages)) return null;
  const copy = structuredClone(messages);
  return frameFirstUser(copy, textBlockType) ? copy : null;
}

/**
 * Frame an owned copy of the first user turn for AgentRouter's language gate.
 * Supports OpenAI Responses, Chat Completions, and Anthropic message bodies.
 */
export function frameAgentRouterRequest(baseUrl, body) {
  if (!isAgentRouterEndpoint(baseUrl) || !body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const framedMessages = frameMessages(body.messages, OPENAI_BLOCK.TEXT);
  if (framedMessages) return { ...body, messages: framedMessages };

  if (typeof body.input === "string") {
    const content = [
      { type: RESPONSES_ITEM.INPUT_TEXT, text: AGENTROUTER_LANGUAGE_PREAMBLE },
    ];
    if (body.input !== "") {
      content.push({ type: RESPONSES_ITEM.INPUT_TEXT, text: body.input });
    }
    return {
      ...body,
      input: [{ type: RESPONSES_ITEM.MESSAGE, role: ROLE.USER, content }],
    };
  }

  const framedInput = frameMessages(body.input, RESPONSES_ITEM.INPUT_TEXT);
  return framedInput ? { ...body, input: framedInput } : body;
}

/** Resolve the effective custom-node URL used for compatibility transforms. */
export function resolveAgentRouterBaseUrl(credentials, providerConfig = null) {
  return credentials?.runtimeTransport?.baseUrl
    || credentials?.providerSpecificData?.baseUrl
    || providerConfig?.baseUrl
    || "";
}
