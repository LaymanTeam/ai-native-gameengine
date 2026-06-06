/**
 * Generates the JSONIC dialogue/text trees for a game's assets/text/ (per generations/info.md).
 * Gemini structured-output against a Zod tree schema; validated before write.
 *
 * Design note: Gemini structured output requires every object field to be explicitly defined and
 * does NOT support recursive / self-referential schemas (z.lazy). A dialogue tree is therefore
 * modelled as a FLAT node map — a list of nodes, each with a stable `id`, the speaker line, and a
 * list of `choices` that point to other node ids by string reference. This keeps the schema
 * non-recursive (Gemini-safe) while still expressing an arbitrarily deep branching tree. After
 * generation the tree is structurally validated (root exists, all referenced ids resolve, no
 * dangling/duplicate nodes) before it is written to disk.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { createCoderModel } from '../../ai/providers';

export const TEXTTREES_LOG_PREFIX = '[engine/tools/generators/text-trees]';

/** A single choice an actor can pick, jumping to another node by id. */
export const DialogueChoiceSchema = z.object({
  /** Player-facing choice label. */
  label: z.string().min(1).describe('The text shown for this choice.'),
  /** Id of the node this choice leads to; must reference an existing node id. */
  next: z.string().min(1).describe('The id of the dialogue node this choice leads to.'),
});
export type DialogueChoice = z.infer<typeof DialogueChoiceSchema>;

/** A single dialogue node: one line spoken, plus the branching choices out of it. */
export const DialogueNodeSchema = z.object({
  /** Stable unique node id (kebab-case recommended). */
  id: z.string().min(1).describe('Unique id for this dialogue node.'),
  /** Who is speaking (character name or "narrator"). */
  speaker: z.string().min(1).describe('Name of the speaker, or "narrator".'),
  /** The line of dialogue / narration text. */
  text: z.string().min(1).describe('The spoken/narrated line for this node.'),
  /** Branching choices out of this node; empty array = terminal node. */
  choices: z
    .array(DialogueChoiceSchema)
    .describe('Choices out of this node. Empty array means the conversation ends here.'),
});
export type DialogueNode = z.infer<typeof DialogueNodeSchema>;

/** A complete JSONIC dialogue tree: a named conversation with a flat node map. */
export const DialogueTreeSchema = z.object({
  /** Identifier for this conversation (used as the asset key / filename stem). */
  id: z.string().min(1).describe('Identifier for the whole conversation.'),
  /** Short human-readable title. */
  title: z.string().min(1).describe('Human-readable title of the conversation.'),
  /** Id of the entry node; must exist in `nodes`. */
  root: z.string().min(1).describe('The id of the starting node.'),
  /** Flat list of all nodes in the tree. */
  nodes: z.array(DialogueNodeSchema).min(1).describe('All dialogue nodes in this conversation.'),
});
export type DialogueTree = z.infer<typeof DialogueTreeSchema>;

/**
 * Minimal structural contract of the model wrapper this module needs. `createCoderModel()` returns
 * a ChatGoogleGenerativeAI instance which satisfies this; tests inject a lightweight stub.
 * `withStructuredOutput` yields a runnable whose `invoke` returns the parsed tree.
 */
export interface StructuredModel {
  withStructuredOutput(schema: typeof DialogueTreeSchema): {
    invoke(input: string): Promise<unknown>;
  };
}

/** Options for {@link generateDialogueTree}. */
export interface GenerateDialogueTreeOptions {
  /** Natural-language brief describing the conversation to generate. */
  readonly prompt: string;
  /**
   * Model to use. Defaults to the coder model (strong structured reasoning). Pass the triage model
   * for cheap/simple trees, or a stub in tests.
   */
  readonly model?: StructuredModel;
  /** Optional framing prepended to the brief (e.g. style/tone from the GDD). */
  readonly context?: string;
}

const SYSTEM_FRAMING =
  'You are a game narrative designer. Produce a branching dialogue tree as a flat node map. ' +
  'Every node needs a unique id. Every choice.next and the root MUST reference an existing node id. ' +
  'Terminal nodes have an empty choices array. Keep lines concise and in-character.';

/**
 * Structurally validate a dialogue tree beyond Zod's shape checks: root resolves, ids are unique,
 * and every choice target references a real node. Throws on the first violation found.
 */
