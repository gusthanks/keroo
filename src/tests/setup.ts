import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// Vitest 5 reads custom matcher types only from `vitest.Matchers`, while
// jest-dom still augments the older `Assertion<T>` shape. Declare the DOM
// matchers (toBeInTheDocument, toHaveAttribute, ...) on the new interface.
// The first type argument is `any`, as in jest-dom's own vitest typings:
// referencing `expect.stringContaining` here would make Matchers circular.
declare module 'vitest' {
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
    extends TestingLibraryMatchers<any, R> {}
}
