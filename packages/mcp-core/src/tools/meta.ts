import { z } from 'zod';
import { searchTools } from '../discovery.js';
import {
  deriveSigningSecret,
  loadSignedState,
  resolveStateDirectory,
  saveSignedState,
} from '../state.js';
import { defineTool, dualResult, extractStructuredData, type FluxerTool } from './_lib/types.js';

function resolvePath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function interpolateValue(
  value: unknown,
  stepOutputs: Record<string, Record<string, unknown>>,
): unknown {
  if (typeof value === 'string') {
    const exactMatch = value.match(/^\$\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+)\}$/);
    if (exactMatch) {
      return resolvePath(stepOutputs[exactMatch[1]!], exactMatch[2]!);
    }
    return value.replace(
      /\$\{([A-Za-z0-9_-]+)\.([A-Za-z0-9_.-]+)\}/g,
      (_all, stepId: string, field: string) => {
        const resolved = resolvePath(stepOutputs[stepId], field);
        return resolved === undefined || resolved === null ? '' : String(resolved);
      },
    );
  }
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, stepOutputs));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateValue(v, stepOutputs);
    }
    return out;
  }
  return value;
}

const WorkflowStepSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/),
  tool: z.string().min(1).max(128),
  arguments: z.record(z.string(), z.unknown()).default({}),
  continue_on_error: z.boolean().optional(),
});

interface StoredWorkflow {
  readonly workflow_id: string;
  readonly name: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled';
  readonly steps: Array<z.infer<typeof WorkflowStepSchema>>;
  readonly completed_index: number;
  readonly outputs: Record<string, Record<string, unknown>>;
  readonly step_results: Array<{
    readonly id: string;
    readonly tool: string;
    readonly status: 'ok' | 'error';
    readonly error?: string;
  }>;
}

