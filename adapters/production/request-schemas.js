import { invalid } from './common.js';

function parameters(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((field) => !fields.includes(field))) invalid('unsupported provider parameter');
}
const falFields = ['prompt', 'image_size', 'num_inference_steps', 'seed', 'guidance_scale', 'sync_mode', 'num_images', 'enable_safety_checker', 'output_format', 'acceleration'];
export function validateFalParameters(input) {
  parameters(input, falFields);
  if (typeof input.prompt !== 'string' || !input.prompt.trim()) invalid('prompt required');
  if (!Number.isInteger(input.num_images ?? 1) || (input.num_images ?? 1) < 1 || (input.num_images ?? 1) > 4) invalid('first image adapter supports one to four candidates');
  if (input.sync_mode === true) invalid('queue image adapter requires retained async results');
  if (input.output_format !== undefined && !['jpeg', 'png'].includes(input.output_format)) invalid('unsupported image output format');
  if (input.acceleration !== undefined && !['none', 'regular', 'high'].includes(input.acceleration)) invalid('unsupported acceleration');
  if (input.seed !== undefined && !Number.isSafeInteger(input.seed)) invalid('integer seed required');
  if (input.num_inference_steps !== undefined && (!Number.isSafeInteger(input.num_inference_steps) || input.num_inference_steps < 1)) invalid('positive inference step count required');
  if (input.guidance_scale !== undefined && (!Number.isFinite(input.guidance_scale) || input.guidance_scale < 0)) invalid('finite guidance scale required');
  for (const field of ['sync_mode', 'enable_safety_checker']) if (input[field] !== undefined && typeof input[field] !== 'boolean') invalid('boolean provider flag required');
  if (input.image_size !== undefined) {
    const size = input.image_size;
    if (typeof size === 'string') {
      if (!['square_hd', 'square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'].includes(size)) invalid('unsupported image size');
    } else if (!size || Object.keys(size).some((key) => !['width', 'height'].includes(key)) || !['width', 'height'].every((key) => Number.isSafeInteger(size[key]) && size[key] > 0)) invalid('positive width and height required');
  }
}

const speechFields = ['text', 'model_id', 'language_code', 'voice_settings', 'pronunciation_dictionary_locators', 'seed', 'previous_text', 'next_text', 'previous_request_ids', 'next_request_ids', 'use_pvc_as_ivc', 'apply_text_normalization', 'apply_language_text_normalization', 'output_format', 'enable_logging', 'optimize_streaming_latency'];
export function validateSpeechParameters(input) {
  parameters(input, speechFields);
  if (typeof input.text !== 'string' || !input.text.length) invalid('speech text required');
  for (const field of ['previous_text', 'next_text', 'model_id', 'language_code', 'output_format']) if (input[field] != null && typeof input[field] !== 'string') invalid('string speech parameter required');
  if (input.voice_settings != null) {
    parameters(input.voice_settings, ['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed']);
    for (const [key, value] of Object.entries(input.voice_settings)) if (key === 'use_speaker_boost' ? typeof value !== 'boolean' : !Number.isFinite(value)) invalid('typed voice setting required');
  }
  if (input.seed != null && (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 4294967295)) invalid('speech seed outside supported range');
  for (const field of ['previous_request_ids', 'next_request_ids']) if (input[field] != null && (!Array.isArray(input[field]) || input[field].length > 3 || input[field].some((value) => typeof value !== 'string'))) invalid('up to three request identifiers supported');
  if (input.apply_text_normalization !== undefined && !['auto', 'on', 'off'].includes(input.apply_text_normalization)) invalid('unsupported text normalization');
}

/** Shared preview subset; preserves the existing adapter contract, including its historical model strings. */
export function validateMeshyParameters(parameters) {
  if (!parameters || parameters.mode !== 'preview' || typeof parameters.prompt !== 'string' || !parameters.prompt.trim() || parameters.prompt.length > 800
    || Object.keys(parameters).some((key) => !['mode', 'prompt', 'target_formats', 'should_remesh', 'ai_model'].includes(key))) invalid('supported Meshy preview request required');
  if (!Array.isArray(parameters.target_formats) || !parameters.target_formats.length || new Set(parameters.target_formats).size !== parameters.target_formats.length
    || parameters.target_formats.some((format) => !['glb', 'obj', 'fbx', 'usdz', 'stl', '3mf'].includes(format))) invalid('explicit supported target_formats required');
  if (parameters.should_remesh !== undefined && typeof parameters.should_remesh !== 'boolean') invalid('should_remesh must be boolean');
  if (parameters.ai_model !== undefined && (typeof parameters.ai_model !== 'string' || !parameters.ai_model)) invalid('ai_model must be a string');
}