export function validateDialogueTree(tree: DialogueTree): void {
  // Zod shape first (guards against stubs/models returning malformed objects).
  const parsed = DialogueTreeSchema.parse(tree);

  const ids = new Set<string>();
  for (const node of parsed.nodes) {
    if (ids.has(node.id)) {
      throw new Error(`${TEXTTREES_LOG_PREFIX} validateDialogueTree: duplicate node id "${node.id}"`);
    }
    ids.add(node.id);
  }

  if (!ids.has(parsed.root)) {
    throw new Error(
      `${TEXTTREES_LOG_PREFIX} validateDialogueTree: root "${parsed.root}" does not reference an existing node`,
    );
  }

  for (const node of parsed.nodes) {
    for (const choice of node.choices) {
      if (!ids.has(choice.next)) {
        throw new Error(
          `${TEXTTREES_LOG_PREFIX} validateDialogueTree: node "${node.id}" choice -> "${choice.next}" references a missing node`,
        );
      }
    }
  }

  console.log(
    `${TEXTTREES_LOG_PREFIX} validateDialogueTree ok id=${parsed.id} nodes=${parsed.nodes.length} root=${parsed.root}`,
  );
}

/**
 * Generate a validated dialogue tree from a natural-language brief via Gemini structured output.
 * The model is injectable (defaults to the coder model); the result is Zod-parsed AND
 * structurally validated before it is returned.
 */
export async function generateDialogueTree(opts: GenerateDialogueTreeOptions): Promise<DialogueTree> {
  if (!opts || typeof opts.prompt !== 'string' || opts.prompt.trim().length === 0) {
    throw new Error(`${TEXTTREES_LOG_PREFIX} generateDialogueTree: prompt must be a non-empty string`);
  }
  const model: StructuredModel = opts.model ?? (createCoderModel() as unknown as StructuredModel);
  const framing =
    opts.context && opts.context.trim().length > 0 ? `${SYSTEM_FRAMING}\n\n${opts.context}` : SYSTEM_FRAMING;
  const input = `${framing}\n\nConversation brief:\n${opts.prompt}`;

  const started = Date.now();
  console.log(`${TEXTTREES_LOG_PREFIX} generateDialogueTree start promptChars=${opts.prompt.length}`);
  try {
    const structured = model.withStructuredOutput(DialogueTreeSchema);
    const raw = await structured.invoke(input);
    const tree = DialogueTreeSchema.parse(raw); // throws on shape mismatch
    validateDialogueTree(tree); // throws on reference integrity issues
    console.log(
      `${TEXTTREES_LOG_PREFIX} generateDialogueTree done durationMs=${Date.now() - started} nodes=${tree.nodes.length}`,
    );
    return tree;
  } catch (err) {
    console.error(
      `${TEXTTREES_LOG_PREFIX} generateDialogueTree failed durationMs=${Date.now() - started} error=${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

/** Result of writing a dialogue tree to disk. */
export interface WrittenDialogueTree {
  readonly filePath: string;
  readonly id: string;
  readonly nodeCount: number;
  readonly bytes: number;
}

/**
 * Validate (defensively) and write a dialogue tree as pretty-printed JSON to `filePath`
 * (parent dirs created). Intended target: a game's assets/text/ directory.
 */
export async function writeDialogueTree(tree: DialogueTree, filePath: string): Promise<WrittenDialogueTree> {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new Error(`${TEXTTREES_LOG_PREFIX} writeDialogueTree: filePath must be a non-empty string`);
  }
  try {
    validateDialogueTree(tree); // never write an invalid tree
    const json = `${JSON.stringify(tree, null, 2)}\n`;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, json, 'utf8');
    const result: WrittenDialogueTree = {
      filePath,
      id: tree.id,
      nodeCount: tree.nodes.length,
      bytes: Buffer.byteLength(json, 'utf8'),
    };
    console.log(
      `${TEXTTREES_LOG_PREFIX} writeDialogueTree wrote path=${filePath} id=${result.id} nodes=${result.nodeCount} bytes=${result.bytes}`,
    );
    return result;
  } catch (err) {
    console.error(
      `${TEXTTREES_LOG_PREFIX} writeDialogueTree failed path=${filePath} error=${err instanceof Error ? err.message : String(err)}`,
    );
    throw err;
  }
}

/**
 * One-shot convenience: generate a dialogue tree from a brief and write it to `filePath`.
 */
export async function generateAndWriteDialogueTree(
  opts: GenerateDialogueTreeOptions & { filePath: string },
): Promise<WrittenDialogueTree> {
  const tree = await generateDialogueTree(opts);
  return writeDialogueTree(tree, opts.filePath);
}
