// src/types/global.d.ts

// This file declares types for global variables.

interface TokenData {
  cookie: string;
  expires: number;
}

declare global {
  // We must use 'var' here because it's the correct way to declare a global
  // variable type in TypeScript's `.d.ts` files.
  //
  // To resolve the conflict with the 'no-var' ESLint rule, we disable
  // the rule for this specific line only. This is the standard and safest
  // way to handle such exceptions.
  // eslint-disable-next-line no-var
  var tempTokenStore: Map<string, TokenData> | undefined;
}

// This export statement is required to make this file a module, ensuring
// `declare global` works correctly. Do not remove it.
export {};
