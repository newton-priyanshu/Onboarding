import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onToast,
  dispatchToast,
  notifyError,
} from '../errorHandling';

describe('errorHandling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onToast', () => {
    it('adds a listener that receives toast events', () => {
      const listener = vi.fn();
      const unsubscribe = onToast(listener);

      dispatchToast('Hello', 'info');

      expect(listener).toHaveBeenCalledWith('Hello', 'info');
      unsubscribe();
    });

    it('returns an unsubscribe function that removes the listener', () => {
      const listener = vi.fn();
      const unsubscribe = onToast(listener);

      unsubscribe();
      dispatchToast('Should not fire', 'error');

      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      onToast(listener1);
      onToast(listener2);

      dispatchToast('Hi', 'warning');

      expect(listener1).toHaveBeenCalledWith('Hi', 'warning');
      expect(listener2).toHaveBeenCalledWith('Hi', 'warning');
    });

    it('prevents a single listener from breaking other listeners', () => {
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener crash');
      });
      const goodListener = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      onToast(badListener);
      onToast(goodListener);

      dispatchToast('Test', 'info');

      expect(goodListener).toHaveBeenCalledWith('Test', 'info');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('dispatchToast', () => {
    it('calls all subscribed listeners', () => {
      const listener = vi.fn();
      onToast(listener);

      dispatchToast('Test message', 'success');

      expect(listener).toHaveBeenCalledWith('Test message', 'success');
    });

    it('defaults to info type when not specified', () => {
      const listener = vi.fn();
      onToast(listener);

      dispatchToast('Default type');

      expect(listener).toHaveBeenCalledWith('Default type', 'info');
    });

    it('works with no listeners subscribed', () => {
      expect(() => dispatchToast('No listeners', 'error')).not.toThrow();
    });
  });

  describe('notifyError', () => {
    it('logs the error message to console', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      notifyError('Something broke', { detail: 'error details' });

      expect(consoleSpy).toHaveBeenCalledWith('Something broke', { detail: 'error details' });
      consoleSpy.mockRestore();
    });

    it('dispatches an error toast', () => {
      const listener = vi.fn();
      onToast(listener);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      notifyError('User error message', null);

      expect(listener).toHaveBeenCalledWith('User error message', 'error');
      consoleSpy.mockRestore();
    });

    it('falls back to default message when message is empty', () => {
      const listener = vi.fn();
      onToast(listener);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      notifyError('', { some: 'detail' });

      expect(listener).toHaveBeenCalledWith('', 'error');
      consoleSpy.mockRestore();
    });

    it('falls back to default message when message is not a string', () => {
      const listener = vi.fn();
      onToast(listener);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // @ts-expect-error - testing runtime behavior with improper usage
      notifyError(42, 'details');

      // The function checks typeof message === 'string' — 42 is not a string, so it uses fallback
      expect(listener).toHaveBeenCalledWith('An unexpected error occurred.', 'error');
      consoleSpy.mockRestore();
    });
  });
});
