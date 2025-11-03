// file: src/llm/index.ts
/**
 * Router LLM: wybiera providera na podstawie ENV i wystawia
 * jednolite API: generateMarkdown / generateJson
 */
import { Env } from "../config/env";
import {
  generateMarkdown as generateMarkdownOpenAI,
  generateJson as generateJsonOpenAI,
} from "./openai";
import {
  generateMarkdown as generateMarkdownAnthropic,
  generateJson as generateJsonAnthropic,
} from "./anthropic";

type Provider = "openai" | "anthropic";
const provider: Provider = (Env.llmProvider || "openai") as Provider;

export async function generateMarkdown(prompt: string): Promise<string> {
  return provider === "anthropic"
    ? generateMarkdownAnthropic(prompt)
    : generateMarkdownOpenAI(prompt);
}

export async function generateJson<T = any>(prompt: string): Promise<T> {
  return provider === "anthropic"
    ? generateJsonAnthropic<T>(prompt)
    : generateJsonOpenAI<T>(prompt);
}
