import type { ProviderConfig, TextProviderConfig } from './types.js';
export const COMMUNITY_IMAGE_PROVIDER: ProviderConfig = { id:'openai-compatible', name:'OpenAI Compatible', type:'openai-compatible', apiMode:'images', baseUrl:'https://api.openai.com', generationEndpoint:'/v1/images/generations', referenceEndpoint:'/v1/images/edits', model:'gpt-image-1', supportsReferenceImages:true };
export const COMMUNITY_TEXT_PROVIDER: TextProviderConfig = { id:'text-openai-compatible', name:'OpenAI Compatible', type:'openai-compatible', baseUrl:'https://api.openai.com', model:'gpt-4.1-mini' };
