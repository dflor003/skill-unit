// ---------------------------------------------------------------------------
// transcript-formatter.ts -- Markdown formatting for skill-unit transcripts
//
// Converts raw stream-json events into human-readable markdown. Each tool
// type has its own formatter for compact, readable output. Unknown tools
// fall back to a generic JSON dump.
// ---------------------------------------------------------------------------

// -- Input shape types -------------------------------------------------------

interface BashInput {
  command?: string;
  description?: string;
}

interface AgentInput {
  subagent_type?: string;
  description?: string;
  prompt?: string;
}

interface ReadInput {
  file_path?: string;
  offset?: number;
  limit?: number;
}

interface WriteInput {
  file_path?: string;
  content?: string;
}

interface EditInput {
  file_path?: string;
  old_string?: string;
  new_string?: string;
}

interface GlobInput {
  pattern?: string;
  path?: string;
}

interface GrepInput {
  pattern?: string;
  path?: string;
  glob?: string;
  type?: string;
}

interface SkillInput {
  skill?: string;
  args?: string;
}

type ToolInput = Record<string, unknown>;

interface UsageData {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface SessionInitEvent {
  model?: string;
  cwd?: string;
  skills?: string[];
}

// -- Tool call formatters ----------------------------------------------------

function formatBash(input: BashInput): string {
  const lines: string[] = [];
  if (input.description) {
    lines.push(`**Bash:** *${input.description}*`);
  } else {
    lines.push(`**Bash:**`);
  }
  lines.push('```bash');
  lines.push(input.command ?? '');
  lines.push('```');
  return lines.join('\n') + '\n\n';
}

function formatAgent(input: AgentInput): string {
  const lines: string[] = [];
  lines.push(`**Agent:**`);
  if (input.subagent_type) {
    lines.push(`- **Subagent:** \`${input.subagent_type}\``);
  }
  if (input.description) {
    lines.push(`- **Description:** ${input.description}`);
  }
  if (input.prompt) {
    lines.push(`- **Prompt:**`);
    for (const pline of input.prompt.split('\n')) {
      lines.push(`  > ${pline}`);
    }
  }
  return lines.join('\n') + '\n\n';
}

function formatRead(input: ReadInput): string {
  let line = `**Read:** \`${input.file_path ?? ''}\``;
  if (input.offset || input.limit) {
    const details: string[] = [];
    if (input.offset) details.push(`offset: ${input.offset}`);
    if (input.limit) details.push(`limit: ${input.limit}`);
    line += ` *(${details.join(', ')})*`;
  }
  return line + '\n\n';
}

function formatWrite(input: WriteInput): string {
  const lines: string[] = [`**Write:** \`${input.file_path ?? ''}\``];
  if (input.content != null) {
    const preview =
      input.content.length > 300
        ? input.content.substring(0, 300) +
          `\n... (${input.content.length} chars total)`
        : input.content;
    lines.push('```');
    lines.push(preview);
    lines.push('```');
  }
  return lines.join('\n') + '\n\n';
}

function formatEdit(input: EditInput): string {
  const lines: string[] = [`**Edit:** \`${input.file_path ?? ''}\``];
  if (input.old_string != null && input.new_string != null) {
    const oldPreview =
      input.old_string.length > 150
        ? input.old_string.substring(0, 150) + '...'
        : input.old_string;
    const newPreview =
      input.new_string.length > 150
        ? input.new_string.substring(0, 150) + '...'
        : input.new_string;
    lines.push('```diff');
    for (const l of oldPreview.split('\n')) {
      lines.push(`- ${l}`);
    }
    for (const l of newPreview.split('\n')) {
      lines.push(`+ ${l}`);
    }
    lines.push('```');
  }
  return lines.join('\n') + '\n\n';
}

function formatGlob(input: GlobInput): string {
  let line = `**Glob:** \`${input.pattern ?? ''}\``;
  if (input.path) {
    line += ` in \`${input.path}\``;
  }
  return line + '\n\n';
}

function formatGrep(input: GrepInput): string {
  let line = `**Grep:** \`${input.pattern ?? ''}\``;
  const details: string[] = [];
  if (input.path) details.push(`path: \`${input.path}\``);
  if (input.glob) details.push(`glob: \`${input.glob}\``);
  if (input.type) details.push(`type: ${input.type}`);
  if (details.length) {
    line += ` *(${details.join(', ')})*`;
  }
  return line + '\n\n';
}

function formatSkill(input: SkillInput): string {
  let line = `**Skill:** \`${input.skill ?? ''}\``;
  if (input.args) {
    line += ` -- ${input.args}`;
  }
  return line + '\n\n';
}

function formatGeneric(name: string, input: ToolInput): string {
  const lines: string[] = [];
  lines.push(`**${name}:**`);
  lines.push('```json');
  lines.push(JSON.stringify(input, null, 2));
  lines.push('```');
  return lines.join('\n') + '\n\n';
}

const TOOL_FORMATTERS: Record<string, (input: ToolInput) => string> = {
  Bash: (i) => formatBash(i as BashInput),
  Agent: (i) => formatAgent(i as AgentInput),
  Read: (i) => formatRead(i as ReadInput),
  Write: (i) => formatWrite(i as WriteInput),
  Edit: (i) => formatEdit(i as EditInput),
  Glob: (i) => formatGlob(i as GlobInput),
  Grep: (i) => formatGrep(i as GrepInput),
  Skill: (i) => formatSkill(i as SkillInput),
};

// -- Public API --------------------------------------------------------------

/**
 * Format a tool use block for the markdown transcript.
 * @param name - Tool name (e.g., "Bash", "Read")
 * @param input - Tool input parameters
 * @returns Formatted markdown string
 */
export function formatToolCall(name: string, input: ToolInput): string {
  const formatter = TOOL_FORMATTERS[name];
  if (formatter) {
    return formatter(input);
  }
  return formatGeneric(name, input);
}

/**
 * Format a tool result block for the markdown transcript.
 * @param output - Tool output text
 * @param isError - Whether the tool call failed
 * @returns Formatted markdown string
 */
export function formatToolResult(output: string, isError: boolean): string {
  const label = isError ? '**Tool result (ERROR):**' : '**Tool result:**';
  if (!output) {
    return '';
  }
  const lines: string[] = [label];
  if (output.length > 500) {
    lines.push('```');
    lines.push(output.substring(0, 500));
    lines.push(`... (${output.length} chars total)`);
    lines.push('```');
  } else {
    lines.push('```');
    lines.push(output);
    lines.push('```');
  }
  return lines.join('\n') + '\n\n';
}

/**
 * Format the token usage line for a single turn.
 * @param usage - Usage object from the assistant message
 * @returns Formatted markdown blockquote, or empty string
 */
export function formatTurnUsage(usage: UsageData | null | undefined): string {
  if (!usage) return '';
  const parts: string[] = [];
  if (usage.input_tokens) parts.push(`in: ${usage.input_tokens}`);
  if (usage.cache_read_input_tokens)
    parts.push(`cache read: ${usage.cache_read_input_tokens}`);
  if (usage.cache_creation_input_tokens)
    parts.push(`cache write: ${usage.cache_creation_input_tokens}`);
  if (usage.output_tokens) parts.push(`out: ${usage.output_tokens}`);
  if (!parts.length) return '';
  return `> *Tokens -- ${parts.join(' | ')}*\n\n`;
}

/**
 * Format the session init metadata as a bulleted list.
 * @param event - The system init event
 * @returns Formatted markdown string
 */
export function formatSessionInit(event: SessionInitEvent): string {
  const lines: string[] = [];
  lines.push(`- **Model:** ${event.model ?? 'unknown'}`);
  lines.push(`- **Skills:** ${(event.skills ?? []).join(', ') || 'none'}`);
  lines.push(`- **CWD:** ${event.cwd ?? 'unknown'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

/**
 * Format the final usage summary (from the result event).
 * @param usage - Aggregate usage object
 * @param costUsd - Total cost in USD
 * @returns Formatted markdown string, or empty string
 */
export function formatUsageSummary(
  usage: UsageData | null | undefined,
  costUsd: number | null | undefined
): string {
  if (!usage && costUsd == null) return '';
  const parts: string[] = [];
  if (usage) {
    if (usage.input_tokens) parts.push(`Input: ${usage.input_tokens}`);
    if (usage.cache_read_input_tokens)
      parts.push(`Cache read: ${usage.cache_read_input_tokens}`);
    if (usage.cache_creation_input_tokens)
      parts.push(`Cache write: ${usage.cache_creation_input_tokens}`);
    if (usage.output_tokens) parts.push(`Output: ${usage.output_tokens}`);
  }
  if (!parts.length && costUsd == null) return '';

  const lines: string[] = ['### Usage Summary', ''];
  for (const part of parts) {
    lines.push(`- ${part}`);
  }
  if (costUsd != null) {
    lines.push(`- **Cost: $${costUsd.toFixed(4)}**`);
  }
  lines.push('');
  return lines.join('\n');
}
