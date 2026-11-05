/**
 * errors.ts unit tests
 * Phase 5-2: Error hierarchy classes
 */

import { describe, expect, it } from 'vitest';
import {
  ContentError,
  PDFSpecError,
  RegistryError,
  ToolPrerequisiteError,
  ValidationError,
} from './errors.js';

// ========================================
// PDFSpecError - Base error class
// ========================================

describe('PDFSpecError', () => {
  it('sets message and code correctly', () => {
    const error = new PDFSpecError('TEST_CODE', 'Test message');
    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_CODE');
  });

  it('sets name to "PDFSpecError"', () => {
    const error = new PDFSpecError('TEST_CODE', 'Test message');
    expect(error.name).toBe('PDFSpecError');
  });

  it('is an instance of Error', () => {
    const error = new PDFSpecError('TEST_CODE', 'Test message');
    expect(error instanceof Error).toBe(true);
  });

  it('is an instance of PDFSpecError', () => {
    const error = new PDFSpecError('TEST_CODE', 'Test message');
    expect(error instanceof PDFSpecError).toBe(true);
  });
});

// ========================================
// ValidationError
// ========================================

describe('ValidationError', () => {
  it('sets code to "INVALID_ARGUMENT"', () => {
    const error = new ValidationError('Invalid input');
    expect(error.code).toBe('INVALID_ARGUMENT');
  });

  it('sets name to "ValidationError"', () => {
    const error = new ValidationError('Invalid input');
    expect(error.name).toBe('ValidationError');
  });

  it('is an instance of PDFSpecError', () => {
    const error = new ValidationError('Invalid input');
    expect(error instanceof PDFSpecError).toBe(true);
  });

  it('is an instance of Error', () => {
    const error = new ValidationError('Invalid input');
    expect(error instanceof Error).toBe(true);
  });
});

// ========================================
// RegistryError
// ========================================

describe('RegistryError', () => {
  it('sets code to "REGISTRY_ERROR"', () => {
    const error = new RegistryError('Spec not found', { retryable: true });
    expect(error.code).toBe('REGISTRY_ERROR');
  });

  it('sets name to "RegistryError"', () => {
    const error = new RegistryError('Spec not found', { retryable: true });
    expect(error.name).toBe('RegistryError');
  });

  it('is an instance of PDFSpecError', () => {
    const error = new RegistryError('Spec not found', { retryable: true });
    expect(error instanceof PDFSpecError).toBe(true);
  });
});

// ========================================
// ContentError
// ========================================

describe('ContentError', () => {
  it('sets code to "CONTENT_ERROR"', () => {
    const error = new ContentError('Section not found', { retryable: true });
    expect(error.code).toBe('CONTENT_ERROR');
  });

  it('sets name to "ContentError"', () => {
    const error = new ContentError('Section not found', { retryable: true });
    expect(error.name).toBe('ContentError');
  });

  it('is an instance of PDFSpecError', () => {
    const error = new ContentError('Section not found', { retryable: true });
    expect(error instanceof PDFSpecError).toBe(true);
  });
});

// ========================================
// ToolPrerequisiteError
// ========================================

describe('ToolPrerequisiteError', () => {
  it('sets code to "PREREQUISITE_ERROR"', () => {
    const error = new ToolPrerequisiteError('Required spec not available');
    expect(error.code).toBe('PREREQUISITE_ERROR');
  });

  it('sets name to "ToolPrerequisiteError"', () => {
    const error = new ToolPrerequisiteError('Required spec not available');
    expect(error.name).toBe('ToolPrerequisiteError');
  });

  it('is an instance of PDFSpecError', () => {
    const error = new ToolPrerequisiteError('Required spec not available');
    expect(error instanceof PDFSpecError).toBe(true);
  });
});

describe('SPEC-PDFSPEC-COMMON-ERRORS-003 retryable はすべてのエラーに書く', () => {
  it('SPEC-PDFSPEC-COMMON-ERRORS-003 REGISTRY_ERROR と CONTENT_ERROR は常に再試行できない', () => {
    // 作る箇所から値を渡せない（第 2 引数に retryable を書いても使わない）
    const registry = new RegistryError('x', { retryable: true } as never);
    const content = new ContentError('x', { retryable: true } as never);
    expect(registry.retryable).toBe(false);
    expect(content.retryable).toBe(false);
  });
});
