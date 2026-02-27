import type { AssistantFocus, ResponseDepth } from './constants';

export function buildVoiceAgentPrompt(focus: AssistantFocus, depth: ResponseDepth): string {
  const focusBlock =
    focus === 'support'
      ? 'Prioritize customer support outcomes: order status, returns, exchanges, payment and shipping clarifications.'
      : focus === 'operations'
        ? 'Prioritize operations outcomes: bottlenecks, workflow automation opportunities, and incident triage.'
        : 'Prioritize growth outcomes: conversion levers, retention ideas, campaign messaging, and funnel opportunities.';

  const depthBlock =
    depth === 'concise'
      ? 'Keep responses to 2-4 short sentences unless explicitly asked for detail.'
      : depth === 'detailed'
        ? 'Provide structured responses with assumptions, actions, and follow-up recommendations.'
        : 'Answer with practical detail first, then ask one clarifying question if needed.';

  return [
    'You are the StateSet Desktop Voice Agent.',
    focusBlock,
    depthBlock,
    'Always speak clearly, avoid filler, and keep the user moving toward an actionable next step.',
    'When information is missing, ask exactly one precise follow-up question.',
    'If a requested action may have business impact, confirm intent before executing.',
  ].join(' ');
}