export const metaTools: readonly FluxerTool[] = [
  defineTool({
    name: 'fluxer_intent_plan',
    category: 'meta',
    description:
      'Translate a natural-language goal into a recommended sequence of Fluxer MCP tools, required Fluxer permissions, and safety considerations without calling the Fluxer API.',
    inputSchema: {
      goal: z.string().trim().min(3).max(500).describe('What you want to accomplish in Fluxer'),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const tools = ctx.getTools();
      const matches = searchTools(tools, args.goal, { limit: args.limit ?? 10 });
      const toolMap = new Map(tools.map((t) => [t.name, t]));
      const requiredPerms = new Set<string>();
      const steps = matches.map((m) => {
        const def = toolMap.get(m.name);
        for (const p of def?.requiredPermissions ?? []) requiredPerms.add(p);
        return {
          tool: m.name,
          category: m.category,
          risk: m.risk,
          confirm_required: Boolean(def?.confirmRequired),
          required_permissions: def?.requiredPermissions ?? [],
          summary: m.description_summary,
        };
      });
      return dualResult({
        text: `Planned ${steps.length} candidate Fluxer MCP tool(s) for goal "${args.goal}". Required Fluxer permissions: ${[...requiredPerms].join(', ') || 'none'}.`,
        data: {
          goal: args.goal,
          required_permissions: [...requiredPerms],
          steps,
        },
      });
    },
  }),

  defineTool({
    name: 'mcp_pipeline',
    category: 'meta',
    description:
      // biome-ignore lint/suspicious/noTemplateCurlyInString: documents pipeline placeholder syntax
      'Execute a sequential multi-step Fluxer MCP tool pipeline (up to 20 steps) with `${stepId.field}` output interpolation. Every step passes through the full Fluxer MCP safety, allowlist, and confirmation middleware.',
    inputSchema: {
      steps: z.array(WorkflowStepSchema).min(1).max(20),
      stop_on_error: z
        .boolean()
        .optional()
        .describe('Abort remaining steps on first failure (default true)'),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const outputs: Record<string, Record<string, unknown>> = {};
      const results: Array<{
        id: string;
        tool: string;
        status: 'ok' | 'error';
        data: Record<string, unknown>;
      }> = [];
      let failed = false;

      for (const step of args.steps) {
        if (step.tool === 'mcp_pipeline' || step.tool.startsWith('workflow_')) {
          throw new Error(
            `Recursive orchestration tool "${step.tool}" is not allowed inside mcp_pipeline.`,
          );
        }
        const resolvedArgs = interpolateValue(step.arguments, outputs) as Record<string, unknown>;
        const res = await ctx.invokeTool(step.tool, resolvedArgs);
        const data = extractStructuredData(res);
        outputs[step.id] = data;
        const ok = res.isError !== true;
        results.push({ id: step.id, tool: step.tool, status: ok ? 'ok' : 'error', data });
        if (!ok) {
          failed = true;
          if (args.stop_on_error !== false && !step.continue_on_error) break;
        }
      }

      return dualResult({
        text: `Pipeline finished ${results.length}/${args.steps.length} step(s) (${failed ? 'with errors' : 'all succeeded'}).`,
        data: { status: failed ? 'partial_or_failed' : 'completed', steps: results },
      });
    },
  }),

  defineTool({
    name: 'workflow_start',
    category: 'meta',
    description:
      'Start a durable, locally checkpointed multi-step Fluxer workflow (`workflow_id`). Progress is persisted after every step so interrupted or failed runs can be inspected (`workflow_status`), resumed (`workflow_resume`), or cancelled (`workflow_cancel`).',
    inputSchema: {
      name: z.string().trim().min(1).max(100),
      steps: z.array(WorkflowStepSchema).min(1).max(30),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);
      const workflowId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      let wf: StoredWorkflow = {
        workflow_id: workflowId,
        name: args.name,
        status: 'running',
        steps: args.steps,
        completed_index: -1,
        outputs: {},
        step_results: [],
      };
      saveSignedState({ stateDir, namespace: 'workflows', id: workflowId, secret, payload: wf });

      for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i]!;
        const resolvedArgs = interpolateValue(step.arguments, wf.outputs) as Record<
          string,
          unknown
        >;
        const res = await ctx.invokeTool(step.tool, resolvedArgs);
        const data = extractStructuredData(res);
        const ok = res.isError !== true;
        wf = {
          ...wf,
          completed_index: ok ? i : wf.completed_index,
          status: ok ? (i === wf.steps.length - 1 ? 'completed' : 'running') : 'failed',
          outputs: { ...wf.outputs, [step.id]: data },
          step_results: [
            ...wf.step_results,
            {
              id: step.id,
              tool: step.tool,
              status: ok ? 'ok' : 'error',
              ...(ok ? {} : { error: String(data.code ?? 'TOOL_ERROR') }),
            },
          ],
        };
        saveSignedState({ stateDir, namespace: 'workflows', id: workflowId, secret, payload: wf });
        if (!ok && !step.continue_on_error) break;
      }

      return dualResult({
        text: `Workflow \`${workflowId}\` (**${args.name}**): **${wf.status}** (${wf.completed_index + 1}/${wf.steps.length} steps completed).`,
        data: wf as unknown as Record<string, unknown>,
      });
    },
  }),

  defineTool({
    name: 'workflow_status',
    category: 'meta',
    description: 'Inspect the checkpointed status and step results of a durable Fluxer workflow.',
    inputSchema: { workflow_id: z.string().min(3).max(128) },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const rec = loadSignedState<StoredWorkflow>({
        stateDir: resolveStateDirectory(ctx.config),
        namespace: 'workflows',
        id: args.workflow_id,
        secret: deriveSigningSecret(ctx.config),
      });
      if (!rec) throw new Error(`Workflow "${args.workflow_id}" not found.`);
      return dualResult({
        text: `Workflow \`${rec.payload.workflow_id}\` is **${rec.payload.status}** (${rec.payload.completed_index + 1}/${rec.payload.steps.length} steps).`,
        data: rec.payload as unknown as Record<string, unknown>,
      });
    },
  }),

  defineTool({
    name: 'workflow_resume',
    category: 'meta',
    description: 'Resume a failed or paused durable Fluxer workflow from its next incomplete step.',
    inputSchema: { workflow_id: z.string().min(3).max(128) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    handler: async (args, ctx) => {
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);
      const rec = loadSignedState<StoredWorkflow>({
        stateDir,
        namespace: 'workflows',
        id: args.workflow_id,
        secret,
      });
      if (!rec) throw new Error(`Workflow "${args.workflow_id}" not found.`);
      let wf = rec.payload;
      if (wf.status === 'cancelled') throw new Error('Cannot resume a cancelled workflow.');
      if (wf.status === 'completed') {
        return dualResult({
          text: `Workflow \`${wf.workflow_id}\` is already completed.`,
          data: wf as unknown as Record<string, unknown>,
        });
      }

      for (let i = wf.completed_index + 1; i < wf.steps.length; i++) {
        const step = wf.steps[i]!;
        const resolvedArgs = interpolateValue(step.arguments, wf.outputs) as Record<
          string,
          unknown
        >;
        const res = await ctx.invokeTool(step.tool, resolvedArgs);
        const data = extractStructuredData(res);
        const ok = res.isError !== true;
        wf = {
          ...wf,
          completed_index: ok ? i : wf.completed_index,
          status: ok ? (i === wf.steps.length - 1 ? 'completed' : 'running') : 'failed',
          outputs: { ...wf.outputs, [step.id]: data },
          step_results: [
            ...wf.step_results,
            {
              id: step.id,
              tool: step.tool,
              status: ok ? 'ok' : 'error',
              ...(ok ? {} : { error: String(data.code ?? 'TOOL_ERROR') }),
            },
          ],
        };
        saveSignedState({
          stateDir,
          namespace: 'workflows',
          id: wf.workflow_id,
          secret,
          payload: wf,
        });
        if (!ok && !step.continue_on_error) break;
      }

      return dualResult({
        text: `Resumed workflow \`${wf.workflow_id}\`: **${wf.status}** (${wf.completed_index + 1}/${wf.steps.length} steps).`,
        data: wf as unknown as Record<string, unknown>,
      });
    },
  }),

  defineTool({
    name: 'workflow_cancel',
    category: 'meta',
    description: 'Mark a durable Fluxer workflow as cancelled so it cannot be resumed.',
    inputSchema: { workflow_id: z.string().min(3).max(128) },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    handler: async (args, ctx) => {
      const stateDir = resolveStateDirectory(ctx.config);
      const secret = deriveSigningSecret(ctx.config);
      const rec = loadSignedState<StoredWorkflow>({
        stateDir,
        namespace: 'workflows',
        id: args.workflow_id,
        secret,
      });
      if (!rec) throw new Error(`Workflow "${args.workflow_id}" not found.`);
      const cancelled: StoredWorkflow = { ...rec.payload, status: 'cancelled' };
      saveSignedState({
        stateDir,
        namespace: 'workflows',
        id: cancelled.workflow_id,
        secret,
        payload: cancelled,
      });
      return dualResult({
        text: `Cancelled workflow \`${cancelled.workflow_id}\`.`,
        data: cancelled as unknown as Record<string, unknown>,
      });
    },
  }),
];
