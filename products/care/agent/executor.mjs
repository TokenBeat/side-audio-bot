import { randomUUID } from 'node:crypto'
import {
  Role,
  TaskState,
} from '@a2a-js/sdk'
import { AgentEvent } from '@a2a-js/sdk/server'
import { DashScopeCareModel } from './model.mjs'

const MAX_AGENT_ROUNDS = 8

// 晚晴·照护后台 Agent：只做照护业务编排（呼叫工单、用药确认、活动报名、查状态）。
// 闲聊与低延迟控制在实时前台完成，不会路由到这里。
export const CARE_AGENT_PROMPT = `你是养老院「晚晴·照护」的后台 Agent，负责理解并执行照护任务。

规则：
- 你只会收到照护类后台任务：老人呼叫求助、用药确认、活动报名、状态查询。
- 必须使用提供的工具真实执行，不得假装已经执行。
- 老人表达求助（要喝水、想上厕所、疼痛、跌倒、胸闷、头晕、不舒服等）时，调用 call_manage 且 action=create；跌倒、疼得厉害、胸闷、呼救属于紧急情况，urgency=urgent；要喝水、换电视频道、想吃东西等属于普通求助，urgency=normal。
- 老人说"吃了""吃好了"等服药确认时，调用 medication_confirm，medicationName 填老人提到的药名，没提就填"药"。
- 老人明确说报名某活动时调用 activity_signup；只是询问有什么活动时用 activity_query 或前台已答，不要报名。
- 呼叫创建成功后，工具会返回负责护理员的名字；把"已经通知了谁、多久到"转达给老人，语气温和。
- 单次任务可以连续调用多个工具；严格按照用户表达的先后顺序执行。
- 存在关键歧义（比如老人说"疼"但没说哪里）时，先用一句简短中文追问，不要笼统声称系统不支持。
- 不处理普通闲聊、家属私人事务或未提供工具的业务；只简洁说明照护助手的职责边界。
- 最终回复应简短、自然、口语化，适合由前台语音助手直接向老人播报，避免出现"工单""系统"这类术语。`

function textPart(text) {
  return {
    content: { $case: 'text', value: String(text || '') },
    metadata: undefined,
    filename: '',
    mediaType: 'text/plain',
  }
}

function agentMessage(text, { taskId, contextId } = {}) {
  return {
    messageId: randomUUID(),
    contextId: contextId || '',
    taskId: taskId || '',
    role: Role.ROLE_AGENT,
    parts: [textPart(text)],
    metadata: undefined,
    extensions: [],
    referenceTaskIds: [],
  }
}

function inputText(message) {
  return (message?.parts || [])
    .filter(part => part?.content?.$case === 'text')
    .map(part => part.content.value)
    .join('\n')
    .trim()
}

function statusUpdate(taskId, contextId, state, message) {
  return AgentEvent.statusUpdate({
    taskId,
    contextId,
    status: {
      state,
      timestamp: new Date().toISOString(),
      message: message ? agentMessage(message, { taskId, contextId }) : undefined,
    },
    metadata: undefined,
  })
}

function openAiTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || tool.title || tool.name,
      parameters: tool.inputSchema || { type: 'object', properties: {} },
    },
  }
}

function toolArguments(call) {
  try {
    return JSON.parse(call?.function?.arguments || '{}')
  } catch {
    throw new Error(`Invalid arguments for care tool ${call?.function?.name || ''}`)
  }
}

async function runCareAgent({ objective, model, tools, signal, onToolCall }) {
  const definitions = (await tools.list({ signal })).map(openAiTool)
  const allowed = new Set(definitions.map(tool => tool.function.name))
  const messages = [
    { role: 'system', content: CARE_AGENT_PROMPT },
    { role: 'user', content: objective },
  ]
  let lastContent = ''
  let lastData = {}

  for (let round = 0; round < MAX_AGENT_ROUNDS; round += 1) {
    if (signal.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError')
    const message = await model.complete({ messages, tools: definitions, signal })
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : []
    if (!calls.length) {
      return {
        content: String(message.content || lastContent || '照护任务已处理').trim(),
        data: lastData,
      }
    }
    messages.push({
      role: 'assistant',
      content: message.content || null,
      tool_calls: calls,
    })
    for (const call of calls) {
      const name = String(call?.function?.name || '')
      if (!allowed.has(name)) throw new Error(`Care Agent selected unknown tool: ${name}`)
      const args = toolArguments(call)
      onToolCall?.({ name, args })
      const result = await tools.call(name, args, { signal })
      lastContent = result.content
      lastData = result.data || lastData
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result.content,
      })
    }
  }
  throw new Error(`Care Agent exceeded ${MAX_AGENT_ROUNDS} model rounds`)
}

export class CareAgentExecutor {
  constructor({ tools, model = new DashScopeCareModel() }) {
    if (!tools?.list || !tools?.call) {
      throw new TypeError('Care Agent requires an MCP tool client')
    }
    if (!model?.complete) throw new TypeError('Care Agent requires a chat model')
    this.tools = tools
    this.model = model
    this.controllers = new Map()
  }

  async execute(requestContext, eventBus) {
    const { taskId, contextId } = requestContext
    const task = requestContext.task || {
      id: taskId,
      contextId,
      status: {
        state: TaskState.TASK_STATE_SUBMITTED,
        timestamp: new Date().toISOString(),
        message: undefined,
      },
      artifacts: [],
      history: [requestContext.userMessage],
      metadata: requestContext.userMessage.metadata,
    }
    eventBus.publish(AgentEvent.task(task))
    eventBus.publish(statusUpdate(
      taskId,
      contextId,
      TaskState.TASK_STATE_WORKING,
      '照护 Agent 正在处理',
    ))

    const controller = new AbortController()
    this.controllers.set(taskId, controller)
    try {
      const result = await runCareAgent({
        objective: inputText(requestContext.userMessage),
        model: this.model,
        tools: this.tools,
        signal: controller.signal,
        onToolCall: ({ name }) => eventBus.publish(statusUpdate(
          taskId,
          contextId,
          TaskState.TASK_STATE_WORKING,
          `正在执行照护能力：${name}`,
        )),
      })
      eventBus.publish(AgentEvent.artifactUpdate({
        taskId,
        contextId,
        artifact: {
          artifactId: randomUUID(),
          name: 'Care result',
          description: 'Result from the care Agent.',
          parts: [textPart(result.content)],
          metadata: result.data,
          extensions: [],
        },
        append: false,
        lastChunk: true,
        metadata: undefined,
      }))
      eventBus.publish(statusUpdate(
        taskId,
        contextId,
        TaskState.TASK_STATE_COMPLETED,
        result.content,
      ))
    } catch (error) {
      const cancelled = controller.signal.aborted || error?.name === 'AbortError'
      eventBus.publish(statusUpdate(
        taskId,
        contextId,
        cancelled
          ? TaskState.TASK_STATE_CANCELED
          : TaskState.TASK_STATE_FAILED,
        cancelled ? '照护任务已取消' : `照护任务失败：${error?.message || error}`,
      ))
    } finally {
      this.controllers.delete(taskId)
    }
  }

  async cancelTask(taskId) {
    this.controllers.get(taskId)?.abort()
  }
}
