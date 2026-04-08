#!/usr/bin/env node
'use strict';

// ---------------------------------------------------------------------------
// transcript-formatter.js — Markdown formatting for skill-unit transcripts
//
// Converts raw stream-json events into human-readable markdown. Each tool
// type has its own formatter for compact, readable output. Unknown tools
// fall back to a generic JSON dump.
// ---------------------------------------------------------------------------

// -- Tool call formatters ---------------------------------------------------

function formatBash(input) {
  const lines = [];
  if (input.description) {
    lines.push(`**Bash:** *${input.description}*`);
  } else {
    lines.push(`**Bash:**`);
  }
  lines.push('```bash');
  lines.push(input.command || '');
  lines.push('```');
  return lines.join('\n') + '\n\n';
}

function formatAgent(input) {
  const lines = [];
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

function formatRead(input) {
  const parts = [`**Read:** \`${input.file_path}\``];
  if (input.offset || input.limit) {
    const details = [];
    if (input.offset) details.push(`offset: ${input.offset}`);
    if (input.limit) details.push(`limit: ${input.limit}`);
    parts[0] += ` *(${details.join(', ')})*`;
  }
  return parts.join('') + '\n\n';
}

function formatWrite(input) {
  const lines = [`**Write:** \`${input.file_path}\``];
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

function formatEdit(input) {
  const lines = [`**Edit:** \`${input.file_path}\``];
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

function formatGlob(input) {
  const parts = [`**Glob:** \`${input.pattern}\``];
  if (input.path) {
    parts[0] += ` in \`${input.path}\``;
  }
  return parts.join('') + '\n\n';
}

function formatGrep(input) {
  const parts = [`**Grep:** \`${input.pattern}\``];
  const details = [];
  if (input.path) details.push(`path: \`${input.path}\``);
  if (input.glob) details.push(`glob: \`${input.glob}\``);
  if (input.type) details.push(`type: ${input.type}`);
  if (details.length) {
    parts[0] += ` *(${details.join(', ')})*`;
  }
  return parts.join('') + '\n\n';
}

function formatSkill(input) {
  const parts = [`**Skill:** \`${input.skill}\``];
  if (input.args) {
    parts[0] += ` — ${input.args}`;
  }
  return parts.join('') + '\n\n';
}

function formatGeneric(name, input) {
  const lines = [];
  lines.push(`**${name}:**`);
  lines.push('```json');
  lines.push(JSON.stringify(input, null, 2));
  lines.push('```');
  return lines.join('\n') + '\n\n';
}

const TOOL_FORMATTERS = {
  Bash: formatBash,
  Agent: formatAgent,
  Read: formatRead,
  Write: formatWrite,
  Edit: formatEdit,
  Glob: formatGlob,
  Grep: formatGrep,
  Skill: formatSkill,
};

// -- Public API -------------------------------------------------------------

/**
 * Format a tool use block for the markdown transcript.
 * @param {string} name - Tool name (e.g., "Bash", "Read")
 * @param {object} input - Tool input parameters
 * @returns {string} Formatted markdown string
 */
function formatToolCall(name, input) {
  const formatter = TOOL_FORMATTERS[name];
  if (formatter) {
    return formatter(input);
  }
  return formatGeneric(name, input);
}

/**
 * Format a tool result block for the markdown transcript.
 * @param {string} output - Tool output text
 * @param {boolean} isError - Whether the tool call failed
 * @returns {string} Formatted markdown string
 */
function formatToolResult(output, isError) {
  const label = isError ? '**Tool result (ERROR):**' : '**Tool result:**';
  if (!output) {
    return '';
  }
  const lines = [label];
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
 * @param {object} usage - Usage object from the assistant message
 * @returns {string} Formatted markdown blockquote, or empty string
 */
function formatTurnUsage(usage) {
  const parts = [];
  if (usage.input_tokens) parts.push(`in: ${usage.input_tokens}`);
  if (usage.cache_read_input_tokens)
    parts.push(`cache read: ${usage.cache_read_input_tokens}`);
  if (usage.cache_creation_input_tokens)
    parts.push(`cache write: ${usage.cache_creation_input_tokens}`);
  if (usage.output_tokens) parts.push(`out: ${usage.output_tokens}`);
  if (!parts.length) return '';
  return `> *Tokens — ${parts.join(' | ')}*\n\n`;
}

/**
 * Format the session init metadata as a bulleted list.
 * @param {object} event - The system init event
 * @returns {string} Formatted markdown string
 */
function formatSessionInit(event) {
  const lines = [];
  lines.push(`- **Model:** ${event.model || 'unknown'}`);
  lines.push(`- **Skills:** ${(event.skills || []).join(', ') || 'none'}`);
  lines.push(`- **CWD:** ${event.cwd || 'unknown'}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

/**
 * Format the final usage summary (from the result event).
 * @param {object} usage - Aggregate usage object
 * @param {number|null} costUsd - Total cost in USD
 * @returns {string} Formatted markdown string, or empty string
 */
function formatUsageSummary(usage, costUsd) {
  const parts = [];
  if (usage.input_tokens) parts.push(`Input: ${usage.input_tokens}`);
  if (usage.cache_read_input_tokens)
    parts.push(`Cache read: ${usage.cache_read_input_tokens}`);
  if (usage.cache_creation_input_tokens)
    parts.push(`Cache write: ${usage.cache_creation_input_tokens}`);
  if (usage.output_tokens) parts.push(`Output: ${usage.output_tokens}`);
  if (!parts.length && costUsd == null) return '';

  const lines = ['### Usage Summary', ''];
  for (const part of parts) {
    lines.push(`- ${part}`);
  }
  if (costUsd != null) {
    lines.push(`- **Cost: $${costUsd.toFixed(4)}**`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  formatToolCall,
  formatToolResult,
  formatTurnUsage,
  formatSessionInit,
  formatUsageSummary,
};
